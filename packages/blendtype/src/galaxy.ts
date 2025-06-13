import type { GalaxyVersion } from './types'
import { Context, Data, Effect, Layer } from 'effect'
import { $fetch } from 'ofetch'
import { BlendTypeConfig, NoConfigError, runWithConfig } from './config'
// import 'dotenv/config'

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
        // if (typeof window === 'undefined') {
        // // try to get the config from env variables
        //   if (!process.env.GALAXY_URL) {
        //     return yield* Effect.fail(new NoConfigError({
        //       message: `Galaxy URL is not configured.
        //     Set GALAXY_URL environment variable or
        //     pass it in the config.`,
        //     }))
        //   }
        //   else {
        //     url = process.env.GALAXY_URL
        //   }

        //   if (!process.env.GALAXY_API_KEY) {
        //     return yield* Effect.fail(new NoConfigError({
        //       message: 'Galaxy API key is not configured. Set GALAXY_API_KEY environment variable or pass it in the config.',
        //     }))
        //   }
        //   else {
        //     apiKey = process.env.GALAXY_API_KEY
        //   }
        // }
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

// eslint-disable-next-line unicorn/throw-new-error
export class GalaxyServiceUnavailable extends Data.TaggedError('GalaxyServiceUnavailable')<{
  readonly message: string
}> {}

// eslint-disable-next-line unicorn/throw-new-error
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

export const getVersionEffect = Effect.gen(function* () {
  const fetchApi = yield* GalaxyFetch
  return yield* Effect.tryPromise({
    try: () => fetchApi<GalaxyVersion>('/api/version'),
    catch: _caughtError => new HttpError({ message: `Error getting version: ${_caughtError}` }),
  })
})

/**
 * @name getVersion
 * @description
 *
 * Get the Galaxy version.
 * @returns Promise<GalaxyVersion>
 */
export function getVersion() {
  return getVersionEffect
    .pipe(
      Effect.provide(GalaxyFetch.Live),
      runWithConfig,
    )
}
