import type { StackTrace } from '../domain/tracekit'
import type { RawErrorCause, ErrorWithCause } from './error'
import { clocksNow } from './timeUtils'
import {
  createHandlingStack,
  computeRawError,
  getFileFromStackTraceString,
  flattenErrorCauses,
  ErrorSource,
  ErrorHandling,
} from './error'

describe('computeRawError', () => {
  const NOT_COMPUTED_STACK_TRACE: StackTrace = { name: undefined, message: undefined, stack: [] } as any

  it('should format an error', () => {
    const stack: StackTrace = {
      message: 'oh snap!',
      name: 'TypeError',
      stack: [
        {
          args: ['1', 'bar'],
          column: 15,
          func: 'foo',
          line: 52,
          url: 'http://path/to/file.js',
        },
        {
          args: [],
          column: undefined,
          func: '?',
          line: 12,
          url: 'http://path/to/file.js',
        },
        {
          args: ['baz'],
          column: undefined,
          func: '?',
          line: undefined,
          url: 'http://path/to/file.js',
        },
      ],
    }

    const formatted = computeRawError({
      stackTrace: stack,
      error: undefined,
      startClocks: clocksNow(),
      nonErrorPrefix: 'Uncaught',
      source: ErrorSource.CUSTOM,
    })

    expect(formatted.message).toEqual('oh snap!')
    expect(formatted.type).toEqual('TypeError')
    expect(formatted.stack).toEqual(`TypeError: oh snap!
  at foo(1, bar) @ http://path/to/file.js:52:15
  at <anonymous> @ http://path/to/file.js:12
  at <anonymous>(baz) @ http://path/to/file.js`)
  })

  it('should format an error with an empty message', () => {
    const stack: StackTrace = {
      message: '',
      name: 'TypeError',
      stack: [],
    }

    const formatted = computeRawError({
      stackTrace: stack,
      error: undefined,
      startClocks: clocksNow(),
      nonErrorPrefix: 'Uncaught',
      source: 'custom',
    })

    expect(formatted.message).toEqual('Empty message')
  })

  it('should format a string error', () => {
    const error = 'oh snap!'

    const formatted = computeRawError({
      stackTrace: NOT_COMPUTED_STACK_TRACE,
      error,
      startClocks: clocksNow(),
      nonErrorPrefix: 'Uncaught',
      source: 'custom',
    })

    expect(formatted.message).toEqual('Uncaught "oh snap!"')
  })

  it('should format an object error', () => {
    const error = { foo: 'bar' }

    const formatted = computeRawError({
      stackTrace: NOT_COMPUTED_STACK_TRACE,
      error,
      startClocks: clocksNow(),
      nonErrorPrefix: 'Uncaught',
      source: 'custom',
    })

    expect(formatted.message).toEqual('Uncaught {"foo":"bar"}')
  })

  it('should return handling set', () => {
    const error = { foo: 'bar' }

    expect(
      computeRawError({
        stackTrace: NOT_COMPUTED_STACK_TRACE,
        error,
        startClocks: clocksNow(),
        nonErrorPrefix: 'Uncaught',
        source: 'custom',
        handling: ErrorHandling.HANDLED,
      }).handling
    ).toEqual(ErrorHandling.HANDLED)

    expect(
      computeRawError({
        stackTrace: NOT_COMPUTED_STACK_TRACE,
        error,
        startClocks: clocksNow(),
        nonErrorPrefix: 'Uncaught',
        source: 'custom',
        handling: ErrorHandling.UNHANDLED,
      }).handling
    ).toEqual(ErrorHandling.UNHANDLED)
  })

  it('should format an object error with cause', () => {
    const error = new Error('foo: bar') as ErrorWithCause
    const nestedError = new Error('biz: buz') as ErrorWithCause
    const deepNestedError = new Error('fiz: buz') as ErrorWithCause

    error.cause = nestedError
    nestedError.cause = deepNestedError

    const formatted = computeRawError({
      stackTrace: NOT_COMPUTED_STACK_TRACE,
      error,
      startClocks: clocksNow(),
      nonErrorPrefix: 'Uncaught',
      source: ErrorSource.SOURCE,
    })

    expect(formatted.causes?.length).toBe(2)
    const causes = formatted.causes as RawErrorCause[]
    expect(causes[0].message).toContain(nestedError.message)
    expect(causes[0].source).toContain(ErrorSource.SOURCE)
    expect(causes[1].message).toContain(deepNestedError.message)
    expect(causes[1].source).toContain(ErrorSource.SOURCE)
  })
})

describe('getFileFromStackTraceString', () => {
  it('should get the first source file of the stack', () => {
    expect(
      getFileFromStackTraceString(`TypeError: oh snap!
  at foo(1, bar) @ http://path/to/file.js:52:15
  at <anonymous> @ http://path/to/file.js:12
  at <anonymous>(baz) @ http://path/to/file.js`)
    ).toEqual('http://path/to/file.js:52:15')
  })

  it('should get undefined if no source file is in the stack', () => {
    expect(getFileFromStackTraceString('TypeError: oh snap!')).not.toBeDefined()
  })
})

describe('createHandlingStack', () => {
  let handlingStack: string
  function internalCall() {
    handlingStack = createHandlingStack()
  }
  function userCallTwo() {
    internalCall()
  }
  function userCallOne() {
    userCallTwo()
  }

  it('should create handling stack trace without internal calls', () => {
    userCallOne()

    expect(handlingStack).toMatch(`Error: 
  at userCallTwo @ (.*)
  at userCallOne @ (.*)`)
  })
})

describe('flattenErrorCauses', () => {
  it('should return undefined if no cause found', () => {
    const error = new Error('foo') as ErrorWithCause
    const errorCauses = flattenErrorCauses(error, ErrorSource.LOGGER)
    expect(errorCauses).toEqual(undefined)
  })

  it('should stop recursive loop if cause is not of type Error', () => {
    const error = new Error('foo') as ErrorWithCause
    const nestedError = new Error('bar')
    const deepNestedError = { biz: 'buz', cause: new Error('boo') }
    error.cause = nestedError
    // @ts-ignore: want to test we can handle non error cases
    nestedError.cause = deepNestedError

    const errorCauses = flattenErrorCauses(error, ErrorSource.LOGGER)
    expect(errorCauses?.length).toEqual(1)
    expect(errorCauses?.[0].message).toEqual('bar')
    expect(errorCauses?.[0].source).toEqual(ErrorSource.LOGGER)
  })

  it('should have stack trace properties if passed', () => {
    const error = new Error('foo') as ErrorWithCause
    const nestedError = new Error('bar')

    error.cause = nestedError

    const stack: StackTrace = {
      message: '',
      name: 'TypeError',
      stack: [],
    }

    const errorCauses = flattenErrorCauses(error, ErrorSource.LOGGER, stack)
    expect(errorCauses?.[0].type).toEqual('TypeError')
  })

  it('should only return the first 10 errors if nested chain is longer', () => {
    const error = new Error('foo') as ErrorWithCause
    error.cause = error
    const errorCauses = flattenErrorCauses(error, ErrorSource.LOGGER)
    expect(errorCauses?.length).toEqual(10)
  })
})
