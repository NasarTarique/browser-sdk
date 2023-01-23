import { clocksNow, Observable, timeStampNow } from '@datadog/browser-core'
import { createNewEvent } from '../../core/test/specHelper'
import type { Click, ClickActionBase } from '../src/domain/rumEventsCollection/action/trackClickActions'
import { ActionType } from '../src/rawRumEvent.types'

export type FakeClick = Readonly<ReturnType<typeof createFakeClick>>

export function createFakeClick({
  hasError = false,
  hasPageActivity = true,
  userActivity,
  event,
}: {
  hasError?: boolean
  hasPageActivity?: boolean
  userActivity?: { selection?: boolean; input?: boolean }
  event?: Partial<MouseEvent & { target: Element }>
} = {}) {
  const stopObservable = new Observable<void>()
  let isStopped = false

  function clone() {
    return createFakeClick({ userActivity, event })
  }

  const clickActionBase: ClickActionBase = {
    type: ActionType.CLICK,
    name: '',
  }

  return {
    stopObservable,
    isStopped: () => isStopped,
    stop: () => {
      isStopped = true
      stopObservable.notify()
    },
    discard: jasmine.createSpy(),
    validate: jasmine.createSpy(),
    startClocks: clocksNow(),
    hasError,
    hasPageActivity,
    getUserActivity: () => ({
      selection: false,
      input: false,
      ...userActivity,
    }),
    addFrustration: jasmine.createSpy<Click['addFrustration']>(),
    clone: jasmine.createSpy<typeof clone>().and.callFake(clone),

    event: createNewEvent('click', {
      clientX: 100,
      clientY: 100,
      timeStamp: timeStampNow(),
      target: document.body,
      ...event,
    }),
    clickActionBase,
  }
}
