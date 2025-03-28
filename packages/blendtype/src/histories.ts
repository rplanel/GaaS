import type { GalaxyClient } from './GalaxyClient'
import type { GalaxyHistoryDetailed, GalaxyUploadedDataset, HDASummary } from './types'
import { Effect } from 'effect'
import { runWithConfig } from './config'
import { getDataset, getDatasetEffect } from './datasets'
import { GalaxyFetch, HttpError } from './GalaxyClient'
import { delay } from './helpers'
import { DatasetsTerminalStates } from './types'

export function createHistoryEffect(name: string) {
  return Effect.gen(function* (_) {
    const fetchApi = yield* _(GalaxyFetch)
    const history = Effect.tryPromise({
      try: () => fetchApi<GalaxyHistoryDetailed>('api/histories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `name=${name}`,
      }),
      catch: _caughtError => new HttpError({ message: `Error creating history: ${_caughtError}` }),
    })
    return yield* _(history)
  })
}

export function createHistory(name: string) {
  return createHistoryEffect(name).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}

export function getHistoryEffect(historyId: string) {
  return Effect.gen(function* (_) {
    const fetchApi = yield* _(GalaxyFetch)
    const histories = Effect.tryPromise({
      try: () => fetchApi<GalaxyHistoryDetailed[]>(`api/histories/${historyId}`, {
        method: 'GET',
      }),
      catch: _caughtError => new HttpError({ message: `Error getting history ${historyId}: ${_caughtError}` }),
    })
    return yield* _(histories)
  })
}
export function getHistory(historyId: string) {
  return getHistoryEffect(historyId).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}

export function getHistoriesEffect() {
  return Effect.gen(function* (_) {
    const fetchApi = yield* _(GalaxyFetch)
    const histories = Effect.tryPromise({
      try: () => fetchApi<GalaxyHistoryDetailed[]>('api/histories', {
        method: 'GET',
      }),
      catch: _caughtError => new HttpError({ message: `Error getting histories: ${_caughtError}` }),
    })
    return yield* _(histories)
  })
}

export function getHistories() {
  return getHistoriesEffect().pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}

export function deleteHistoryEffect(historyId: string) {
  return Effect.gen(function* (_) {
    const fetchApi = yield* _(GalaxyFetch)
    const history = Effect.tryPromise({
      try: () => fetchApi<GalaxyHistoryDetailed>(`api/histories/${historyId}`, {
        method: 'DELETE',
        body: { purge: true },
      }),
      catch: _caughtError => new HttpError({ message: `Error deleting history ${historyId}: ${_caughtError}` }),
    })
    return yield* _(history)
  })
}

export function deleteHistory(historyId: string) {
  return deleteHistoryEffect(historyId).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}

export function uploadFileEffect(historyId: string, srcUrl: string, name: string | undefined) {
  return Effect.gen(function* (_) {
    const fetchApi = yield* _(GalaxyFetch)
    const payload: Record<string, any> = {
      history_id: historyId,
      targets: [{
        destination: { type: 'hdas' },
        elements: [{
          src: 'url',
          url: srcUrl,
          name,
          dbkey: '?',
          ext: 'auto',
          space_to_tab: false,
          to_posix_lines: true,
        }],
      }],
      auto_decompress: true,
      files: [],
    }
    const uploadedDataset = Effect.tryPromise({
      try: () => fetchApi<GalaxyUploadedDataset>('api/tools/fetch', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
      catch: _caughtError => new HttpError({ message: `Error uploading file ${name} from url ${srcUrl}: ${_caughtError}` }),
    })
    return yield* _(uploadedDataset)
  })
}

export function uploadFile(historyId: string, srcUrl: string, name: string | undefined) {
  return uploadFileEffect(historyId, srcUrl, name).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}

// downloadDataset
export function downloadDatasetEffect(historyId: string, datasetId: string) {
  return Effect.gen(function* (_) {
    const fetchApi = yield* _(GalaxyFetch)
    const datasetDescription = yield* _(getDatasetEffect(datasetId, historyId))
    if (datasetDescription.file_size === 0) {
      return yield* _(Effect.succeed(new Blob([])))
    }
    else {
      const dataset = Effect.tryPromise({
        try: () => fetchApi<Blob>(`api/histories/${historyId}/contents/${datasetId}/display`, {
          method: 'GET',
        }),
        catch: _caughtError => new HttpError({ message: `Error downloading dataset: ${_caughtError}` }),
      })
      return yield* _(dataset)
    }
  })
}

export function downloadDataset(historyId: string, datasetId: string) {
  return downloadDatasetEffect(historyId, datasetId).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}

export class Histories {
  private static instance: Histories
  #client: GalaxyClient

  private constructor(client: GalaxyClient) {
    this.#client = client
  }

  static getInstance(client: GalaxyClient): Histories {
    if (this.instance) {
      return this.instance
    }
    this.instance = new Histories(client)
    return this.instance
  }

  public async createHistory(name: string): Promise<GalaxyHistoryDetailed> {
    return this.#client.api(
      'api/histories',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `name=${name}`,
      },
    )
  }

  public async deleteHistory(historyId: string): Promise<GalaxyHistoryDetailed> {
    return this.#client.api(`api/histories/${historyId}`, {
      method: 'DELETE',
      body: { purge: true },
    })
  }

  public async getHistories(): Promise<GalaxyHistoryDetailed[]> {
    return this.#client.api('api/histories', {
      method: 'GET',
    })
  }

  public async getHistory(historyId: string): Promise<GalaxyHistoryDetailed> {
    return this.#client.api(`api/histories/${historyId}`, {
      method: 'GET',
    })
  }

  public async uploadFile(historyId: string, srcUrl: string, name: string | undefined): Promise<GalaxyUploadedDataset> {
    const payload: Record<string, any> = {
      history_id: historyId,
      targets: [{
        destination: { type: 'hdas' },
        elements: [{
          src: 'url',
          url: srcUrl,
          name,
          dbkey: '?',
          ext: 'auto',
          space_to_tab: false,
          to_posix_lines: true,
        }],
      }],
      auto_decompress: true,
      files: [],
    }

    return this.#client.api(
      'api/tools/fetch',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
  }

  public async getListDatasets(historyId: string): Promise<HDASummary[] | undefined> {
    const terminalStatesSet = new Set<string>(DatasetsTerminalStates)
    let terminalState = false

    while (!terminalState) {
      const datasets: HDASummary[] = await this.#client.api(
        `api/histories/${historyId}/contents`,
        {
          method: 'GET',
          params: {
            V: 'dev',
          },
        },
      )
      terminalState = datasets
        .map(d => d.state)
        .every(state => terminalStatesSet.has(state))
      if (terminalState)
        return datasets
      await delay(3000)
    }
  }

  public async downloadDataset(historyId: string, datasetId: string): Promise<Blob | undefined> {
    const datasetDescription = await getDataset(datasetId, historyId)
    if (datasetDescription.file_size === 0)
      return new Blob([])
    return this.#client.api(
      `api/histories/${historyId}/contents/${datasetId}/display`,
      {
        method: 'GET',
      },
    )
  }
}
