import type { Layer } from 'effect'
import type { GalaxyDataset } from './types'
import { Effect } from 'effect'
import { DatasetError, extractStatusCode, formatErrorMessage } from './errors'
import { GalaxyFetch, toGalaxyServiceUnavailable, withRetry } from './galaxy'

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
  }).pipe(withRetry)
}

export function getDataset(datasetId: string, historyId: string, layer: Layer.Layer<GalaxyFetch>) {
  return getDatasetEffect(datasetId, historyId).pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}
