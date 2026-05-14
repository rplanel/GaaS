import { Data, Effect } from 'effect'

export class UrlFetchError extends Data.TaggedError('UrlFetchError')<{
  readonly message: string
}> {}

export function fetchUrlEffect(url: string) {
  return Effect.tryPromise({
    try: () => fetch(url),
    catch: error =>
      new UrlFetchError({
        message: `Failed to fetch ${url}: ${error}`,
      }),
  })
}
