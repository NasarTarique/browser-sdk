import type { StubStorage } from '../../../test'
import { mockClock, stubCookieProvider, stubLocalStorageProvider } from '../../../test'
import type { CookieOptions } from '../../browser/cookie'
import { initCookieStrategy } from './storeStrategies/sessionInCookie'
import { initLocalStorageStrategy } from './storeStrategies/sessionInLocalStorage'
import type { SessionState } from './sessionState'
import { expandSessionState, toSessionString } from './sessionState'
import {
  processSessionStoreOperations,
  isLockEnabled,
  LOCK_MAX_TRIES,
  LOCK_RETRY_DELAY,
} from './sessionStoreOperations'
import { SESSION_STORE_KEY } from './storeStrategies/sessionStoreStrategy'

const cookieOptions: CookieOptions = {}

;(
  [
    {
      title: 'Cookie Storage',
      sessionStoreStrategy: initCookieStrategy(cookieOptions),
      stubStorageProvider: stubCookieProvider,
      storageKey: SESSION_STORE_KEY,
    },
    {
      title: 'Local Storage',
      sessionStoreStrategy: initLocalStorageStrategy(),
      stubStorageProvider: stubLocalStorageProvider,
      storageKey: SESSION_STORE_KEY,
    },
  ] as const
).forEach(({ title, sessionStoreStrategy, stubStorageProvider, storageKey }) => {
  describe(`process operations mechanism with ${title}`, () => {
    let initialSession: SessionState
    let otherSession: SessionState
    let processSpy: jasmine.Spy<jasmine.Func>
    let afterSpy: jasmine.Spy<jasmine.Func>
    let stubStorage: StubStorage

    beforeEach(() => {
      sessionStoreStrategy.clearSession()
      initialSession = { id: '123', created: '0' }
      otherSession = { id: '456', created: '100' }
      processSpy = jasmine.createSpy('process')
      afterSpy = jasmine.createSpy('after')
      stubStorage = stubStorageProvider.get()
    })

    describe('with lock access disabled', () => {
      beforeEach(() => {
        isLockEnabled() && pending('lock-access required')
      })

      it('should persist session when process returns a value', () => {
        sessionStoreStrategy.persistSession(initialSession)
        processSpy.and.returnValue({ ...otherSession })

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

        expect(processSpy).toHaveBeenCalledWith(initialSession)
        const expectedSession = { ...otherSession, expire: jasmine.any(String) }
        expect(sessionStoreStrategy.retrieveSession()).toEqual(expectedSession)
        expect(afterSpy).toHaveBeenCalledWith(expectedSession)
      })

      it('should clear session when process returns an empty value', () => {
        sessionStoreStrategy.persistSession(initialSession)
        processSpy.and.returnValue({})

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

        expect(processSpy).toHaveBeenCalledWith(initialSession)
        const expectedSession = {}
        expect(sessionStoreStrategy.retrieveSession()).toEqual(expectedSession)
        expect(afterSpy).toHaveBeenCalledWith(expectedSession)
      })

      it('should not persist session when process returns undefined', () => {
        sessionStoreStrategy.persistSession(initialSession)
        processSpy.and.returnValue(undefined)

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

        expect(processSpy).toHaveBeenCalledWith(initialSession)
        expect(sessionStoreStrategy.retrieveSession()).toEqual(initialSession)
        expect(afterSpy).toHaveBeenCalledWith(initialSession)
      })

      it('LOCK_MAX_TRIES value should not influence the behavior when lock mechanism is not enabled', () => {
        sessionStoreStrategy.persistSession(initialSession)
        processSpy.and.returnValue({ ...otherSession })

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy, LOCK_MAX_TRIES)

        expect(processSpy).toHaveBeenCalledWith(initialSession)
        const expectedSession = { ...otherSession, expire: jasmine.any(String) }
        expect(sessionStoreStrategy.retrieveSession()).toEqual(expectedSession)
        expect(afterSpy).toHaveBeenCalledWith(expectedSession)
      })
    })

    describe('with lock access enabled', () => {
      beforeEach(() => {
        !isLockEnabled() && pending('lock-access not enabled')
      })

      it('should persist session when process returns a value', () => {
        sessionStoreStrategy.persistSession(initialSession)
        processSpy.and.callFake((session) => ({ ...otherSession, lock: session.lock }))

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

        expect(processSpy).toHaveBeenCalledWith({ ...initialSession, lock: jasmine.any(String) })
        const expectedSession = { ...otherSession, expire: jasmine.any(String) }
        expect(sessionStoreStrategy.retrieveSession()).toEqual(expectedSession)
        expect(afterSpy).toHaveBeenCalledWith(expectedSession)
      })

      it('should clear session when process returns an empty value', () => {
        sessionStoreStrategy.persistSession(initialSession)
        processSpy.and.returnValue({})

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

        expect(processSpy).toHaveBeenCalledWith({ ...initialSession, lock: jasmine.any(String) })
        const expectedSession = {}
        expect(sessionStoreStrategy.retrieveSession()).toEqual(expectedSession)
        expect(afterSpy).toHaveBeenCalledWith(expectedSession)
      })

      it('should not persist session when process returns undefined', () => {
        sessionStoreStrategy.persistSession(initialSession)
        processSpy.and.returnValue(undefined)

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

        expect(processSpy).toHaveBeenCalledWith({ ...initialSession, lock: jasmine.any(String) })
        expect(sessionStoreStrategy.retrieveSession()).toEqual(initialSession)
        expect(afterSpy).toHaveBeenCalledWith(initialSession)
      })

      type OnLockCheck = () => { currentState: SessionState; retryState: SessionState }

      function lockScenario({
        onInitialLockCheck,
        onAcquiredLockCheck,
        onPostProcessLockCheck,
        onPostPersistLockCheck,
      }: {
        onInitialLockCheck?: OnLockCheck
        onAcquiredLockCheck?: OnLockCheck
        onPostProcessLockCheck?: OnLockCheck
        onPostPersistLockCheck?: OnLockCheck
      }) {
        const onLockChecks = [onInitialLockCheck, onAcquiredLockCheck, onPostProcessLockCheck, onPostPersistLockCheck]
        stubStorage.getSpy.and.callFake(() => {
          const currentOnLockCheck = onLockChecks.shift()
          if (!currentOnLockCheck) {
            return stubStorage.currentValue(storageKey)
          }
          const { currentState, retryState } = currentOnLockCheck()
          stubStorage.setCurrentValue(storageKey, toSessionString(retryState))
          return buildSessionString(currentState)
        })
      }

      function buildSessionString(currentState: SessionState) {
        return `${storageKey}=${toSessionString(currentState)}`
      }

      ;[
        {
          description: 'should wait for lock to be free',
          lockConflict: 'onInitialLockCheck',
        },
        {
          description: 'should retry if lock was acquired before process',
          lockConflict: 'onAcquiredLockCheck',
        },
        {
          description: 'should retry if lock was acquired after process',
          lockConflict: 'onPostProcessLockCheck',
        },
        {
          description: 'should retry if lock was acquired after persist',
          lockConflict: 'onPostPersistLockCheck',
        },
      ].forEach(({ description, lockConflict }) => {
        it(description, (done) => {
          lockScenario({
            [lockConflict]: () => ({
              currentState: { ...initialSession, lock: 'locked' },
              retryState: { ...initialSession, other: 'other' },
            }),
          })
          expandSessionState(initialSession)
          sessionStoreStrategy.persistSession(initialSession)
          processSpy.and.callFake((session) => ({ ...session, processed: 'processed' } as SessionState))

          processSessionStoreOperations(
            {
              process: processSpy,
              after: (afterSession) => {
                // session with 'other' value on process
                expect(processSpy).toHaveBeenCalledWith({
                  ...initialSession,
                  other: 'other',
                  lock: jasmine.any(String),
                  expire: jasmine.any(String),
                })

                // end state with session 'other' and 'processed' value
                const expectedSession = {
                  ...initialSession,
                  other: 'other',
                  processed: 'processed',
                  expire: jasmine.any(String),
                }
                expect(sessionStoreStrategy.retrieveSession()).toEqual(expectedSession)
                expect(afterSession).toEqual(expectedSession)
                done()
              },
            },
            sessionStoreStrategy
          )
        })
      })

      it('should abort after a max number of retry', () => {
        const clock = mockClock()

        sessionStoreStrategy.persistSession(initialSession)
        stubStorage.setSpy.calls.reset()

        stubStorage.getSpy.and.returnValue(buildSessionString({ ...initialSession, lock: 'locked' }))
        processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

        const lockMaxTries = isLockEnabled() ? LOCK_MAX_TRIES : 0
        const lockRetryDelay = isLockEnabled() ? LOCK_RETRY_DELAY : 0

        clock.tick(lockMaxTries * lockRetryDelay)
        expect(processSpy).not.toHaveBeenCalled()
        expect(afterSpy).not.toHaveBeenCalled()
        expect(stubStorage.setSpy).not.toHaveBeenCalled()

        clock.cleanup()
      })

      it('should execute cookie accesses in order', (done) => {
        lockScenario({
          onInitialLockCheck: () => ({
            currentState: { ...initialSession, lock: 'locked' }, // force to retry the first access later
            retryState: initialSession,
          }),
        })
        sessionStoreStrategy.persistSession(initialSession)

        processSessionStoreOperations(
          {
            process: (session) => ({ ...session, value: 'foo' }),
            after: afterSpy,
          },
          sessionStoreStrategy
        )
        processSessionStoreOperations(
          {
            process: (session) => ({ ...session, value: `${session.value || ''}bar` }),
            after: (session) => {
              expect(session.value).toBe('foobar')
              expect(afterSpy).toHaveBeenCalled()
              done()
            },
          },
          sessionStoreStrategy
        )
      })
    })
  })
})
