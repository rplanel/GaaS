import type { BlendTypeConfigImpl } from './config'
import type { GalaxyVersion } from './types'
import { Context, Data, Effect, Layer } from 'effect'
import { $fetch } from 'ofetch'
import { BlendTypeConfig, makeConfigLayer, NoConfigError } from './config'
import { extractStatusCode, formatErrorMessage, GalaxyApiError } from './errors'

/**
 * GalaxyFetch is a service that provides a fetch function that is configured with the Galaxy API key.
 * @description
 * Represents a service tag for creating a customized $fetch instance configured
 * with the Galaxy API key. This class extends the Effect Context.Tag, allowing
 * it to be provided as a layer within an Effect-based application.
 *
 * @remarks
 * The created $fetch instance automatically includes the necessary headers and
 * base URL for interacting with the Galaxy API. This setup streamlines requests
 * and error handling when used alongside other layers in the Effect library.
 *
 * @example
 * ```ts
 * import { Effect } from 'effect'
 *
 * const myEffect = Effect.sync(() => console.log('Using GalaxyFetch layer'))
 *   .pipe(Effect.provide(GalaxyFetch.Live))
 *
 * myEffect.run()
 * ```
 */
export class GalaxyFetch extends Context.Tag('@blendtype/GalaxyFetch')<
  GalaxyFetch,
  ReturnType<typeof $fetch.create>
>() {
  static readonly Live = Layer.effect(
    GalaxyFetch,
    Effect.gen(function* () {
      const { apiKey, url } = yield* BlendTypeConfig
      if (!url || !apiKey) {
        return yield* Effect.fail(new NoConfigError({
          message: 'Galaxy URL and API key are not configured. Set GALAXY_URL and GALAXY_API_KEY environment variables or pass them in the config.',
        }))
      }
      return $fetch.create({
        headers: {
          'x-api-key': apiKey,
          'accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
        },
        baseURL: url,
      })
    }),
  )
}

/**
 * Builds a complete layer that satisfies GalaxyFetch (and its BlendTypeConfig dependency).
 *
 * Use this to create a single layer you can provide to any Effect that requires GalaxyFetch.
 *
 * @param config - Galaxy API configuration (url + apiKey)
 * @returns A Layer that provides GalaxyFetch (backed by a real $fetch client)
 *
 * @example
 * ```typescript
 * const layer = makeGalaxyLayer({ apiKey: 'key', url: 'https://galaxy.example.com' })
 *
 * // Use with an Effect
 * getWorkflowEffect('workflow-id').pipe(
 *   Effect.provide(layer),
 *   Effect.runPromise,
 * )
 *
 * // Use with a Promise wrapper
 * await getWorkflow('workflow-id', layer)
 * ```
 */
export function makeGalaxyLayer(config: BlendTypeConfigImpl) {
  const configLayer = makeConfigLayer(config)
  const galaxyFetchLayer = GalaxyFetch.Live.pipe(Layer.provide(configLayer))
  // Expose both GalaxyFetch and BlendTypeConfig so downstream effects
  // that directly read config (e.g., uploadFileToHistoryEffect for TUS endpoint)
  // are also satisfied.
  return Layer.merge(galaxyFetchLayer, configLayer)
}

export class GalaxyServiceUnavailable extends Data.TaggedError('GalaxyServiceUnavailable')<{
  readonly message: string
}> {}

export class HttpError extends Data.TaggedError('HttpError')<{
  readonly message: string
}> {}

export function toGalaxyServiceUnavailable<A, E, C>(effect: Effect.Effect<A, E, C>) {
  return Effect.mapError(
    effect,
    (error) => {
      const errObj = error as { message?: string }
      if (errObj?.message && typeof errObj.message === 'string' && errObj.message.includes('Service Unavailable')) {
        return new GalaxyServiceUnavailable({ message: 'Galaxy service is unavailable' })
      }
      return error
    },
  )
}

/**
 * Creates an HTTP error with proper status code and cause tracking.
 */
export function createHttpError(
  error: unknown,
  resourceType: string,
  resourceId?: string,
): GalaxyApiError {
  const statusCode = extractStatusCode(error)
  const message = formatErrorMessage(resourceType, resourceId, 'Error', error)

  return new GalaxyApiError({
    message,
    statusCode,
    cause: error,
  })
}

export const getVersionEffect = Effect.gen(function* () {
  const fetchApi = yield* GalaxyFetch
  return yield* Effect.tryPromise({
    try: () => fetchApi<GalaxyVersion>('/api/version'),
    catch: caughtError => createHttpError(caughtError, 'version'),
  })
})

/**
 * @name getVersion
 * @description
 *
 * Get the Galaxy version.
 * @param layer - A Layer providing GalaxyFetch (use makeGalaxyLayer() to create one)
 * @returns Promise<GalaxyVersion>
 */
export function getVersion(layer: Layer.Layer<GalaxyFetch>) {
  return getVersionEffect
    .pipe(
      toGalaxyServiceUnavailable,
      Effect.provide(layer),
      Effect.runPromise,
    )
}
