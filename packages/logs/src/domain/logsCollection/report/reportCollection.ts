import type { Context, ClocksState, RawReport } from '@datadog/browser-core'
import { ErrorSource, RawReportType, getFileFromStackTraceString, initReportObservable } from '@datadog/browser-core'
import type { LogsConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import { StatusType } from '../../logger'

export interface ProvidedError {
  startClocks: ClocksState
  error: unknown
  context?: Context
  handlingStack: string
}

const LogStatusForReport = {
  [RawReportType.cspViolation]: StatusType.error,
  [RawReportType.intervention]: StatusType.error,
  [RawReportType.deprecation]: StatusType.warn,
}

export function startReportCollection(configuration: LogsConfiguration, lifeCycle: LifeCycle) {
  const reportObservable = initReportObservable(configuration.forwardReports)
  const reportSubscription = reportObservable.subscribe(logReport)

  function logReport(report: RawReport) {
    let message = report.message
    const status = LogStatusForReport[report.type]
    let error
    if (status === StatusType.error) {
      error = {
        kind: report.subtype,
        origin: ErrorSource.REPORT, // Todo: Remove in the next major release
        stack: report.stack,
      }
    } else if (report.stack) {
      message += ` Found in ${getFileFromStackTraceString(report.stack)!}`
    }

    lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLog: {
        message,
        origin: ErrorSource.REPORT,
        error,
        status,
      },
    })
  }

  return {
    stop: () => {
      reportSubscription.unsubscribe()
    },
  }
}
