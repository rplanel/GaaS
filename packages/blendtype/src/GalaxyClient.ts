import type { $Fetch } from 'ofetch'
import type { GalaxyVersion } from './types'
import { Context, Data, Effect, Layer } from 'effect'
import { $fetch } from 'ofetch'
import { BlendTypeConfig, runWithConfig } from './config'
import { Datasets } from './datasets'
import { Histories } from './histories'
import { Invocations } from './invocations'
import { Jobs } from './jobs'
import { Tools } from './tools'
import { Workflows } from './workflows'

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
 * import { GalaxyFetch } from './GalaxyClient'
 *
 * const myEffect = Effect.sync(() => console.log('Using GalaxyFetch layer'))
 *   .pipe(Effect.provide(GalaxyFetch.Live))
 *
 * myEffect.run()
 * ```
 */
export class GalaxyFetch extends Context.Tag('@blendtype/GalaxyFetch')<GalaxyFetch, ReturnType<typeof $fetch.create>>() {
  static readonly Live = Layer.effect(
    GalaxyFetch,
    Effect.gen(function* (_) {
      const { apiKey, url } = yield* _(BlendTypeConfig)
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
export class HttpError extends Data.TaggedError('HttpError')<{
  readonly message: string
}> {}

export const getVersionEffect = Effect.gen(function* (_) {
  const fetchApi = yield* _(GalaxyFetch)
  return yield* _(Effect.tryPromise({
    try: () => fetchApi<GalaxyVersion>('/api/version'),
    catch: _caughtError => new HttpError({ message: `Error getting version: ${_caughtError}` }),
  }))
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

export class GalaxyClient {
  private static instance: GalaxyClient
  #apiKey: string
  url: string
  api: $Fetch

  private constructor(apiKey: string, url: string) {
    this.#apiKey = apiKey
    this.url = url
    const fetch = $fetch.create({
      headers: {
        'x-api-key': apiKey,
        'accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
      },

      baseURL: this.url,
    })
    this.api = fetch
  }

  static getInstance(apiKey: string, url: string): GalaxyClient {
    if (this.instance) {
      return this.instance
    }
    this.instance = new GalaxyClient(apiKey, url)
    return this.instance
  }

  public async getVersion(): Promise<GalaxyVersion> {
    return await this.api('/api/version')
  }

  public histories(): Histories {
    return Histories.getInstance(this)
  }

  public workflows(): Workflows {
    return Workflows.getInstance(this)
  }

  public tools(): Tools {
    return Tools.getInstance(this)
  }

  public invocations(): Invocations {
    return Invocations.getInstance(this)
  }

  public jobs(): Jobs {
    return Jobs.getInstance(this)
  }

  public datasets(): Datasets {
    return Datasets.getInstance(this)
  }
}
