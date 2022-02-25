import type { Configuration, InitConfiguration } from '@datadog/browser-core'
import {
  ONE_KILO_BYTE,
  validateAndBuildConfiguration,
  display,
  isExperimentalFeatureEnabled,
  removeDuplicates,
  ConsoleApiName,
  objectHasValue,
  CustomReportType,
  includes,
} from '@datadog/browser-core'
import type { LogsEvent } from '../logsEvent.types'

export interface LogsInitConfiguration extends InitConfiguration {
  beforeSend?: ((event: LogsEvent) => void | boolean) | undefined
  forwardErrorsToLogs?: boolean | undefined
  forwardConsoleLogs?: readonly ConsoleApiName[] | 'all' | undefined
  forwardReports?: readonly CustomReportType[] | 'all' | undefined
}

export type HybridInitConfiguration = Omit<LogsInitConfiguration, 'clientToken'>

export interface LogsConfiguration extends Configuration {
  forwardErrorsToLogs: boolean
  forwardConsoleLogs: ConsoleApiName[]
  forwardReports: CustomReportType[]
  requestErrorResponseLengthLimit: number
}

/**
 * arbitrary value, byte precision not needed
 */
export const DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT = 32 * ONE_KILO_BYTE

export function validateAndBuildLogsConfiguration(
  initConfiguration: LogsInitConfiguration
): LogsConfiguration | undefined {
  const baseConfiguration = validateAndBuildConfiguration(initConfiguration)

  const forwardConsoleLogs = validateAndBuildForwardOption<ConsoleApiName>(
    initConfiguration.forwardConsoleLogs,
    Object.keys(ConsoleApiName) as ConsoleApiName[],
    'Forward Console Logs',
    'forward-logs'
  )

  const forwardReports = validateAndBuildForwardOption<CustomReportType>(
    initConfiguration.forwardReports,
    Object.keys(CustomReportType) as CustomReportType[],
    'Forward Reports',
    'forward-reports'
  )

  if (!baseConfiguration || !forwardConsoleLogs || !forwardReports) {
    return
  }

  if (initConfiguration.forwardErrorsToLogs && !includes(forwardConsoleLogs, ConsoleApiName.error)) {
    forwardConsoleLogs.push(ConsoleApiName.error)
  }

  return {
    ...baseConfiguration,
    forwardErrorsToLogs: !!initConfiguration.forwardErrorsToLogs,
    forwardConsoleLogs,
    forwardReports,
    requestErrorResponseLengthLimit: DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT,
  }
}

export function validateAndBuildForwardOption<T>(
  option: readonly T[] | 'all' | undefined,
  allowedValues: T[],
  label: string,
  featureFlag: string
): T[] | undefined {
  if (!isExperimentalFeatureEnabled(featureFlag) || option === undefined) {
    return []
  }

  if (!(option === 'all' || (Array.isArray(option) && option.every((api) => objectHasValue(ConsoleApiName, api))))) {
    display.error(`${label} should be "all" or an array with allowed values "${allowedValues.join('", "')}"`)
    return
  }

  return option === 'all' ? allowedValues : removeDuplicates<T>(option)
}
