import { Context, Data, Effect, Layer } from 'effect'
import { blendTypeLog } from './logger'

export interface BlendTypeConfigImpl {
  apiKey: string
  url: string
}

export class NoConfigError extends Data.TaggedError('NoConfigError')<{
  readonly message: string
}> {}

export class BlendTypeConfig extends Context.Tag('@blendtype/Config')<BlendTypeConfig, BlendTypeConfigImpl>() {}

export function makeConfigLayer(config: BlendTypeConfigImpl) {
  return Layer.effect(
    BlendTypeConfig,
    Effect.succeed(config).pipe(
      Effect.tap(() => blendTypeLog('info', 'initialized')),
    ),
  )
}
