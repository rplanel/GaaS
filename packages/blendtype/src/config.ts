import { Context, Data, Effect, Layer } from 'effect'
import { toGalaxyServiceUnavailable } from './galaxy'

// const API_KEY = Config.string('API_KEY')
// const GALAXY_URL = Config.string('GALAXY_URL')

export interface BlendTypeConfigImpl {
  apiKey: string
  url: string
}

export class NoConfigError extends Data.TaggedError('NoConfigError')<{
  readonly message: string
}> {}

export class BlendTypeConfig extends Context.Tag('@blendtype/Config')<BlendTypeConfig, BlendTypeConfigImpl>() {}

let globalBlendtypeConfigLayer: Layer.Layer<BlendTypeConfig> | null = null

export function initializeGalaxyClient(config: BlendTypeConfigImpl): Layer.Layer<BlendTypeConfig> {
  if (!globalBlendtypeConfigLayer) {
    globalBlendtypeConfigLayer = makeConfigLayer(config)
  }
  return globalBlendtypeConfigLayer
}

export function makeConfigLayer(config: BlendTypeConfigImpl) {
  return Layer.effect(
    BlendTypeConfig,
    Effect.succeed(config).pipe(
      Effect.tap(() => Effect.log('initialized')),
    ),
  )
}

export const BlendTypeConfigLive = Layer.effect(
  BlendTypeConfig,

)

// Helper to run Effects with the global config
export function runWithConfig<A, E>(effect: Effect.Effect<A, E, BlendTypeConfig>) {
  if (!globalBlendtypeConfigLayer) {
    return Effect.runPromise(
      Effect.fail(new NoConfigError({
        message: 'Library not initialized. Call initializeGalaxyClient({apiKey: "api-key", url: "galaxy-url"}) first.',
      })),
    )
  }

  const sanitizeEffect = effect.pipe(
    toGalaxyServiceUnavailable,
  )
  return Effect.runPromise(
    Effect.provide(
      sanitizeEffect,
      globalBlendtypeConfigLayer,
    ),
  )
}

export function runWithConfigExit<A, E>(effect: Effect.Effect<A, E, BlendTypeConfig>) {
  if (!globalBlendtypeConfigLayer) {
    return Effect.runPromise(
      Effect.fail(new NoConfigError({
        message: 'Library not initialized. Call initializeGalaxyClient({apiKey: "api-key", url: "galaxy-url"}) first.',
      })),
    )
  }
  const sanitizeEffect = effect.pipe(
    toGalaxyServiceUnavailable,
  )
  return Effect.runPromiseExit(
    Effect.provide(
      sanitizeEffect,
      globalBlendtypeConfigLayer,
    ),
  )
}
