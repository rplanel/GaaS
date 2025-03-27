import type { GalaxyClient } from './GalaxyClient'
import type { GalaxyHistoryDetailed, GalaxyUploadedDataset, HDASummary } from './types'
import { Effect } from 'effect'
import { GalaxyFetch, HttpError } from './GalaxyClient'
import { delay } from './helpers'
import { DatasetsTerminalStates } from './types'

export function createHistory(name: string) {
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
  }).pipe(
    Effect.provide(GalaxyFetch.Live),
    Effect.runPromise,
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
    const payload: Record<string, unknown> = {
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
    const datasetDescription = await this.#client.datasets().getDataset(datasetId, historyId)
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
