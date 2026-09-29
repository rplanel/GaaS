import { Context, Effect, Layer, Option } from 'effect'

/**
 * The severity levels `blendtype` emits. Deliberately the small set every
 * logging backend agrees on, so a host application can map them 1:1.
 */
export type BlendTypeLogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * A framework-agnostic logging sink.
 *
 * `blendtype` never imports a logging library: it asks the context for this
 * service and a host application decides where the lines end up. See
 * {@link BlendTypeLoggerDefault} for the behaviour when nobody decides.
 */
export interface BlendTypeLoggerImpl {
  log: (
    level: BlendTypeLogLevel,
    message: string,
    context?: Record<string, unknown>,
  ) => Effect.Effect<void>
}

/**
 * Context tag for the logging sink. Provide a Layer for it to route every log
 * `blendtype` emits into your own logger.
 *
 * @example
 * ```ts
 * const MyLogger = Layer.succeed(BlendTypeLogger, {
 *   log: (level, message, context) => Effect.sync(() => myLogger[level](message, context)),
 * })
 *
 * getVersionEffect.pipe(Effect.provide(galaxyLayer), Effect.provide(MyLogger))
 * ```
 */
export class BlendTypeLogger extends Context.Tag('@blendtype/Logger')<BlendTypeLogger, BlendTypeLoggerImpl>() {}

function logWithEffectLogger(
  level: BlendTypeLogLevel,
  message: string,
  context: Record<string, unknown> = {},
): Effect.Effect<void> {
  const emit = level === 'debug'
    ? Effect.logDebug(message)
    : level === 'warn'
      ? Effect.logWarning(message)
      : level === 'error'
        ? Effect.logError(message)
        : Effect.log(message)

  return Object.keys(context).length > 0
    ? emit.pipe(Effect.annotateLogs(context))
    : emit
}

/**
 * The sink `blendtype` behaves as when nothing else is provided: forwards to
 * Effect's own logger, so standalone use keeps the behaviour it always had.
 *
 * Providing it is optional — {@link blendTypeLog} falls back to the same
 * behaviour on its own — but it makes the choice explicit when you build a
 * Layer stack by hand.
 *
 * Provide it at the outermost `Effect.provide` or not at all. Effect resolves
 * a tag to the *innermost* Layer that supplies it, so providing this one deep
 * inside a program silently overrides a host's logger wrapped around it, and
 * the host sees nothing at all. Leaving it out has no such hazard: the
 * fallback is a lookup miss, not a Layer that can win.
 */
export const BlendTypeLoggerDefault: Layer.Layer<BlendTypeLogger> = Layer.succeed(
  BlendTypeLogger,
  { log: logWithEffectLogger },
)

/**
 * Emits one log line through whichever {@link BlendTypeLogger} the context
 * holds, falling back to Effect's logger when it holds none.
 *
 * The fallback is what keeps the service *optional*: this returns an Effect
 * with no requirement, so adding a log line to an internal Effect never
 * changes its `R` and never forces a caller to provide anything.
 */
export function blendTypeLog(
  level: BlendTypeLogLevel,
  message: string,
  context?: Record<string, unknown>,
): Effect.Effect<void> {
  return Effect.serviceOption(BlendTypeLogger).pipe(
    Effect.flatMap(Option.match({
      onNone: () => logWithEffectLogger(level, message, context),
      onSome: logger => logger.log(level, message, context),
    })),
  )
}
