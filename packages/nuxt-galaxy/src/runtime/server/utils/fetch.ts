// import { useRuntimeConfig } from '#imports'
import { Context, Data, Effect, Layer } from 'effect'

export class UrlFetchError extends Data.TaggedError('UrlFetchError')<{
  readonly message: string
}> {}

export class UrlFetch extends Context.Tag('@nuxt-galaxy/UrlFetch')<
  UrlFetch,
  (url: string) => Effect.Effect<Response, UrlFetchError>
>() {
  static readonly Live = Layer.effect(
    UrlFetch,
    Effect.gen(function* () {
      // const config = useRuntimeConfig()
      // const timeout = config.public?.fetchTimeout || 30000

      return (url: string) =>
        Effect.tryPromise({
          // signal: AbortSignal.timeout(timeout),
          try: () => fetch(url),
          catch: error =>
            new UrlFetchError({
              message: `Failed to fetch ${url}: ${error}`,
            }),
        })
    }),
  )
}
