import { DefaultPrivacyLevel, display } from '@datadog/browser-core'
import type { RumInitConfiguration } from './configuration'
import { serializeRumConfiguration, validateAndBuildRumConfiguration } from './configuration'

const DEFAULT_INIT_CONFIGURATION = { clientToken: 'xxx', applicationId: 'xxx' }

describe('validateAndBuildRumConfiguration', () => {
  let displayErrorSpy: jasmine.Spy<typeof display.error>
  let displayWarnSpy: jasmine.Spy<typeof display.warn>

  beforeEach(() => {
    displayErrorSpy = spyOn(display, 'error')
    displayWarnSpy = spyOn(display, 'warn')
  })

  describe('applicationId', () => {
    it('does not validate the configuration if it is missing', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, applicationId: undefined as any })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith(
        'Application ID is not configured, no RUM data will be collected.'
      )
    })
  })

  describe('sessionReplaySampleRate', () => {
    it('defaults to 100 if the option is not provided', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.sessionReplaySampleRate).toBe(100)
    })

    it('is set to `sessionReplaySampleRate` provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, sessionReplaySampleRate: 50 })!
          .sessionReplaySampleRate
      ).toBe(50)
    })

    it('is set to `premiumSampleRate` provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, premiumSampleRate: 50 })!
          .sessionReplaySampleRate
      ).toBe(50)
    })

    it('is set to `replaySampleRate` provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, replaySampleRate: 50 })!
          .sessionReplaySampleRate
      ).toBe(50)
    })

    it('is set with precedence `sessionReplaySampleRate` > `premiumSampleRate` > `replaySampleRate`', () => {
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          replaySampleRate: 25,
          premiumSampleRate: 50,
          sessionReplaySampleRate: 75,
        })!.sessionReplaySampleRate
      ).toBe(75)
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          replaySampleRate: 25,
          premiumSampleRate: 50,
        })!.sessionReplaySampleRate
      ).toBe(50)
    })

    it('does not validate the configuration if an incorrect value is provided', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, sessionReplaySampleRate: 'foo' as any })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith(
        'Session Replay Sample Rate should be a number between 0 and 100'
      )

      displayErrorSpy.calls.reset()

      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, sessionReplaySampleRate: 200 })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith(
        'Session Replay Sample Rate should be a number between 0 and 100'
      )

      displayErrorSpy.calls.reset()

      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, premiumSampleRate: 'foo' as any })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith('Premium Sample Rate should be a number between 0 and 100')

      displayErrorSpy.calls.reset()

      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, premiumSampleRate: 200 })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith('Premium Sample Rate should be a number between 0 and 100')

      displayErrorSpy.calls.reset()

      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, replaySampleRate: 'foo' as any })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith('Premium Sample Rate should be a number between 0 and 100')

      displayErrorSpy.calls.reset()

      expect(validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, replaySampleRate: 200 })).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith('Premium Sample Rate should be a number between 0 and 100')

      displayErrorSpy.calls.reset()
    })

    it('should validate and display a warn if both `sessionReplaySampleRate` and `premiumSampleRate` are set', () => {
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionReplaySampleRate: 100,
          premiumSampleRate: 100,
        })
      ).toBeDefined()
      expect(displayWarnSpy).toHaveBeenCalledOnceWith(
        'Ignoring Premium Sample Rate because Session Replay Sample Rate is set'
      )
    })
  })

  describe('oldPlansBehavior', () => {
    it('should be true by default', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.oldPlansBehavior).toBeTrue()
    })

    it('should be false if `sessionReplaySampleRate` is set', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, sessionReplaySampleRate: 100 })!
          .oldPlansBehavior
      ).toBeFalse()
    })
  })

  describe('tracingSampleRate', () => {
    it('defaults to undefined if the option is not provided', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.tracingSampleRate).toBeUndefined()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, tracingSampleRate: 50 })!.tracingSampleRate
      ).toBe(50)
    })

    it('does not validate the configuration if an incorrect value is provided', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, tracingSampleRate: 'foo' as any })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith('Tracing Sample Rate should be a number between 0 and 100')

      displayErrorSpy.calls.reset()
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, tracingSampleRate: 200 })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith('Tracing Sample Rate should be a number between 0 and 100')
    })
  })

  describe('allowedTracingOrigins', () => {
    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          allowedTracingOrigins: ['foo'],
          service: 'bar',
        })!.allowedTracingUrls
      ).toEqual([{ match: 'foo', headersTypes: ['dd'] }])
    })

    it('accepts functions', () => {
      const originMatchSpy = jasmine.createSpy<(origin: string) => boolean>()

      const tracingUrlOptionMatch = validateAndBuildRumConfiguration({
        ...DEFAULT_INIT_CONFIGURATION,
        allowedTracingOrigins: [originMatchSpy],
        service: 'bar',
      })!.allowedTracingUrls[0].match as (url: string) => boolean

      expect(typeof tracingUrlOptionMatch).toBe('function')
      // Replicating behavior from allowedTracingOrigins, new function will treat the origin part of the URL
      tracingUrlOptionMatch('https://my.origin.com/api')
      expect(originMatchSpy).toHaveBeenCalledWith('https://my.origin.com')
    })

    it('does not validate the configuration if a value is provided and service is undefined', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, allowedTracingOrigins: ['foo'] })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith('Service needs to be configured when tracing is enabled')
    })

    it('does not validate the configuration if an incorrect value is provided', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, allowedTracingOrigins: 'foo' as any })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith('Allowed Tracing Origins should be an array')
    })
  })

  describe('allowedTracingUrls', () => {
    it('defaults to an empty array', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.allowedTracingUrls).toEqual([])
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          allowedTracingUrls: ['foo'],
          service: 'bar',
        })!.allowedTracingUrls
      ).toEqual([{ match: 'foo', headersTypes: ['dd'] }])
    })

    it('accepts functions', () => {
      const customOriginFunction = (url: string): boolean => url === 'https://my.origin.com'

      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          allowedTracingUrls: [customOriginFunction],
          service: 'bar',
        })!.allowedTracingUrls
      ).toEqual([{ match: customOriginFunction, headersTypes: ['dd'] }])
    })

    it('accepts RegExp', () => {
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          allowedTracingUrls: [/az/i],
          service: 'bar',
        })!.allowedTracingUrls
      ).toEqual([{ match: /az/i, headersTypes: ['dd'] }])
    })

    it('keeps headers', () => {
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          allowedTracingUrls: [{ match: 'simple', headersTypes: ['b3m', 'w3c'] }],
          service: 'bar',
        })!.allowedTracingUrls
      ).toEqual([{ match: 'simple', headersTypes: ['b3m', 'w3c'] }])
    })

    it('should filter out unexpected parameter types', () => {
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          service: 'bar',
          allowedTracingUrls: [42 as any, undefined, { match: 42 as any, headersTypes: ['dd'] }, { match: 'toto' }],
        })!.allowedTracingUrls
      ).toEqual([])

      expect(displayWarnSpy).toHaveBeenCalledTimes(4)
    })

    it('does not validate the configuration if a value is provided and service is undefined', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, allowedTracingUrls: ['foo'] })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith('Service needs to be configured when tracing is enabled')
    })

    it('does not validate the configuration if an incorrect value is provided', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, allowedTracingUrls: 'foo' as any })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith('Allowed Tracing URLs should be an array')
    })
  })

  describe('excludedActivityUrls', () => {
    it('defaults to an empty array', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.excludedActivityUrls).toEqual([])
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          excludedActivityUrls: ['foo'],
          service: 'bar',
        })!.excludedActivityUrls
      ).toEqual(['foo'])
    })

    it('accepts functions', () => {
      const customUrlFunction = (url: string): boolean => url === 'foo'

      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          excludedActivityUrls: [customUrlFunction],
          service: 'bar',
        })!.excludedActivityUrls
      ).toEqual([customUrlFunction])
    })

    it('does not validate the configuration if an incorrect value is provided', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, excludedActivityUrls: 'foo' as any })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith('Excluded Activity Urls should be an array')
    })
  })

  describe('trackInteractions', () => {
    it('defaults to false', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.trackInteractions).toBeFalse()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackInteractions: true })!.trackInteractions
      ).toBeTrue()
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackInteractions: false })!.trackInteractions
      ).toBeFalse()
    })

    it('the provided value is cast to boolean', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackInteractions: 'foo' as any })!
          .trackInteractions
      ).toBeTrue()
    })
  })

  describe('trackFrustrations', () => {
    it('defaults to false', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.trackFrustrations).toBeFalse()
    })

    it('the initialization parameter is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackFrustrations: true })!.trackFrustrations
      ).toBeTrue()
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackFrustrations: false })!.trackFrustrations
      ).toBeFalse()
    })

    it('the initialization parameter the provided value is cast to boolean', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackFrustrations: 'foo' as any })!
          .trackFrustrations
      ).toBeTrue()
    })

    it('implies "trackInteractions"', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackFrustrations: true })!.trackInteractions
      ).toBeTrue()
    })
  })

  describe('trackViewsManually', () => {
    it('defaults to false', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.trackViewsManually).toBeFalse()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackViewsManually: true })!
          .trackViewsManually
      ).toBeTrue()
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackViewsManually: false })!
          .trackViewsManually
      ).toBeFalse()
    })

    it('the provided value is cast to boolean', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackViewsManually: 'foo' as any })!
          .trackViewsManually
      ).toBeTrue()
    })
  })

  describe('actionNameAttribute', () => {
    it('defaults to undefined', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.actionNameAttribute).toBeUndefined()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, actionNameAttribute: 'foo' })!
          .actionNameAttribute
      ).toBe('foo')
    })
  })

  describe('defaultPrivacyLevel', () => {
    it('defaults to MASK_USER_INPUT', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.defaultPrivacyLevel).toBe(
        DefaultPrivacyLevel.MASK_USER_INPUT
      )
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          defaultPrivacyLevel: DefaultPrivacyLevel.MASK,
        })!.defaultPrivacyLevel
      ).toBe(DefaultPrivacyLevel.MASK)
    })

    it('ignores incorrect values', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, defaultPrivacyLevel: 'foo' as any })!
          .defaultPrivacyLevel
      ).toBe(DefaultPrivacyLevel.MASK_USER_INPUT)
    })
  })

  describe('trackResources', () => {
    it('defaults to undefined', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.trackResources).toBeUndefined()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackResources: true })!.trackResources
      ).toBeTrue()
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackResources: false })!.trackResources
      ).toBeFalse()
    })
  })

  describe('trackLongTasks', () => {
    it('defaults to undefined', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.trackLongTasks).toBeUndefined()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackLongTasks: true })!.trackLongTasks
      ).toBeTrue()
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackLongTasks: false })!.trackLongTasks
      ).toBeFalse()
    })
  })

  describe('serializeRumConfiguration', () => {
    describe('selected tracing headers serialization', () => {
      it('should not return any header type', () => {
        expect(serializeRumConfiguration(DEFAULT_INIT_CONFIGURATION).selected_tracing_headers).toEqual([])
      })

      it('should return Datadog header type', () => {
        const simpleTracingConfig: RumInitConfiguration = {
          ...DEFAULT_INIT_CONFIGURATION,
          allowedTracingUrls: ['foo'],
        }
        expect(serializeRumConfiguration(simpleTracingConfig).selected_tracing_headers).toEqual(['dd'])
      })

      it('should return all header types', () => {
        const complexTracingConfig: RumInitConfiguration = {
          ...DEFAULT_INIT_CONFIGURATION,
          allowedTracingUrls: [
            'foo',
            { match: 'first', headersTypes: ['dd'] },
            { match: 'test', headersTypes: ['w3c'] },
            { match: 'other', headersTypes: ['b3'] },
            { match: 'final', headersTypes: ['b3m'] },
          ],
        }
        expect(serializeRumConfiguration(complexTracingConfig).selected_tracing_headers).toEqual(
          jasmine.arrayWithExactContents(['dd', 'b3', 'b3m', 'w3c'])
        )
      })
    })
  })
})
