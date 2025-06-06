import type { GalaxyHistoryDetailed, GalaxyUploadedDataset } from './types'
import { Console, Data, Effect } from 'effect'
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

// eslint-disable-next-line unicorn/throw-new-error
export class DeleteGalaxyHistoryHttpError extends Data.TaggedError('DeleteGalaxyHistoryHttpError')<{
  readonly message: string
}> {}

export function deleteHistoryEffect(historyId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const history = Effect.tryPromise({
      try: () => fetchApi<GalaxyHistoryDetailed>(`api/histories/${historyId}`, {
        method: 'DELETE',
        body: { purge: true },
      }),
      catch: _caughtError => new DeleteGalaxyHistoryHttpError({ message: `Error deleting history ${historyId}: ${_caughtError}` }),
    })
    return yield* history.pipe(Effect.tap(() => Console.log(`Deleted history ${historyId}`)))
  })
}

export function deleteHistory(historyId: string) {
  return deleteHistoryEffect(historyId).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}

interface UploadFileBaseParams {
  historyId: string
  name: string
}
interface uploadFileFromUrl extends UploadFileBaseParams {
  srcUrl: string
}

interface uploadFileFromFile extends UploadFileBaseParams {
  blob: Blob
}

export function uploadFileToHistoryEffect(params: uploadFileFromUrl | uploadFileFromFile) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    // let payload: Record<string, any> = {}
    if ('blob' in params) {
      const { historyId, blob, name } = params
      const file = new File([blob], name)
      // console.log('Uploading file name', name)
      // console.log('Uploading file from blob', blob)
      // console.log('Blob size:', blob.size)
      // console.log('Blob type:', blob.type)
      // console.log(typeof blob)
      // console.log('File to upload:', file)
      const formData = new FormData()
      // formData.append('history_id', historyId)
      formData.append('history_id', 'e4d3a344ef26d9ea')
      formData.append('targets', JSON.stringify([{
        destination: { type: 'hdas' },
        elements: [{
          src: 'files',
          name,
          dbkey: '?',
          ext: 'auto',
          space_to_tab: false,
          to_posix_lines: true,
        }],
      }]))

      // [{"destination":{"type":"hdas"},"elements":[{"src":"files","name":"","dbkey":"?","ext":"auto","space_to_tab":false,"to_posix_lines":true}]}]
      formData.append('auto_decompress', 'true')
      formData.append('files', file)

      // payload = {
      //   history_id: historyId,
      //   targets: [{
      //     destination: {
      //       type: 'hdas',
      //     },
      //     elements: [{
      //       src: 'files',
      //       name,
      //       dbkey: '?',
      //       ext: 'auto',
      //       space_to_tab: false,
      //       to_posix_lines: true,
      //       deferred: false,

      //     }],
      //   }],
      //   auto_decompress: true,
      //   files: [blob],
      // }
      //
      const uploadedDataset = Effect.tryPromise({
        try: () => fetchApi<GalaxyUploadedDataset>('api/tools/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'multipart/form-data' },
          // body: payload,
          body: formData,
        }),
        catch: _caughtError => new HttpError({
          message: `Error uploading file ${name}: ${_caughtError}`,
        }),
      }).pipe(
        Effect.tap(input => Console.log(`Uploaded file ${name} to history ${historyId}\n input: ${input}`)),
        Effect.catchAllCause((cause) => {
          return deleteHistoryEffect(historyId).pipe(
            Effect.flatMap(() => Effect.fail(cause)),
          )
        }),
      )
      return yield* uploadedDataset
    }
    else {
      const uploadedDataset = uploadFileToHistoryFromUrlEffect(params)
      return yield* uploadedDataset
    }

    // return yield* uploadedDataset.pipe(Effect.catchAll((error) => {
    //   return deleteHistoryEffect(historyId)
    //   // return Effect.succeed(`Recovering from ${error._tag}`)
    // },
    //   // deleteHistoryEffect(historyId)
    // ))
  })
}

export function uploadFileToHistory(params: uploadFileFromUrl | uploadFileFromFile) {
  return uploadFileToHistoryEffect(params).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}

export function uploadFileToHistoryFromUrlEffect(params: uploadFileFromUrl) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const { historyId, srcUrl, name } = params
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

    return yield* Effect.tryPromise({
      try: () => fetchApi<GalaxyUploadedDataset>('api/tools/fetch', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
      catch: _caughtError => new HttpError({
        message: `Error uploading file ${name} from url ${srcUrl}: ${_caughtError}`,
      }),
    }).pipe(
      Effect.tap(input => Console.log(`Uploaded file ${name} to history ${historyId}\n input: ${input}`)),
      Effect.catchAllCause((cause) => {
        return deleteHistoryEffect(historyId).pipe(
          Effect.flatMap(() => Effect.fail(cause)),
        )
      }),
    )
  })
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
