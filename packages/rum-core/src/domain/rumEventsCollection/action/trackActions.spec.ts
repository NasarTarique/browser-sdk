import type { Context, ClocksState, Observable, Duration } from '@datadog/browser-core'
import { timeStampNow, resetExperimentalFeatures, updateExperimentalFeatures, relativeNow } from '@datadog/browser-core'
import type { Clock } from '../../../../../core/test/specHelper'
import { createNewEvent } from '../../../../../core/test/specHelper'
import type { TestSetupBuilder } from '../../../../test/specHelper'
import { setup } from '../../../../test/specHelper'
import { RumEventType, ActionType, FrustrationType } from '../../../rawRumEvent.types'
import type { RumEvent } from '../../../rumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import { PAGE_ACTIVITY_VALIDATION_DELAY } from '../../waitIdlePage'
import type { ActionContexts } from './actionCollection'
import type { AutoAction } from './trackActions'
import { AUTO_ACTION_MAX_DURATION, trackActions } from './trackActions'

// Used to wait some time after the creation of a action
const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = PAGE_ACTIVITY_VALIDATION_DELAY * 0.8
// A long delay used to wait after any action is finished.
const EXPIRE_DELAY = AUTO_ACTION_MAX_DURATION * 10

function eventsCollector<T>() {
  const events: T[] = []
  beforeEach(() => {
    events.length = 0
  })
  return {
    events,
    pushEvent: (event: T) => {
      events.push(event)
    },
  }
}

const RAW_ERROR_EVENT = { type: RumEventType.ERROR } as RumEvent & Context

describe('trackActions', () => {
  const { events, pushEvent } = eventsCollector<AutoAction>()
  let button: HTMLButtonElement
  let emptyElement: HTMLHRElement
  let input: HTMLInputElement
  let setupBuilder: TestSetupBuilder
  let findActionId: ActionContexts['findActionId']

  beforeEach(() => {
    button = document.createElement('button')
    button.type = 'button'
    button.appendChild(document.createTextNode('Click me'))
    document.body.appendChild(button)

    emptyElement = document.createElement('hr')
    document.body.appendChild(emptyElement)

    input = document.createElement('input')
    input.value = 'foo bar'
    document.body.appendChild(input)

    setupBuilder = setup()
      .withFakeClock()
      .beforeBuild(({ lifeCycle, domMutationObservable, configuration }) => {
        lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, pushEvent)
        const trackActionsResult = trackActions(lifeCycle, domMutationObservable, configuration)
        findActionId = trackActionsResult.actionContexts.findActionId
        return { stop: trackActionsResult.stop }
      })
  })

  afterEach(() => {
    button.parentNode!.removeChild(button)
    emptyElement.parentNode!.removeChild(emptyElement)
    input.parentNode!.removeChild(input)
    setupBuilder.cleanup()
  })

  it('starts a action when clicking on an element', () => {
    const { domMutationObservable, clock } = setupBuilder.build()
    emulateClickWithActivity(domMutationObservable, clock)
    expect(findActionId()).not.toBeUndefined()
    clock.tick(EXPIRE_DELAY)
    expect(events).toEqual([
      {
        counts: {
          errorCount: 0,
          longTaskCount: 0,
          resourceCount: 0,
        },
        duration: BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY as Duration,
        id: jasmine.any(String),
        name: 'Click me',
        startClocks: jasmine.any(Object),
        type: ActionType.CLICK,
        event: createNewEvent('click'),
        frustrationTypes: [],
      },
    ])
  })

  it('discards a pending action with a negative duration', () => {
    const { domMutationObservable, clock } = setupBuilder.build()
    emulateClickWithActivity(domMutationObservable, clock, button, -1)
    expect(findActionId()).not.toBeUndefined()
    clock.tick(EXPIRE_DELAY)

    expect(events).toEqual([])
    expect(findActionId()).toBeUndefined()
  })

  it('should keep track of previously validated actions', () => {
    const { domMutationObservable, clock } = setupBuilder.build()
    emulateClickWithActivity(domMutationObservable, clock)
    const actionStartTime = relativeNow()
    clock.tick(EXPIRE_DELAY)

    expect(findActionId(actionStartTime)).not.toBeUndefined()
  })

  it('counts errors occurring during the action', () => {
    const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()

    emulateClickWithActivity(domMutationObservable, clock)

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, RAW_ERROR_EVENT)
    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    domMutationObservable.notify()
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, RAW_ERROR_EVENT)

    clock.tick(EXPIRE_DELAY)
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, RAW_ERROR_EVENT)

    expect(events.length).toBe(1)
    const action = events[0]
    expect(action.counts).toEqual({
      errorCount: 2,
      longTaskCount: 0,
      resourceCount: 0,
    })
  })

  it('should take the name from user-configured attribute', () => {
    const { domMutationObservable, clock } = setupBuilder
      .withConfiguration({ actionNameAttribute: 'data-my-custom-attribute' })
      .build()

    button.setAttribute('data-my-custom-attribute', 'test-1')
    emulateClickWithActivity(domMutationObservable, clock)

    clock.tick(EXPIRE_DELAY)
    expect(events.length).toBe(1)
    expect(events[0].name).toBe('test-1')
  })

  describe('without frustration-signals flag', () => {
    it('discards pending action on view created', () => {
      const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()
      emulateClickWithActivity(domMutationObservable, clock)
      expect(findActionId()).not.toBeUndefined()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        id: 'fake',
        startClocks: jasmine.any(Object) as unknown as ClocksState,
      })
      clock.tick(EXPIRE_DELAY)

      expect(events).toEqual([])
      expect(findActionId()).toBeUndefined()
    })

    it('ignores any starting action while another one is ongoing', () => {
      const { domMutationObservable, clock } = setupBuilder.build()

      const firstClickTimeStamp = timeStampNow()
      emulateClickWithActivity(domMutationObservable, clock)
      emulateClickWithActivity(domMutationObservable, clock)

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(1)
      expect(events[0].startClocks.timeStamp).toBe(firstClickTimeStamp)
    })

    it('discards a action when nothing happens after a click', () => {
      const { clock } = setupBuilder.build()
      emulateClickWithoutActivity()

      clock.tick(EXPIRE_DELAY)
      expect(events).toEqual([])
      expect(findActionId()).toBeUndefined()
    })

    it('ignores a actions if it fails to find a name', () => {
      const { domMutationObservable, clock } = setupBuilder.build()
      emulateClickWithActivity(domMutationObservable, clock, emptyElement)
      expect(findActionId()).toBeUndefined()
      clock.tick(EXPIRE_DELAY)

      expect(events).toEqual([])
    })

    it('does not populate the frustrationTypes array', () => {
      const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()

      emulateClickWithActivity(domMutationObservable, clock)
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, RAW_ERROR_EVENT)

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(1)
      expect(events[0].frustrationTypes).toEqual([])
    })
  })

  describe('with frustration-signals flag', () => {
    beforeEach(() => {
      updateExperimentalFeatures(['frustration-signals'])
    })
    afterEach(() => {
      resetExperimentalFeatures()
    })

    it("doesn't discard pending action on view created", () => {
      const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()
      emulateClickWithActivity(domMutationObservable, clock)
      expect(findActionId()).not.toBeUndefined()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        id: 'fake',
        startClocks: jasmine.any(Object) as unknown as ClocksState,
      })
      clock.tick(EXPIRE_DELAY)

      expect(events.length).toBe(1)
    })

    it('collect actions even if another one is ongoing', () => {
      const { domMutationObservable, clock } = setupBuilder.build()

      const firstClickTimeStamp = timeStampNow()
      emulateClickWithActivity(domMutationObservable, clock)
      const secondClickTimeStamp = timeStampNow()
      emulateClickWithActivity(domMutationObservable, clock)

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(2)
      expect(events[0].startClocks.timeStamp).toBe(firstClickTimeStamp)
      expect(events[1].startClocks.timeStamp).toBe(secondClickTimeStamp)
    })

    it('collect actions even if nothing happens after a click (dead click)', () => {
      const { clock } = setupBuilder.build()
      emulateClickWithoutActivity()

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(1)
      expect(events[0].frustrationTypes).toEqual([FrustrationType.DEAD])
      expect(findActionId()).toEqual([])
    })

    it('collect actions even if it fails to find a name', () => {
      const { domMutationObservable, clock } = setupBuilder.build()
      emulateClickWithActivity(domMutationObservable, clock, emptyElement)
      expect(findActionId()!.length).toBeGreaterThan(0)
      clock.tick(EXPIRE_DELAY)

      expect(events.length).toBe(1)
    })

    describe('error clicks', () => {
      it('considers a "click with activity" followed by an error as an action with "error" frustration type', () => {
        const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()

        emulateClickWithActivity(domMutationObservable, clock)
        lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, RAW_ERROR_EVENT)

        clock.tick(EXPIRE_DELAY)
        expect(events.length).toBe(1)
        expect(events[0].frustrationTypes).toEqual([FrustrationType.ERROR])
      })

      // eslint-disable-next-line max-len
      it('considers a "click without activity" followed by an error as an action with "error" (and "dead") frustration type', () => {
        const { lifeCycle, clock } = setupBuilder.build()

        emulateClickWithoutActivity()
        lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, RAW_ERROR_EVENT)

        clock.tick(EXPIRE_DELAY)
        expect(events.length).toBe(1)
        expect(events[0].frustrationTypes).toEqual(
          jasmine.arrayWithExactContents([FrustrationType.ERROR, FrustrationType.DEAD])
        )
      })
    })

    describe('dead clicks', () => {
      it('considers a "click without activity" as a dead click', () => {
        const { clock } = setupBuilder.build()

        emulateClickWithoutActivity()

        clock.tick(EXPIRE_DELAY)
        expect(events.length).toBe(1)
        expect(events[0].frustrationTypes).toEqual([FrustrationType.DEAD])
      })
    })
  })

  function emulateClickWithActivity(
    domMutationObservable: Observable<void>,
    clock: Clock,
    target: HTMLElement = button,
    actionDuration: number = BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY
  ) {
    emulateClickWithoutActivity(target)
    clock.tick(actionDuration)
    // Since we don't collect dom mutations for this test, manually dispatch one
    domMutationObservable.notify()
  }

  function emulateClickWithoutActivity(target: HTMLElement = button) {
    const targetPosition = target.getBoundingClientRect()
    target.dispatchEvent(
      createNewEvent('click', {
        target,
        clientX: targetPosition.x + targetPosition.width / 2,
        clientY: targetPosition.y + targetPosition.height / 2,
      })
    )
  }
})
