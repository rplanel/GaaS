import type { GalaxyDataset } from './types'
import { Effect } from 'effect'
import { runWithConfig } from './config'
import { DatasetError, extractStatusCode, formatErrorMessage } from './errors'
import { GalaxyFetch } from './galaxy'

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
      catch: caughtError => new DatasetError({
        message: formatErrorMessage('dataset', datasetId, 'Error getting', caughtError),
        datasetId,
        historyId,
        statusCode: extractStatusCode(caughtError),
        cause: caughtError,
      }),
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
 * @returns An Effect that yields the fetch Response or fails with a DatasetError
 *
 * @example
 * ```typescript
 * const dataset = fetchDatasetEffect('https://api.example.com/dataset');
 * ```
 *
 * @throws {DatasetError} When the fetch operation fails for any reason
 */
export function fetchDatasetEffect(url: string) {
  return Effect.gen(function* () {
    const response = Effect.tryPromise({
      try: () => fetch(url),
      catch: caughtError => new DatasetError({
        message: formatErrorMessage('dataset from URL', url, 'Error fetching', caughtError),
        statusCode: extractStatusCode(caughtError),
        cause: caughtError,
      }),
    })
    return yield* response
  })
}
