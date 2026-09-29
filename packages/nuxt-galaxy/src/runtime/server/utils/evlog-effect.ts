import type { Effect as EffectType, LogSpan } from 'effect'
import type { H3Event } from 'h3'
import { AsyncLocalStorage } from 'node:async_hooks'
import { BlendTypeLogger } from 'blendtype'
import { Cause, Effect, HashMap, Layer, List, Logger, LogLevel } from 'effect'
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
  // Effect passes `Cause.empty` on an ordinary log, and an empty cause is a
  // truthy object, so a cause counts only once it holds something.
  if (Cause.isCause(options.cause)) {
    if (!Cause.isEmpty(options.cause))
      context.effectCause = Cause.pretty(options.cause)
  }
  else if (options.cause) {
    context.effectCause = String(options.cause)
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
  // `message` last: a caller's context is arbitrary (blendtype passes its own
  // record), and a key called `message` overwriting the message would lose the
  // one field every query starts from.
  const event = { ...context, message }
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

/**
 * Writes one line to whichever evlog logger is in scope: the request-scoped one
 * when an `evlogAsyncStorage` run wraps the call, the global one otherwise.
 */
function writeToEvlog(
  level: 'error' | 'warn' | 'info' | 'debug',
  message: string,
  context: Record<string, unknown>,
): void {
  const requestLog = evlogAsyncStorage.getStore()
  if (!requestLog) {
    logToEvlogGlobal(level, message, context)
    return
  }
  logToRequestLog(requestLog, level, message, context)
}

export const evlogEffectLogger = Logger.make((options) => {
  writeToEvlog(
    mapEffectLogLevel(options.logLevel.label),
    formatEffectMessage(options.message),
    buildLogContext({
      cause: options.cause,
      spans: options.spans,
      annotations: options.annotations,
    }),
  )
})

/**
 * Answers `blendtype`'s request for a logger with this request's evlog logger.
 *
 * `blendtype` never imports evlog: it yields a `BlendTypeLogger` from the
 * Effect context and leaves the destination to whoever runs it. Providing this
 * Layer is what puts a log a Galaxy call emits on the same wide event as the
 * handler that made it, with the library's own context flat on the event
 * rather than buried under `effectAnnotations` the way a plain `Effect.log`
 * routed through {@link evlogEffectLogger} would be.
 */
export const BlendTypeLoggerEvlogLayer: Layer.Layer<BlendTypeLogger> = Layer.succeed(
  BlendTypeLogger,
  { log: (level, message, context = {}) => Effect.sync(() => writeToEvlog(level, message, context)) },
)

function runWithEvlogLogger<T, E>(effect: EffectType.Effect<T, E, BlendTypeLogger>): Promise<T> {
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(BlendTypeLoggerEvlogLayer),
      Effect.provide(Logger.replace(Logger.defaultLogger, evlogEffectLogger)),
      Effect.provide(Logger.minimumLogLevel(LogLevel.Debug)),
    ),
  )
}

export function runGalaxyEffect<T, E>(event: H3Event, effect: EffectType.Effect<T, E, BlendTypeLogger>): Promise<T> {
  const requestLog = useLogger(event)
  requestLog.set({ handler: event.path, method: event.method })

  return evlogAsyncStorage.run(requestLog, () => runWithEvlogLogger(effect))
}

export function runTaskEffect<T, E>(taskLog: ReturnType<typeof useLogger>, effect: EffectType.Effect<T, E, BlendTypeLogger>): Promise<T> {
  return evlogAsyncStorage.run(taskLog, () => runWithEvlogLogger(effect))
}
