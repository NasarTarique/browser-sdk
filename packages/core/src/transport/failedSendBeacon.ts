import { isExperimentalFeatureEnabled } from '../domain/configuration'
import { addMonitoringMessage, monitor } from '../domain/internalMonitoring'
import { generateUUID, startsWith } from '../tools/utils'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

export const LOCAL_STORAGE_KEY = 'datadog-browser-sdk-failed-send-beacon'

export function startFlushFailedSendBeacons() {
  if (!isExperimentalFeatureEnabled('lower-batch-size')) return

  setTimeout(monitor(flushFailedSendBeacon))
}

export function addFailedSendBeacon(endpointType: string, size: number, reason?: string) {
  if (!isExperimentalFeatureEnabled('lower-batch-size')) return

  const failSendBeaconLog = {
    reason,
    endpointType,
    version: __BUILD_ENV__SDK_VERSION__,
    connection: navigator.connection ? (navigator.connection as any).effectiveType : undefined,
    onLine: navigator.onLine,
    size,
  }

  if (reason === 'before_unload' || reason === 'visibility_hidden') {
    window.localStorage.setItem(`${LOCAL_STORAGE_KEY}-${generateUUID()}`, JSON.stringify(failSendBeaconLog))
  } else {
    addMonitoringMessage('failed sendBeacon', failSendBeaconLog)
  }
}

function flushFailedSendBeacon() {
  const keys = Object.keys(localStorage)
  for (const key of keys) {
    if (startsWith(key, LOCAL_STORAGE_KEY)) {
      const value = localStorage.getItem(key)
      if (value) {
        addMonitoringMessage('failed sendBeacon', JSON.parse(value))
        window.localStorage.removeItem(key)
      }
    }
  }
}
