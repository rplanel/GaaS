import { blendTypeLog, makeConfigLayer } from 'blendtype'
import { Cause, Effect, HashMap, List, LogSpan } from 'effect'
import { useLogger } from 'evlog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BlendTypeLoggerEvlogLayer, evlogEffectLogger, runGalaxyEffect, runTaskEffect } from '../../../src/runtime/server/utils/evlog-effect'
import { createMockRequestLogger } from '../setup'

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))

vi.mock('evlog', () => ({
  log: mockLog,
  createRequestLogger: vi.fn(() => createMockRequestLogger()),
  useLogger: vi.fn(() => createMockRequestLogger()),
}))

function logOptions(level: string, message: unknown[]): any {
  return {
    date: new Date(),
    fiberId: {} as any,
    logLevel: { label: level } as any,
    message,
    cause: null as any,
    context: {} as any,
    spans: [] as any,
    annotations: {} as any,
  }
}

describe('evlogEffectLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to global evlog.info when no request logger is set', () => {
    const requestLog = createMockRequestLogger()

    evlogEffectLogger.log(logOptions('INFO', ['hello', { x: 1 }]))

    expect(mockLog.info).toHaveBeenCalledWith(expect.objectContaining({ message: 'hello {"x":1}' }))
    expect(requestLog.info).not.toHaveBeenCalled()
  })

  it('maps error level to global evlog.error', () => {
    evlogEffectLogger.log(logOptions('ERROR', ['error message']))

    expect(mockLog.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'error message' }))
    expect(mockLog.info).not.toHaveBeenCalled()
  })

  it('maps warn level to global evlog.warn', () => {
    evlogEffectLogger.log(logOptions('WARN', ['warn message']))

    expect(mockLog.warn).toHaveBeenCalledWith(expect.objectContaining({ message: 'warn message' }))
    expect(mockLog.info).not.toHaveBeenCalled()
  })

  it('maps debug level to global evlog.debug', () => {
    evlogEffectLogger.log(logOptions('DEBUG', ['debug message']))

    expect(mockLog.debug).toHaveBeenCalledWith(expect.objectContaining({ message: 'debug message' }))
    expect(mockLog.info).not.toHaveBeenCalled()
  })

  it('serializes Effect HashMap annotations and List spans to plain JSON objects', () => {
    const annotations = HashMap.make(
      ['analysisId', '1'],
      ['ownerId', '2'],
      ['galaxyInvocationId', null],
      ['historyId', null],
      ['jobId', null],
      ['datasetId', null],
    )
    const spans = List.make(LogSpan.make('sync-analysis', 0))

    evlogEffectLogger.log({
      ...logOptions('INFO', ['annotated message']),
      annotations,
      spans,
    } as any)

    const context = mockLog.info.mock.calls[0]![0] as Record<string, unknown>
    expect(() => JSON.stringify(context)).not.toThrow()
    expect(context.effectAnnotations).toEqual({
      analysisId: '1',
      ownerId: '2',
      galaxyInvocationId: null,
      historyId: null,
      jobId: null,
      datasetId: null,
    })
    expect(context.effectSpans).toEqual([{ label: 'sync-analysis', startTime: 0 }])
    expect((context.effectAnnotations as any)._id).not.toBe('HashMap')
    expect((context.effectSpans as any)._id).not.toBe('List')
  })
})

describe('runGalaxyEffect', () => {
  it('runs an effect and attaches the request logger', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    const event = { path: '/api/test', method: 'GET' } as any
    const effect = Effect.succeed(42)

    const result = await runGalaxyEffect(event, effect)
    expect(result).toBe(42)
    expect(requestLog.set).toHaveBeenCalledWith({ handler: '/api/test', method: 'GET' })
  })

  it('forwards Effect.log calls to the request logger with correct levels', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    const event = { path: '/api/test', method: 'GET' } as any
    const effect = Effect.gen(function* () {
      yield* Effect.log('info message')
      yield* Effect.logInfo('logInfo message')
      yield* Effect.logWarning('warning message')
      yield* Effect.logError('error message')
      return 42
    })

    const result = await runGalaxyEffect(event, effect)
    expect(result).toBe(42)
    expect(requestLog.info).toHaveBeenCalledWith('info message', expect.any(Object))
    expect(requestLog.info).toHaveBeenCalledWith('logInfo message', expect.any(Object))
    expect(requestLog.warn).toHaveBeenCalledWith('warning message', expect.any(Object))
    expect(requestLog.error).toHaveBeenCalledWith('error message', expect.any(Object))
  })

  it('routes Effect.logDebug to the global evlog logger because the request logger has no debug method', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    const event = { path: '/api/test', method: 'GET' } as any
    const effect = Effect.gen(function* () {
      yield* Effect.logDebug('debug message')
      return 42
    })

    const result = await runGalaxyEffect(event, effect)
    expect(result).toBe(42)
    expect(mockLog.debug).toHaveBeenCalledWith(expect.objectContaining({ message: 'debug message' }))
    expect(requestLog.debug).not.toHaveBeenCalled()
  })
})

describe('runTaskEffect', () => {
  it('forwards Effect.log calls to the task logger with correct levels', async () => {
    const taskLog = createMockRequestLogger()

    const effect = Effect.gen(function* () {
      yield* Effect.logError('task error')
      yield* Effect.logWarning('task warning')
      yield* Effect.log('task info')
      return 'done'
    })

    const result = await runTaskEffect(taskLog, effect)
    expect(result).toBe('done')
    expect(taskLog.error).toHaveBeenCalledWith('task error', expect.any(Object))
    expect(taskLog.warn).toHaveBeenCalledWith('task warning', expect.any(Object))
    expect(taskLog.info).toHaveBeenCalledWith('task info', expect.any(Object))
  })
})

// Effect hands the logger a `Cause` on every log, `Cause.empty` when nothing
// failed, and an empty cause is a truthy object. Guarding on truthiness put
// "All fibers interrupted without errors." on every event the bridge wrote,
// which made `effectCause` mean nothing (#45).
describe('the cause of an Effect log', () => {
  /** What the request logger was handed for the one line `effect` logs, at `level`. */
  async function written(level: 'info' | 'error', effect: Effect.Effect<void>) {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    await runGalaxyEffect({ path: '/api/test', method: 'GET' } as any, effect)

    const [message, context] = vi.mocked(requestLog[level]).mock.calls[0] as [string, Record<string, unknown>]
    return { message, context }
  }

  it('is absent when nothing failed', async () => {
    const { message, context } = await written('info', Effect.logInfo('nothing went wrong'))

    expect(message).toBe('nothing went wrong')
    expect(context).not.toHaveProperty('effectCause')
  })

  it('is the pretty cause of a failure, beside a message that does not repeat it', async () => {
    const { message, context } = await written('error', Effect.logError('galaxy request failed', Cause.fail(new Error('kaboom'))))

    expect(message).toBe('galaxy request failed')
    expect(context.effectCause).toContain('kaboom')
  })

  it('is the pretty cause of a defect, stack included', async () => {
    const { context } = await written('error', Effect.logError('galaxy request failed', Cause.die(new TypeError('a real bug'))))

    expect(context.effectCause).toMatch(/TypeError: a real bug/)
    expect(context.effectCause).toMatch(/\n\s+at /)
  })
})

// blendtype asks the context for a `BlendTypeLogger` rather than importing
// evlog, so the bridge that answers it is what puts library logs on the same
// wide event as everything else the request wrote (#13).
describe('blendTypeLoggerEvlogLayer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes to the request logger, context and all, when one is in scope', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    await runGalaxyEffect(
      { path: '/api/test', method: 'GET' } as any,
      blendTypeLog('info', 'blendtype says hello', { historyId: 'hid' }),
    )

    expect(requestLog.info).toHaveBeenCalledWith('blendtype says hello', { historyId: 'hid' })
  })

  it('maps warn and error onto the request logger', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    await runGalaxyEffect(
      { path: '/api/test', method: 'GET' } as any,
      Effect.gen(function* () {
        yield* blendTypeLog('warn', 'a warning')
        yield* blendTypeLog('error', 'a failure')
      }),
    )

    expect(requestLog.warn).toHaveBeenCalledWith('a warning', {})
    expect(requestLog.error).toHaveBeenCalledWith('a failure', {})
  })

  it('sends debug to the global evlog logger, which the request logger has no method for', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    await runGalaxyEffect(
      { path: '/api/test', method: 'GET' } as any,
      blendTypeLog('debug', 'a detail', { datasetId: 'did' }),
    )

    expect(mockLog.debug).toHaveBeenCalledWith({ message: 'a detail', datasetId: 'did' })
    expect(requestLog.debug).not.toHaveBeenCalled()
  })

  it('falls back to the global evlog logger with no request logger in scope', async () => {
    await blendTypeLog('info', 'outside a request', { a: 1 }).pipe(
      Effect.provide(BlendTypeLoggerEvlogLayer),
      Effect.runPromise,
    )

    expect(mockLog.info).toHaveBeenCalledWith({ message: 'outside a request', a: 1 })
  })

  it('carries a log a real blendtype Effect emits onto the request event', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    await runGalaxyEffect(
      { path: '/api/test', method: 'GET' } as any,
      Effect.gen(function* () {
        yield* Effect.void
      }).pipe(Effect.provide(makeConfigLayer({ apiKey: 'k', url: 'https://galaxy.test' }))),
    )

    expect(requestLog.info).toHaveBeenCalledWith('initialized', {})
  })

  it('reaches a task run outside any request too', async () => {
    const taskLog = createMockRequestLogger()

    await runTaskEffect(taskLog, blendTypeLog('info', 'from a task', { analysisId: 7 }))

    expect(taskLog.info).toHaveBeenCalledWith('from a task', { analysisId: 7 })
  })
})
