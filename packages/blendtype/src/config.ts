import { Context, Data, Effect, Layer } from 'effect'

// const API_KEY = Config.string('API_KEY')
// const GALAXY_URL = Config.string('GALAXY_URL')

export interface BlendTypeConfigImpl {
  apiKey: string
  url: string
}

// eslint-disable-next-line unicorn/throw-new-error
export class NoConfigError extends Data.TaggedError('NoConfigError')<{
  readonly message: string
}> {}

export class BlendTypeConfig extends Context.Tag('@blendtype/Config')<BlendTypeConfig, BlendTypeConfigImpl>() {}

let globalBlendtypeConfigLayer: Layer.Layer<BlendTypeConfig> | null = null

export function initializeGalaxyClient(config: BlendTypeConfigImpl): void {
  if (!globalBlendtypeConfigLayer) {
    globalBlendtypeConfigLayer = makeConfigLayer(config)
  }
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
export function runWithConfig<A>(effect: Effect.Effect<A, Error, BlendTypeConfig>): Promise<A> {
  if (!globalBlendtypeConfigLayer) {
    return Effect.runPromise(
      Effect.fail(new NoConfigError({
        message: 'Library not initialized. Call initialize() first.',
      })),
    )
  }
  return Effect.runPromise(Effect.provide(effect, globalBlendtypeConfigLayer),
  )
}
