import { createNewEvent, mockClock, restorePageVisibility, setPageVisibility } from '../../../test'
import type { Clock } from '../../../test'
import { getCookie, setCookie } from '../../browser/cookie'
import type { RelativeTime } from '../../tools/utils/timeUtils'
import { isIE } from '../../tools/utils/browserDetection'
import { DOM_EVENT } from '../../browser/addEventListener'
import { ONE_HOUR, ONE_SECOND } from '../../tools/utils/timeUtils'
import type { SessionManager } from './sessionManager'
import { startSessionManager, stopSessionManager, VISIBILITY_CHECK_DELAY } from './sessionManager'
import { SESSION_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY } from './sessionConstants'
import type { SessionStoreStrategyType } from './storeStrategies/sessionStoreStrategy'
import { SESSION_STORE_KEY } from './storeStrategies/sessionStoreStrategy'
import { STORAGE_POLL_DELAY } from './sessionStore'

const enum FakeTrackingType {
  NOT_TRACKED = 'not-tracked',
  TRACKED = 'tracked',
}

const TRACKED_SESSION_STATE = {
  isTracked: true,
  trackingType: FakeTrackingType.TRACKED,
}

const NOT_TRACKED_SESSION_STATE = {
  isTracked: false,
  trackingType: FakeTrackingType.NOT_TRACKED,
}

describe('startSessionManager', () => {
  const DURATION = 123456
  const FIRST_PRODUCT_KEY = 'first'
  const SECOND_PRODUCT_KEY = 'second'
  const STORE_TYPE: SessionStoreStrategyType = { type: 'Cookie', cookieOptions: {} }
  let clock: Clock

  function expireSessionCookie() {
    setCookie(SESSION_STORE_KEY, '', DURATION)
    clock.tick(STORAGE_POLL_DELAY)
  }

  function expectSessionIdToBe(sessionManager: SessionManager<FakeTrackingType>, sessionId: string) {
    expect(sessionManager.findActiveSession()!.id).toBe(sessionId)
    expect(getCookie(SESSION_STORE_KEY)).toContain(`id=${sessionId}`)
  }

  function expectSessionIdToBeDefined(sessionManager: SessionManager<FakeTrackingType>) {
    expect(sessionManager.findActiveSession()!.id).toMatch(/^[a-f0-9-]+$/)
    expect(getCookie(SESSION_STORE_KEY)).toMatch(/id=[a-f0-9-]+/)
  }

  function expectSessionIdToNotBeDefined(sessionManager: SessionManager<FakeTrackingType>) {
    expect(sessionManager.findActiveSession()?.id).toBeUndefined()
    expect(getCookie(SESSION_STORE_KEY)).not.toContain('id=')
  }

  function expectTrackingTypeToBe(
    sessionManager: SessionManager<FakeTrackingType>,
    productKey: string,
    trackingType: FakeTrackingType
  ) {
    expect(sessionManager.findActiveSession()!.trackingType).toEqual(trackingType)
    expect(getCookie(SESSION_STORE_KEY)).toContain(`${productKey}=${trackingType}`)
  }

  function expectTrackingTypeToNotBeDefined(sessionManager: SessionManager<FakeTrackingType>, productKey: string) {
    expect(sessionManager.findActiveSession()?.trackingType).toBeUndefined()
    expect(getCookie(SESSION_STORE_KEY)).not.toContain(`${productKey}=`)
  }

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    clock = mockClock()
  })

  afterEach(() => {
    // remove intervals first
    stopSessionManager()
    // flush pending callbacks to avoid random failures
    clock.tick(ONE_HOUR)
    clock.cleanup()
  })

  describe('cookie management', () => {
    it('when tracked, should store tracking type and session id', () => {
      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)

      expectSessionIdToBeDefined(sessionManager)
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.TRACKED)
    })

    it('when not tracked should store tracking type', () => {
      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => NOT_TRACKED_SESSION_STATE)

      expectSessionIdToNotBeDefined(sessionManager)
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)
    })

    it('when tracked should keep existing tracking type and session id', () => {
      setCookie(SESSION_STORE_KEY, 'id=abcdef&first=tracked', DURATION)

      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)

      expectSessionIdToBe(sessionManager, 'abcdef')
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.TRACKED)
    })

    it('when not tracked should keep existing tracking type', () => {
      setCookie(SESSION_STORE_KEY, 'first=not-tracked', DURATION)

      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => NOT_TRACKED_SESSION_STATE)

      expectSessionIdToNotBeDefined(sessionManager)
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)
    })
  })

  describe('computeSessionState', () => {
    let spy: (rawTrackingType?: string) => { trackingType: FakeTrackingType; isTracked: boolean }

    beforeEach(() => {
      spy = jasmine.createSpy().and.returnValue(TRACKED_SESSION_STATE)
    })

    it('should be called with an empty value if the cookie is not defined', () => {
      startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, spy)
      expect(spy).toHaveBeenCalledWith(undefined)
    })

    it('should be called with an invalid value if the cookie has an invalid value', () => {
      setCookie(SESSION_STORE_KEY, 'first=invalid', DURATION)
      startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, spy)
      expect(spy).toHaveBeenCalledWith('invalid')
    })

    it('should be called with TRACKED', () => {
      setCookie(SESSION_STORE_KEY, 'first=tracked', DURATION)
      startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, spy)
      expect(spy).toHaveBeenCalledWith(FakeTrackingType.TRACKED)
    })

    it('should be called with NOT_TRACKED', () => {
      setCookie(SESSION_STORE_KEY, 'first=not-tracked', DURATION)
      startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, spy)
      expect(spy).toHaveBeenCalledWith(FakeTrackingType.NOT_TRACKED)
    })
  })

  describe('session renewal', () => {
    it('should renew on activity after expiration', () => {
      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)
      const renewSessionSpy = jasmine.createSpy()
      sessionManager.renewObservable.subscribe(renewSessionSpy)

      expireSessionCookie()

      expect(renewSessionSpy).not.toHaveBeenCalled()
      expectSessionIdToNotBeDefined(sessionManager)
      expectTrackingTypeToNotBeDefined(sessionManager, FIRST_PRODUCT_KEY)

      document.dispatchEvent(new CustomEvent('click'))

      expect(renewSessionSpy).toHaveBeenCalled()
      expectSessionIdToBeDefined(sessionManager)
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.TRACKED)
    })

    it('should not renew on visibility after expiration', () => {
      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)
      const renewSessionSpy = jasmine.createSpy()
      sessionManager.renewObservable.subscribe(renewSessionSpy)

      expireSessionCookie()

      clock.tick(VISIBILITY_CHECK_DELAY)

      expect(renewSessionSpy).not.toHaveBeenCalled()
      expectSessionIdToNotBeDefined(sessionManager)
    })
  })

  describe('multiple startSessionManager calls', () => {
    it('should re-use the same session id', () => {
      const firstSessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)
      const idA = firstSessionManager.findActiveSession()!.id

      const secondSessionManager = startSessionManager(STORE_TYPE, SECOND_PRODUCT_KEY, () => TRACKED_SESSION_STATE)
      const idB = secondSessionManager.findActiveSession()!.id

      expect(idA).toBe(idB)
    })

    it('should not erase other session type', () => {
      startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)

      // schedule an expandOrRenewSession
      document.dispatchEvent(new CustomEvent('click'))

      clock.tick(STORAGE_POLL_DELAY / 2)

      // expand first session cookie cache
      document.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE))

      startSessionManager(STORE_TYPE, SECOND_PRODUCT_KEY, () => TRACKED_SESSION_STATE)

      // cookie correctly set
      expect(getCookie(SESSION_STORE_KEY)).toContain('first')
      expect(getCookie(SESSION_STORE_KEY)).toContain('second')

      clock.tick(STORAGE_POLL_DELAY / 2)

      // scheduled expandOrRenewSession should not use cached value
      expect(getCookie(SESSION_STORE_KEY)).toContain('first')
      expect(getCookie(SESSION_STORE_KEY)).toContain('second')
    })

    it('should have independent tracking types', () => {
      const firstSessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)
      const secondSessionManager = startSessionManager(STORE_TYPE, SECOND_PRODUCT_KEY, () => NOT_TRACKED_SESSION_STATE)

      expect(firstSessionManager.findActiveSession()!.trackingType).toEqual(FakeTrackingType.TRACKED)
      expect(secondSessionManager.findActiveSession()!.trackingType).toEqual(FakeTrackingType.NOT_TRACKED)
    })

    it('should notify each expire and renew observables', () => {
      const firstSessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)
      const expireSessionASpy = jasmine.createSpy()
      firstSessionManager.expireObservable.subscribe(expireSessionASpy)
      const renewSessionASpy = jasmine.createSpy()
      firstSessionManager.renewObservable.subscribe(renewSessionASpy)

      const secondSessionManager = startSessionManager(STORE_TYPE, SECOND_PRODUCT_KEY, () => TRACKED_SESSION_STATE)
      const expireSessionBSpy = jasmine.createSpy()
      secondSessionManager.expireObservable.subscribe(expireSessionBSpy)
      const renewSessionBSpy = jasmine.createSpy()
      secondSessionManager.renewObservable.subscribe(renewSessionBSpy)

      expireSessionCookie()

      expect(expireSessionASpy).toHaveBeenCalled()
      expect(expireSessionBSpy).toHaveBeenCalled()
      expect(renewSessionASpy).not.toHaveBeenCalled()
      expect(renewSessionBSpy).not.toHaveBeenCalled()

      document.dispatchEvent(new CustomEvent('click'))

      expect(renewSessionASpy).toHaveBeenCalled()
      expect(renewSessionBSpy).toHaveBeenCalled()
    })
  })

  describe('session timeout', () => {
    it('should expire the session when the time out delay is reached', () => {
      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      expect(sessionManager.findActiveSession()).toBeDefined()
      expect(getCookie(SESSION_STORE_KEY)).toBeDefined()

      clock.tick(SESSION_TIME_OUT_DELAY)
      expect(sessionManager.findActiveSession()).toBeUndefined()
      expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should renew an existing timed out session', () => {
      setCookie(SESSION_STORE_KEY, `id=abcde&first=tracked&created=${Date.now() - SESSION_TIME_OUT_DELAY}`, DURATION)

      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      expect(sessionManager.findActiveSession()!.id).not.toBe('abcde')
      expect(getCookie(SESSION_STORE_KEY)).toContain(`created=${Date.now()}`)
      expect(expireSessionSpy).not.toHaveBeenCalled() // the session has not been active from the start
    })

    it('should not add created date to an existing session from an older versions', () => {
      setCookie(SESSION_STORE_KEY, 'id=abcde&first=tracked', DURATION)

      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)

      expect(sessionManager.findActiveSession()!.id).toBe('abcde')
      expect(getCookie(SESSION_STORE_KEY)).not.toContain('created=')
    })
  })

  describe('automatic session expiration', () => {
    beforeEach(() => {
      setPageVisibility('hidden')
    })

    afterEach(() => {
      restorePageVisibility()
    })

    it('should expire the session after expiration delay', () => {
      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      expectSessionIdToBeDefined(sessionManager)

      clock.tick(SESSION_EXPIRATION_DELAY)
      expectSessionIdToNotBeDefined(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should expand duration on activity', () => {
      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      expectSessionIdToBeDefined(sessionManager)

      clock.tick(SESSION_EXPIRATION_DELAY - 10)
      document.dispatchEvent(new CustomEvent('click'))

      clock.tick(10)
      expectSessionIdToBeDefined(sessionManager)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(SESSION_EXPIRATION_DELAY)
      expectSessionIdToNotBeDefined(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should expand not tracked session duration on activity', () => {
      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => NOT_TRACKED_SESSION_STATE)
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)

      clock.tick(SESSION_EXPIRATION_DELAY - 10)
      document.dispatchEvent(new CustomEvent('click'))

      clock.tick(10)
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(SESSION_EXPIRATION_DELAY)
      expectTrackingTypeToNotBeDefined(sessionManager, FIRST_PRODUCT_KEY)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should expand session on visibility', () => {
      setPageVisibility('visible')

      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      clock.tick(3 * VISIBILITY_CHECK_DELAY)
      setPageVisibility('hidden')
      expectSessionIdToBeDefined(sessionManager)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(SESSION_EXPIRATION_DELAY - 10)
      expectSessionIdToBeDefined(sessionManager)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(10)
      expectSessionIdToNotBeDefined(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should expand not tracked session on visibility', () => {
      setPageVisibility('visible')

      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => NOT_TRACKED_SESSION_STATE)
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      clock.tick(3 * VISIBILITY_CHECK_DELAY)
      setPageVisibility('hidden')
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(SESSION_EXPIRATION_DELAY - 10)
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(10)
      expectTrackingTypeToNotBeDefined(sessionManager, FIRST_PRODUCT_KEY)
      expect(expireSessionSpy).toHaveBeenCalled()
    })
  })

  describe('manual session expiration', () => {
    it('expires the session when calling expire()', () => {
      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      sessionManager.expire()

      expectSessionIdToNotBeDefined(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('notifies expired session only once when calling expire() multiple times', () => {
      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      sessionManager.expire()
      sessionManager.expire()

      expectSessionIdToNotBeDefined(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalledTimes(1)
    })

    it('notifies expired session only once when calling expire() after the session has been expired', () => {
      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      clock.tick(SESSION_EXPIRATION_DELAY)
      sessionManager.expire()

      expectSessionIdToNotBeDefined(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalledTimes(1)
    })

    it('renew the session on user activity', () => {
      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)
      clock.tick(STORAGE_POLL_DELAY)

      sessionManager.expire()

      document.dispatchEvent(new CustomEvent('click'))

      expectSessionIdToBeDefined(sessionManager)
    })
  })

  describe('session history', () => {
    it('should return undefined when there is no current session and no startTime', () => {
      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)
      expireSessionCookie()

      expect(sessionManager.findActiveSession()).toBeUndefined()
    })

    it('should return the current session context when there is no start time', () => {
      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)

      expect(sessionManager.findActiveSession()!.id).toBeDefined()
      expect(sessionManager.findActiveSession()!.trackingType).toBeDefined()
    })

    it('should return the session context corresponding to startTime', () => {
      const sessionManager = startSessionManager(STORE_TYPE, FIRST_PRODUCT_KEY, () => TRACKED_SESSION_STATE)

      // 0s to 10s: first session
      clock.tick(10 * ONE_SECOND - STORAGE_POLL_DELAY)
      const firstSessionId = sessionManager.findActiveSession()!.id
      const firstSessionTrackingType = sessionManager.findActiveSession()!.trackingType
      expireSessionCookie()

      // 10s to 20s: no session
      clock.tick(10 * ONE_SECOND)

      // 20s to end: second session
      document.dispatchEvent(new CustomEvent('click'))
      clock.tick(10 * ONE_SECOND)
      const secondSessionId = sessionManager.findActiveSession()!.id
      const secondSessionTrackingType = sessionManager.findActiveSession()!.trackingType

      expect(sessionManager.findActiveSession((5 * ONE_SECOND) as RelativeTime)!.id).toBe(firstSessionId)
      expect(sessionManager.findActiveSession((5 * ONE_SECOND) as RelativeTime)!.trackingType).toBe(
        firstSessionTrackingType
      )
      expect(sessionManager.findActiveSession((15 * ONE_SECOND) as RelativeTime)).toBeUndefined()
      expect(sessionManager.findActiveSession((25 * ONE_SECOND) as RelativeTime)!.id).toBe(secondSessionId)
      expect(sessionManager.findActiveSession((25 * ONE_SECOND) as RelativeTime)!.trackingType).toBe(
        secondSessionTrackingType
      )
    })
  })
})
