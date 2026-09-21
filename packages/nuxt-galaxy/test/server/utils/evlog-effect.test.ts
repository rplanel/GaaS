import { Effect, HashMap, List, LogSpan } from 'effect'
import { useLogger } from 'evlog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evlogEffectLogger, runGalaxyEffect, runTaskEffect } from '../../../src/runtime/server/utils/evlog-effect'
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
