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
