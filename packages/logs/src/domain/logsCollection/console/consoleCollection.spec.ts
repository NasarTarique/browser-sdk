import { ErrorSource, resetExperimentalFeatures, updateExperimentalFeatures, noop } from '@datadog/browser-core'
import { validateAndBuildLogsConfiguration } from '../../configuration'
import type { RawLogCollectedData } from '../../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { StatusType } from '../../logger'
import { startConsoleCollection } from './consoleCollection'

describe('console collection', () => {
  const initConfiguration = { clientToken: 'xxx', service: 'service' }
  let consoleLogSpy: jasmine.Spy
  let stopConsoleCollection: () => void
  let lifeCycle: LifeCycle
  let rawLogs: RawLogCollectedData[]

  beforeEach(() => {
    rawLogs = []
    lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.RAW_LOG_COLLECTED, (rawLog) => rawLogs.push(rawLog))
    stopConsoleCollection = noop
    consoleLogSpy = spyOn(console, 'log').and.callFake(() => true)
    spyOn(console, 'error').and.callFake(() => true)
  })

  afterEach(() => {
    resetExperimentalFeatures()
    stopConsoleCollection()
  })

  it('should send console logs when ff forward-logs is enabled', () => {
    updateExperimentalFeatures(['forward-logs'])
    ;({ stop: stopConsoleCollection } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardConsoleLogs: ['log'] })!,
      lifeCycle
    ))

    /* eslint-disable-next-line no-console */
    console.log('foo', 'bar')

    expect(rawLogs[0].rawLog).toEqual({
      message: 'foo bar',
      status: StatusType.info,
      origin: ErrorSource.CONSOLE,
      error: undefined,
    })

    expect(consoleLogSpy).toHaveBeenCalled()
  })

  it('should not send console logs when ff forward-logs is disabled', () => {
    ;({ stop: stopConsoleCollection } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardConsoleLogs: ['log'] })!,
      lifeCycle
    ))

    /* eslint-disable-next-line no-console */
    console.log('foo', 'bar')

    expect(rawLogs.length).toEqual(0)
    expect(consoleLogSpy).toHaveBeenCalled()
  })

  it('should send console errors with "console" origin when ff forward-logs is enabled', () => {
    updateExperimentalFeatures(['forward-logs'])
    ;({ stop: stopConsoleCollection } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardErrorsToLogs: true })!,
      lifeCycle
    ))

    /* eslint-disable-next-line no-console */
    console.error('foo', 'bar')
    expect(rawLogs[0].rawLog.origin).toEqual(ErrorSource.CONSOLE)
  })

  it('should not send console errors with "console" origin when ff forward-logs is disabled', () => {
    ;({ stop: stopConsoleCollection } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardErrorsToLogs: true })!,
      lifeCycle
    ))

    /* eslint-disable-next-line no-console */
    console.error('foo', 'bar')

    expect(rawLogs[0].rawLog.origin).not.toBeDefined()
  })

  it('console error should have an error object defined', () => {
    ;({ stop: stopConsoleCollection } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardErrorsToLogs: true })!,
      lifeCycle
    ))

    /* eslint-disable-next-line no-console */
    console.error('foo', 'bar')

    expect(rawLogs[0].rawLog.error).toEqual({
      origin: ErrorSource.CONSOLE,
      stack: undefined,
    })
  })
})
