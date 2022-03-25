import { ErrorSource, Observable } from '@datadog/browser-core'
import type { RawError, RelativeTime, TimeStamp } from '@datadog/browser-core'
import type { LogsConfiguration } from '../configuration'
import { createSender } from '../sender'
import { StatusType } from '../logger'
import { startRawErrorCollection } from './rawErrorCollection'

describe('error collection', () => {
  let rawErrorObservable: Observable<RawError>
  let sendLogSpy: jasmine.Spy
  let stopRawErrorCollection: () => void
  beforeEach(() => {
    rawErrorObservable = new Observable<RawError>()
    sendLogSpy = jasmine.createSpy('sendLogSpy')
    ;({ stop: stopRawErrorCollection } = startRawErrorCollection(
      {} as LogsConfiguration,
      createSender(sendLogSpy),
      rawErrorObservable
    ))
  })

  afterEach(() => {
    stopRawErrorCollection()
  })

  it('should send log errors', () => {
    rawErrorObservable.notify({
      message: 'error!',
      source: ErrorSource.SOURCE,
      startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      type: 'Error',
    })

    expect(sendLogSpy).toHaveBeenCalled()
    expect(sendLogSpy.calls.first().args).toEqual([
      {
        date: 123456789 as TimeStamp,
        error: { origin: ErrorSource.SOURCE, kind: 'Error', stack: undefined },
        message: 'error!',
        status: StatusType.error,
      },
    ])
  })
})
