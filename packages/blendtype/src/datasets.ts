import type { GalaxyClient } from './GalaxyClient'
import type { GalaxyDataset } from './types'

import { Effect } from 'effect'
import { getErrorMessage } from './errors'

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

  public getDataset(datasetId: string, historyId: string) {
    return Effect.tryPromise({
      try: () => this.#client.api<GalaxyDataset>(
        `api/histories/${historyId}/contents/${datasetId}`,
        {
          method: 'GET',
        },
      ),
      catch: _caughtError => new Error(`Error getting dataset: ${getErrorMessage(_caughtError)}`),
    })
  }
}
