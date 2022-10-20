import { instrumentMethod } from '../tools/instrumentMethod'
import { callMonitored, monitor } from '../tools/monitor'
import { Observable } from '../tools/observable'
import type { Duration, ClocksState } from '../tools/timeUtils'
import { elapsed, clocksNow, timeStampNow } from '../tools/timeUtils'
import { normalizeUrl } from '../tools/urlPolyfill'
import { matchResponseToPerformanceEntry } from '../tools/matchResponseToPerformanceEntry'

import type { RumPerformanceResourceTiming } from '../../../rum-core/src/browser/performanceCollection'

interface FetchContextBase {
  method: string
  startClocks: ClocksState
  input: RequestInfo
  init?: RequestInit
  url: string
}

export interface FetchStartContext extends FetchContextBase {
  state: 'start'
}

export interface FetchCompleteContext extends FetchContextBase {
  state: 'complete'
  duration: Duration
  status: number
  response?: Response
  responseType?: string
  isAborted: boolean
  error?: Error
  matchingTiming?: RumPerformanceResourceTiming
}

export type FetchContext = FetchStartContext | FetchCompleteContext

let fetchObservable: Observable<FetchContext> | undefined

export function initFetchObservable() {
  if (!fetchObservable) {
    fetchObservable = createFetchObservable()
  }
  return fetchObservable
}

function createFetchObservable() {
  const observable = new Observable<FetchContext>(() => {
    if (!window.fetch) {
      return
    }

    const { stop } = instrumentMethod(
      window,
      'fetch',
      (originalFetch) =>
        function (input, init) {
          let responsePromise: Promise<Response>

          const context = callMonitored(beforeSend, null, [observable, input, init])
          if (context) {
            responsePromise = originalFetch.call(this, context.input, context.init)
            callMonitored(afterSend, null, [observable, responsePromise, context])
          } else {
            responsePromise = originalFetch.call(this, input, init)
          }

          return responsePromise
        }
    )

    return stop
  })

  return observable
}

function beforeSend(observable: Observable<FetchContext>, input: RequestInfo, init?: RequestInit) {
  const method = (init && init.method) || (typeof input === 'object' && input.method) || 'GET'
  const url = normalizeUrl((typeof input === 'object' && input.url) || (input as string))
  const startClocks = clocksNow()

  const context: FetchStartContext = {
    state: 'start',
    init,
    input,
    method,
    startClocks,
    url,
  }

  observable.notify(context)

  return context
}

export const REPORT_FETCH_TIMER = 5000

function afterSend(
  observable: Observable<FetchContext>,
  responsePromise: Promise<Response>,
  startContext: FetchStartContext
) {
  const constructContext = (response: Response | Error) => {
    const context = startContext as unknown as FetchCompleteContext
    context.state = 'complete'
    context.duration = elapsed(context.startClocks.timeStamp, timeStampNow())

    if ('stack' in response || response instanceof Error) {
      context.status = 0
      context.isAborted = response instanceof DOMException && response.code === DOMException.ABORT_ERR
      context.error = response
    } else if ('status' in response) {
      context.response = response
      context.responseType = response.type
      context.status = response.status
      context.isAborted = false
    }
    return context
  }

  const reportFetch = (response: Response | Error) => {
    const context = constructContext(response)
    observable.notify(context)
  }

  const reportFetchOnPerformanceObserverCallback = async (response: Response) => {
    const context = constructContext(response)

    const entry = await matchResponseToPerformanceEntry(response, context.duration, context.startClocks)
    context.matchingTiming = entry
    observable.notify(context)
  }

  responsePromise.then(
    monitor((response) => (response.ok ? reportFetchOnPerformanceObserverCallback(response) : reportFetch(response))),
    monitor(reportFetch)
  )
}
