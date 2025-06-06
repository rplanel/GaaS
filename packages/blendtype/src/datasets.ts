import type { GalaxyDataset } from './types'
import { Effect } from 'effect'
import { runWithConfig } from './config'
import { GalaxyFetch, HttpError } from './galaxy'

export function getDatasetEffect(datasetId: string, historyId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const dataset = Effect.tryPromise({
      try: () => fetchApi<GalaxyDataset>(
        `api/histories/${historyId}/contents/${datasetId}`,
        {
          method: 'GET',
        },
      ),
      catch: _caughtError => new HttpError({ message: `Error getting dataset ${datasetId}: ${_caughtError}` }),
    })
    return yield* dataset
  })
}

export function getDataset(datasetId: string, historyId: string) {
  return getDatasetEffect(datasetId, historyId).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}

/**
 * Fetches a dataset from the specified URL using Effect-based error handling.
 *
 * @param url - The URL to fetch the dataset from
 * @returns An Effect that yields the fetch Response or an HttpError if the request fails
 *
 * @example
 * ```typescript
 * const dataset = fetchDatasetEffect('https://api.example.com/dataset');
 * ```
 *
 * @throws {HttpError} When the fetch operation fails for any reason
 */
export function fetchDatasetEffect(url: string) {
  return Effect.gen(function* () {
    const response = Effect.tryPromise({
      try: () => fetch(url),
      catch: _caughtError => new HttpError({ message: `Error fetching dataset from ${url}: ${_caughtError}` }),
    })
    return yield* response
  })
}
