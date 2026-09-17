import type { Effect as EffectType, LogSpan } from 'effect'
import type { H3Event } from 'h3'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Cause, Effect, HashMap, List, Logger, LogLevel } from 'effect'
import { log as evlogGlobal, useLogger } from 'evlog'

const evlogAsyncStorage = new AsyncLocalStorage<ReturnType<typeof useLogger>>()

function formatEffectMessage(message: unknown): string {
  if (!Array.isArray(message))
    return String(message)
  return message.map((part) => {
    if (typeof part === 'string')
      return part
    try {
      return JSON.stringify(part)
    }
    catch {
      return String(part)
    }
  }).join(' ')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function unwrapOption(value: unknown): unknown {
  if (isPlainObject(value) && value._id === 'Option') {
    return value._tag === 'Some' ? value.value : null
  }
  return value
}

function serializeAnnotations(annotations: unknown): Record<string, unknown> {
  if (HashMap.isHashMap(annotations)) {
    return HashMap.reduce(annotations, {} as Record<string, unknown>, (acc, value, key) => {
      acc[key as string] = unwrapOption(value)
      return acc
    })
  }
  if (isPlainObject(annotations)) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(annotations)) {
      result[key] = unwrapOption(value)
    }
    return result
  }
  return {}
}

function serializeSpans(spans: unknown): Array<{ label: string, startTime: number }> {
  if (List.isList(spans)) {
    return Array.from(spans).map(span => ({ label: (span as LogSpan.LogSpan).label, startTime: (span as LogSpan.LogSpan).startTime }))
  }
  if (Array.isArray(spans)) {
    return spans.map(span => ({ label: (span as LogSpan.LogSpan).label, startTime: (span as LogSpan.LogSpan).startTime }))
  }
  return []
}

function buildLogContext(options: {
  cause?: unknown
  spans?: unknown
  annotations?: unknown
}): Record<string, unknown> {
  const context: Record<string, unknown> = {}
  if (options.spans)
    context.effectSpans = serializeSpans(options.spans)
  if (options.annotations)
    context.effectAnnotations = serializeAnnotations(options.annotations)
  if (options.cause) {
    context.effectCause = Cause.isCause(options.cause)
      ? Cause.pretty(options.cause)
      : String(options.cause)
  }
  return context
}

function mapEffectLogLevel(label: string): 'error' | 'warn' | 'info' | 'debug' {
  switch (label) {
    case 'ERROR':
    case 'FATAL':
      return 'error'
    case 'WARN':
      return 'warn'
    case 'DEBUG':
      return 'debug'
    default:
      return 'info'
  }
}

function logToEvlogGlobal(level: 'error' | 'warn' | 'info' | 'debug', message: string, context: Record<string, unknown>): void {
  const event = { message, ...context }
  switch (level) {
    case 'error':
      evlogGlobal.error(event)
      break
    case 'warn':
      evlogGlobal.warn(event)
      break
    case 'debug':
      evlogGlobal.debug(event)
      break
    case 'info':
      evlogGlobal.info(event)
      break
  }
}

function logToRequestLog(
  requestLog: ReturnType<typeof useLogger>,
  level: 'error' | 'warn' | 'info' | 'debug',
  message: string,
  context: Record<string, unknown>,
): void {
  switch (level) {
    case 'error':
      requestLog.error(message, context)
      break
    case 'warn':
      requestLog.warn(message, context)
      break
    case 'debug':
      // The request logger returned by useLogger(event) does not expose a debug
      // method, so debug-level Effect logs are routed through evlog's global
      // logger to preserve the correct severity.
      logToEvlogGlobal('debug', message, context)
      break
    case 'info':
    default:
      requestLog.info(message, context)
  }
}

export const evlogEffectLogger = Logger.make((options) => {
  const requestLog = evlogAsyncStorage.getStore()
  const text = formatEffectMessage(options.message)
  const context = buildLogContext({
    cause: options.cause,
    spans: options.spans,
    annotations: options.annotations,
  })

  const level = mapEffectLogLevel(options.logLevel.label)

  if (!requestLog) {
    logToEvlogGlobal(level, text, context)
    return
  }

  logToRequestLog(requestLog, level, text, context)
})

function runWithEvlogLogger<T, E>(effect: EffectType.Effect<T, E, never>): Promise<T> {
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(Logger.replace(Logger.defaultLogger, evlogEffectLogger)),
      Effect.provide(Logger.minimumLogLevel(LogLevel.Debug)),
    ),
  )
}

export function runGalaxyEffect<T, E>(event: H3Event, effect: EffectType.Effect<T, E, never>): Promise<T> {
  const requestLog = useLogger(event)
  requestLog.set({ handler: event.path, method: event.method })

  return evlogAsyncStorage.run(requestLog, () => runWithEvlogLogger(effect))
}

export function runTaskEffect<T, E>(taskLog: ReturnType<typeof useLogger>, effect: EffectType.Effect<T, E, never>): Promise<T> {
  return evlogAsyncStorage.run(taskLog, () => runWithEvlogLogger(effect))
}
