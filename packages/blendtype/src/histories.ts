import type { GalaxyHistoryDetailed, GalaxyUploadedDataset } from './types'
import { Effect } from 'effect'
import { runWithConfig } from './config'
import { getDatasetEffect } from './datasets'
import { GalaxyFetch, HttpError } from './galaxy'

export function createHistoryEffect(name: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const history = Effect.tryPromise({
      try: () => fetchApi<GalaxyHistoryDetailed>('api/histories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `name=${name}`,
      }),
      catch: _caughtError => new HttpError({ message: `Error creating history: ${_caughtError}` }),
    })
    return yield* history
  })
}

export function createHistory(name: string) {
  return createHistoryEffect(name).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}

export function getHistoryEffect(historyId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const histories = Effect.tryPromise({
      try: () => fetchApi<GalaxyHistoryDetailed>(`api/histories/${historyId}`, {
        method: 'GET',
      }),
      catch: _caughtError => new HttpError({ message: `Error getting history ${historyId}: ${_caughtError}` }),
    })
    return yield* histories
  })
}
export function getHistory(historyId: string) {
  return getHistoryEffect(historyId).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}

export function getHistoriesEffect() {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const histories = Effect.tryPromise({
      try: () => fetchApi<GalaxyHistoryDetailed[]>('api/histories', {
        method: 'GET',
      }),
      catch: _caughtError => new HttpError({ message: `Error getting histories: ${_caughtError}` }),
    })
    return yield* histories
  })
}

export function getHistories() {
  return getHistoriesEffect().pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}

export function deleteHistoryEffect(historyId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const history = Effect.tryPromise({
      try: () => fetchApi<GalaxyHistoryDetailed>(`api/histories/${historyId}`, {
        method: 'DELETE',
        body: { purge: true },
      }),
      catch: _caughtError => new HttpError({ message: `Error deleting history ${historyId}: ${_caughtError}` }),
    })
    return yield* history
  })
}

export function deleteHistory(historyId: string) {
  return deleteHistoryEffect(historyId).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}

export function uploadFileToHistoryEffect(historyId: string, srcUrl: string, name: string | undefined) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
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
    return yield* uploadedDataset
  })
}

export function uploadFileToHistory(historyId: string, srcUrl: string, name: string | undefined) {
  return uploadFileToHistoryEffect(historyId, srcUrl, name).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}

// downloadDataset
export function downloadDatasetEffect(historyId: string, datasetId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const datasetDescription = yield* getDatasetEffect(datasetId, historyId)
    if (datasetDescription.file_size === 0) {
      return yield* Effect.succeed(new Blob([]))
    }
    else {
      const dataset = Effect.tryPromise({
        try: () => fetchApi<Blob>(`api/histories/${historyId}/contents/${datasetId}/display`, {
          method: 'GET',
        }),
        catch: _caughtError => new HttpError({ message: `Error downloading dataset: ${_caughtError}` }),
      })
      return yield* dataset
    }
  })
}

export function downloadDataset(historyId: string, datasetId: string) {
  return downloadDatasetEffect(historyId, datasetId).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}
