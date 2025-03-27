// import type { $Fetch } from 'nitropack'
import type { $Fetch } from 'ofetch'
import type { BlendTypeConfigImpl } from './config'
import type { GalaxyVersion } from './types'
import { Context, Data, Effect, Layer } from 'effect'
import { $fetch } from 'ofetch'
import { BlendTypeConfig, makeConfigLayer } from './config'
import { Datasets } from './datasets'
import { Histories } from './histories'
import { Invocations } from './invocations'
import { Jobs } from './jobs'
import { Tools } from './tools'
import { Workflows } from './workflows'

let globalLayer: Layer.Layer<BlendTypeConfig> | null = null

export function initialize(config: BlendTypeConfigImpl): void {
  globalLayer = makeConfigLayer(config)
}
// eslint-disable-next-line unicorn/throw-new-error
export class NoConfigError extends Data.TaggedError('NoConfigError')<{
  readonly message: string
}> {}

// Helper to run Effects with the global config
function runWithConfig<A>(effect: Effect.Effect<A, Error, BlendTypeConfig>): Promise<A> {
  if (!globalLayer) {
    return Effect.runPromise(
      Effect.fail(new NoConfigError({
        message: 'Library not initialized. Call initialize() first.',
      })),
    )
  }
  return Effect.runPromise(Effect.provide(effect, globalLayer),
  )
}

/**
 * GalaxyFetch is a service that provides a fetch function that is configured with the Galaxy API key.
 *
 */

// const API_KEY = Config.string("API_KEY");
// const GALAXY_URL = Config.string("GALAXY_URL");

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

/**
 * Get the Galaxy version.
 * @param apiKey
 * @returns Promise<GalaxyVersion>
 */
export function getVersion() {
  return Effect.gen(function* (_) {
    const fetchApi = yield* _(GalaxyFetch)
    const version = Effect.tryPromise({
      try: () => fetchApi<GalaxyVersion>('/api/version'),
      catch: _caughtError => new HttpError({ message: `Error getting version: ${_caughtError}` }),
    })
    return yield* _(version)
  }).pipe(
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
