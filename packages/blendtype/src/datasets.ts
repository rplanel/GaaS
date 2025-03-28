import type { GalaxyClient } from './GalaxyClient'
import type { GalaxyDataset } from './types'

import { Effect } from 'effect'
import { runWithConfig } from './config'
import { GalaxyFetch, HttpError } from './GalaxyClient'

export function getDatasetEffect(datasetId: string, historyId: string) {
  return Effect.gen(function* (_) {
    const fetchApi = yield* _(GalaxyFetch)
    const dataset = Effect.tryPromise({
      try: () => fetchApi<GalaxyDataset>(
        `api/histories/${historyId}/contents/${datasetId}`,
        {
          method: 'GET',
        },
      ),
      catch: _caughtError => new HttpError({ message: `Error getting dataset ${datasetId}: ${_caughtError}` }),
    })
    return yield* _(dataset)
  })
}

export function getDataset(datasetId: string, historyId: string) {
  return getDatasetEffect(datasetId, historyId).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}

export class Datasets {
  private static instance: Datasets
  #client: GalaxyClient

  private constructor(client: GalaxyClient) {
    this.#client = client
  }

  static getInstance(client: GalaxyClient): Datasets {
    if (this.instance) {
      return this.instance
    }
    this.instance = new Datasets(client)
    return this.instance
  }
}
