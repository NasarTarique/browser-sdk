import { DefaultPrivacyLevel, isIE, noop, relativeNow, timeStampNow } from '@datadog/browser-core'
import type { RawRumActionEvent, RumConfiguration } from '@datadog/browser-rum-core'
import { ActionType, LifeCycle, LifeCycleEventType, RumEventType, FrustrationType } from '@datadog/browser-rum-core'
import type { RawRumEventCollectedData } from 'packages/rum-core/src/domain/lifeCycle'
import { createNewEvent, isFirefox } from '../../../../core/test/specHelper'
import { NodePrivacyLevel, PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT } from '../../constants'
import { IncrementalSource, MouseInteractionType, RecordType } from '../../types'
import type { FrustrationCallback, InputCallback, MouseInteractionCallBack, StyleSheetCallback } from './observers'
import {
  initStyleSheetObserver,
  initFrustrationObserver,
  initInputObserver,
  initMouseInteractionObserver,
} from './observers'
import { serializeDocument, SerializationContextStatus } from './serialize'
import { createElementsScrollPositions } from './elementsScrollPositions'
import type { ShadowRootsController } from './shadowRootsController'

const DEFAULT_SHADOW_ROOT_CONTROLLER: ShadowRootsController = {
  flush: noop,
  stop: noop,
  addShadowRoot: noop,
  removeShadowRoot: noop,
}

const DEFAULT_CONFIGURATION = { defaultPrivacyLevel: NodePrivacyLevel.ALLOW } as RumConfiguration

describe('initInputObserver', () => {
  let stopInputObserver: () => void
  let inputCallbackSpy: jasmine.Spy<InputCallback>
  let sandbox: HTMLElement
  let input: HTMLInputElement

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    inputCallbackSpy = jasmine.createSpy()

    sandbox = document.createElement('div')
    input = document.createElement('input')
    sandbox.appendChild(input)
    document.body.appendChild(sandbox)

    serializeDocument(document, DEFAULT_CONFIGURATION, {
      shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      elementsScrollPositions: createElementsScrollPositions(),
    })
  })

  afterEach(() => {
    stopInputObserver()
    sandbox.remove()
  })

  it('collects input values when an "input" event is dispatched', () => {
    stopInputObserver = initInputObserver(inputCallbackSpy, DefaultPrivacyLevel.ALLOW)
    dispatchInputEvent('foo')

    expect(inputCallbackSpy).toHaveBeenCalledOnceWith({
      text: 'foo',
      id: jasmine.any(Number) as unknown as number,
    })
  })

  // cannot trigger a event in a Shadow DOM because event with `isTrusted:false` do not cross the root
  it('collects input values when an "input" event is composed', () => {
    stopInputObserver = initInputObserver(inputCallbackSpy, DefaultPrivacyLevel.ALLOW)
    dispatchInputEventWithInShadowDom('foo')

    expect(inputCallbackSpy).toHaveBeenCalledOnceWith({
      text: 'foo',
      id: jasmine.any(Number) as unknown as number,
    })
  })

  it('masks input values according to the element privacy level', () => {
    stopInputObserver = initInputObserver(inputCallbackSpy, DefaultPrivacyLevel.ALLOW)
    sandbox.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT)

    dispatchInputEvent('foo')

    expect((inputCallbackSpy.calls.first().args[0] as { text?: string }).text).toBe('***')
  })

  it('masks input values according to a parent element privacy level', () => {
    stopInputObserver = initInputObserver(inputCallbackSpy, DefaultPrivacyLevel.ALLOW)
    input.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT)

    dispatchInputEvent('foo')

    expect((inputCallbackSpy.calls.first().args[0] as { text?: string }).text).toBe('***')
  })

  it('masks input values according to a the default privacy level', () => {
    stopInputObserver = initInputObserver(inputCallbackSpy, DefaultPrivacyLevel.MASK)

    dispatchInputEvent('foo')

    expect((inputCallbackSpy.calls.first().args[0] as { text?: string }).text).toBe('***')
  })

  function dispatchInputEvent(newValue: string) {
    input.value = newValue
    input.dispatchEvent(createNewEvent('input', { target: input }))
  }

  function dispatchInputEventWithInShadowDom(newValue: string) {
    input.value = newValue
    const host = document.createElement('div')
    host.attachShadow({ mode: 'open' })
    const event = createNewEvent('input', { target: host, composed: true })
    event.composedPath = () => [input, host, sandbox, document.body]
    input.dispatchEvent(event)
  }
})

describe('initFrustrationObserver', () => {
  const lifeCycle = new LifeCycle()
  let stopFrustrationObserver: () => void
  let frustrationsCallbackSpy: jasmine.Spy<FrustrationCallback>
  let mouseEvent: MouseEvent
  let rumData: RawRumEventCollectedData<RawRumActionEvent>

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    mouseEvent = new MouseEvent('click')
    frustrationsCallbackSpy = jasmine.createSpy()

    rumData = {
      startTime: relativeNow(),
      rawRumEvent: {
        date: timeStampNow(),
        type: RumEventType.ACTION,
        action: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          type: ActionType.CLICK,
          frustration: {
            type: [FrustrationType.DEAD_CLICK],
          },
          target: {
            name: '123e4567-e89b-12d3-a456-426614174000',
          },
        },
      },
      domainContext: { event: mouseEvent, events: [mouseEvent] },
    }
  })

  afterEach(() => {
    stopFrustrationObserver()
  })

  it('calls callback if the raw data inserted is a click action', () => {
    stopFrustrationObserver = initFrustrationObserver(lifeCycle, frustrationsCallbackSpy)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    const frustrationRecord = frustrationsCallbackSpy.calls.first().args[0]
    expect(frustrationRecord.type).toEqual(RecordType.FrustrationRecord)
    expect(frustrationRecord.timestamp).toEqual(rumData.rawRumEvent.date)
    expect(frustrationRecord.data.frustrationTypes).toEqual(rumData.rawRumEvent.action.frustration!.type)
  })

  it('ignores events other than click actions', () => {
    rumData.rawRumEvent.action.type = ActionType.CUSTOM
    stopFrustrationObserver = initFrustrationObserver(lifeCycle, frustrationsCallbackSpy)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    expect(frustrationsCallbackSpy).not.toHaveBeenCalled()
  })

  it('ignores click actions without frustrations', () => {
    rumData.rawRumEvent.action.frustration = { type: [] }

    stopFrustrationObserver = initFrustrationObserver(lifeCycle, frustrationsCallbackSpy)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    expect(frustrationsCallbackSpy).not.toHaveBeenCalled()
  })

  it('ignores click actions which are missing the original mouse events', () => {
    rumData.domainContext = {}

    stopFrustrationObserver = initFrustrationObserver(lifeCycle, frustrationsCallbackSpy)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    expect(frustrationsCallbackSpy).not.toHaveBeenCalled()
  })
})

describe('initStyleSheetObserver', () => {
  let stopStyleSheetObserver: () => void
  let styleSheetCallbackSpy: jasmine.Spy<StyleSheetCallback>
  let styleElement: HTMLStyleElement
  let styleSheet: CSSStyleSheet
  const styleRule = '.selector-1 { color: #fff }'

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    styleSheetCallbackSpy = jasmine.createSpy()
    styleElement = document.createElement('style')
    document.head.appendChild(styleElement)
    styleSheet = styleElement.sheet!

    serializeDocument(document, DEFAULT_CONFIGURATION, {
      shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      elementsScrollPositions: createElementsScrollPositions(),
    })
  })

  afterEach(() => {
    stopStyleSheetObserver()
    styleElement.remove()
  })

  describe('observing high level css stylesheet', () => {
    describe('when inserting rules into stylesheet', () => {
      it('should capture CSSStyleRule insertion when no index is provided', () => {
        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        styleSheet.insertRule(styleRule)

        const styleSheetRule = styleSheetCallbackSpy.calls.first().args[0]
        expect(styleSheetRule.id).toBeDefined()
        expect(styleSheetRule.removes).toBeUndefined()
        expect(styleSheetRule.adds?.length).toEqual(1)
        expect(styleSheetRule.adds?.[0]?.index).toEqual(undefined)
      })

      it('should capture CSSStyleRule insertion when index is provided', () => {
        const index = 0

        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        styleSheet.insertRule(styleRule, index)

        const styleSheetRule = styleSheetCallbackSpy.calls.first().args[0]
        expect(styleSheetRule.id).toBeDefined()
        expect(styleSheetRule.removes).toBeUndefined()
        expect(styleSheetRule.adds?.length).toEqual(1)
        expect(styleSheetRule.adds?.[0]?.index).toEqual(index)
      })
    })

    describe('when removing rules from stylesheet', () => {
      it('should capture CSSStyleRule removal with the correct index', () => {
        styleSheet.insertRule(styleRule)
        const index = 0

        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        styleSheet.deleteRule(index)

        const styleSheetRule = styleSheetCallbackSpy.calls.first().args[0]
        expect(styleSheetRule.id).toBeDefined()
        expect(styleSheetRule.adds).toBeUndefined()
        expect(styleSheetRule.removes?.length).toEqual(1)
        expect(styleSheetRule.removes?.[0]).toEqual({ index })
      })
    })
  })

  describe('observing CSSGroupingRules inside a CSSStyleSheet', () => {
    describe('when inserting CSSRules inside a CSSGroupingRule', () => {
      it('should capture CSSRule with the correct path when no index is provided', () => {
        styleSheet.insertRule('@media cond-2 { @media cond-1 { .nest-1 { color: #ccc } } }')
        styleSheet.insertRule('.main {opacity: 0}')
        const groupingRule = (styleSheet.cssRules[1] as CSSGroupingRule).cssRules[0] as CSSGroupingRule

        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        groupingRule.insertRule(styleRule, 1)

        const styleSheetRule = styleSheetCallbackSpy.calls.first().args[0]
        expect(styleSheetRule.id).toBeDefined()
        expect(styleSheetRule.removes).toBeUndefined()
        expect(styleSheetRule.adds?.length).toEqual(1)
        expect(styleSheetRule.adds?.[0]?.index).toEqual([1, 0, 1])
      })

      it('should not create record when inserting into a detached CSSGroupingRule', () => {
        if (isFirefox()) {
          pending('Firefox does not support inserting rules in detached group')
        }

        styleSheet.insertRule('@media cond-2 { @media cond-1 { .nest-1 { color: #ccc } } }')

        const parentRule = styleSheet.cssRules[0] as CSSGroupingRule
        const groupingRule = parentRule.cssRules[0] as CSSGroupingRule
        parentRule.deleteRule(0)

        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        groupingRule.insertRule(styleRule, 0)

        expect(styleSheetCallbackSpy).not.toHaveBeenCalled()
      })
    })

    describe('when removing CSSRules from a CSSGroupingRule', () => {
      it('should capture CSSRule removal with the correct path', () => {
        styleSheet.insertRule('@media cond-2 { @media cond-1 { .nest-1 { color: #ccc } } }')
        styleSheet.insertRule('.main {opacity: 0}')
        const groupingRule = (styleSheet.cssRules[1] as CSSGroupingRule).cssRules[0] as CSSGroupingRule

        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        groupingRule.deleteRule(0)

        const styleSheetRule = styleSheetCallbackSpy.calls.first().args[0]
        expect(styleSheetRule.id).toBeDefined()
        expect(styleSheetRule.adds).toBeUndefined()
        expect(styleSheetRule.removes?.length).toEqual(1)
        expect(styleSheetRule.removes?.[0]?.index).toEqual([1, 0, 0])
      })

      it('should not create record when removing from a detached CSSGroupingRule', () => {
        if (isFirefox()) {
          pending('Firefox does not support inserting rules in detached group')
        }

        styleSheet.insertRule('@media cond-2 { @media cond-1 { .nest-1 { color: #ccc } } }')

        const parentRule = styleSheet.cssRules[0] as CSSGroupingRule
        const groupingRule = parentRule.cssRules[0] as CSSGroupingRule
        parentRule.deleteRule(0)

        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        groupingRule.deleteRule(0)

        expect(styleSheetCallbackSpy).not.toHaveBeenCalled()
      })
    })
  })
})

describe('initMouseInteractionObserver', () => {
  let mouseInteractionCallbackSpy: jasmine.Spy<MouseInteractionCallBack>
  let stopObserver: () => void
  let sandbox: HTMLDivElement
  let a: HTMLAnchorElement

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    sandbox = document.createElement('div')
    a = document.createElement('a')
    a.setAttribute('tabindex', '0') // make the element focusable
    sandbox.appendChild(a)
    document.body.appendChild(sandbox)
    a.focus()

    serializeDocument(document, DEFAULT_CONFIGURATION, {
      shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      elementsScrollPositions: createElementsScrollPositions(),
    })

    mouseInteractionCallbackSpy = jasmine.createSpy()
    stopObserver = initMouseInteractionObserver(mouseInteractionCallbackSpy, DefaultPrivacyLevel.ALLOW)
  })

  afterEach(() => {
    sandbox.remove()
    stopObserver()
  })

  it('should generate click record', () => {
    a.click()

    expect(mouseInteractionCallbackSpy).toHaveBeenCalledWith({
      id: jasmine.any(Number),
      type: RecordType.IncrementalSnapshot,
      timestamp: jasmine.any(Number),
      data: {
        source: IncrementalSource.MouseInteraction,
        type: MouseInteractionType.Click,
        id: jasmine.any(Number),
        x: jasmine.any(Number),
        y: jasmine.any(Number),
      },
    })
  })

  it('should generate blur record', () => {
    a.blur()

    expect(mouseInteractionCallbackSpy).toHaveBeenCalledWith({
      id: jasmine.any(Number),
      type: RecordType.IncrementalSnapshot,
      timestamp: jasmine.any(Number),
      data: {
        source: IncrementalSource.MouseInteraction,
        type: MouseInteractionType.Blur,
        id: jasmine.any(Number),
      },
    })
  })

  // related to safari issue, see RUMF-1450
  describe('forced layout issue', () => {
    let coordinatesComputed: boolean

    beforeEach(() => {
      if (!window.visualViewport) {
        pending('no visualViewport')
      }

      coordinatesComputed = false
      Object.defineProperty(window.visualViewport, 'offsetTop', {
        get() {
          coordinatesComputed = true
          return 0
        },
        configurable: true,
      })
    })

    afterEach(() => {
      delete (window.visualViewport as any).offsetTop
    })

    it('should compute x/y coordinates for click record', () => {
      a.click()
      expect(coordinatesComputed).toBeTrue()
    })

    it('should not compute x/y coordinates for blur record', () => {
      a.blur()
      expect(coordinatesComputed).toBeFalse()
    })
  })
})
