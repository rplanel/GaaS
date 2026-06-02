import type { Layer } from 'effect'
import type { Buffer } from 'node:buffer'
import type { GalaxyHistoryDetailed, GalaxyUploadedDataset } from './types'
import { Console, Data, Effect } from 'effect'
import * as tus from 'tus-js-client'
import { BlendTypeConfig } from './config'
import { getDatasetEffect } from './datasets'
import { extractStatusCode, formatErrorMessage, HistoryError } from './errors'
import { GalaxyFetch, toGalaxyServiceUnavailable, withRetry } from './galaxy'

export class TusUploadError extends Data.TaggedError('TusUploadError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

export type TusUploadSource = File | Blob | Buffer | Pick<ReadableStreamDefaultReader, 'read'>

export function uploadWithTus(
  source: TusUploadSource,
  tusEndpoint: string,
  metadata: Record<string, string>,
  apiKey: string,
  chunkSize: number = 10485760,
): Effect.Effect<string, TusUploadError> {
  return Effect.async((resume) => {
    const upload = new tus.Upload(source, {
      endpoint: tusEndpoint,
      retryDelays: [0, 3000, 10000],
      chunkSize,
      metadata,
      headers: {
        'x-api-key': apiKey,
      },
      onError: (error) => {
        resume(
          Effect.fail(
            new TusUploadError({
              message: `TUS upload failed: ${error.message}`,
              cause: error,
            }),
          ),
        )
      },
      onSuccess: () => {
        const sessionId = upload.url?.split('/').at(-1) || ''
        resume(Effect.succeed(sessionId))
      },
    })

    upload.start()
  })
}

export function createHistoryEffect(name: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const history = Effect.tryPromise({
      try: () =>
        fetchApi<GalaxyHistoryDetailed>('api/histories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `name=${name}`,
        }),
      catch: caughtError =>
        new HistoryError({
          message: formatErrorMessage(
            'history',
            name,
            'Error creating',
            caughtError,
          ),
          statusCode: extractStatusCode(caughtError),
          cause: caughtError,
        }),
    })
    return yield* history
  })
}

export function createHistory(name: string, layer: Layer.Layer<GalaxyFetch>) {
  return createHistoryEffect(name).pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}

export function getHistoryEffect(historyId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const histories = Effect.tryPromise({
      try: () =>
        fetchApi<GalaxyHistoryDetailed>(`api/histories/${historyId}`, {
          method: 'GET',
        }),
      catch: caughtError =>
        new HistoryError({
          message: formatErrorMessage(
            'history',
            historyId,
            'Error getting',
            caughtError,
          ),
          historyId,
          statusCode: extractStatusCode(caughtError),
          cause: caughtError,
        }),
    })
    return yield* histories
  }).pipe(withRetry)
}

export function getHistory(historyId: string, layer: Layer.Layer<GalaxyFetch>) {
  return getHistoryEffect(historyId).pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}

export function getHistoriesEffect() {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const histories = Effect.tryPromise({
      try: () =>
        fetchApi<GalaxyHistoryDetailed[]>('api/histories', {
          method: 'GET',
        }),
      catch: caughtError =>
        new HistoryError({
          message: formatErrorMessage(
            'histories',
            undefined,
            'Error getting',
            caughtError,
          ),
          statusCode: extractStatusCode(caughtError),
          cause: caughtError,
        }),
    })
    return yield* histories
  }).pipe(withRetry)
}

export function getHistories(layer: Layer.Layer<GalaxyFetch>) {
  return getHistoriesEffect().pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}

export function deleteHistoryEffect(historyId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const history = Effect.tryPromise({
      try: () =>
        fetchApi<GalaxyHistoryDetailed>(`api/histories/${historyId}`, {
          method: 'DELETE',
          body: { purge: true },
        }),
      catch: caughtError =>
        new HistoryError({
          message: formatErrorMessage(
            'history',
            historyId,
            'Error deleting',
            caughtError,
          ),
          historyId,
          statusCode: extractStatusCode(caughtError),
          cause: caughtError,
        }),
    })
    return yield* history.pipe(
      Effect.tap(() => Console.log(`Deleted history ${historyId}`)),
    )
  })
}

export function deleteHistory(historyId: string, layer: Layer.Layer<GalaxyFetch>) {
  return deleteHistoryEffect(historyId).pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}

interface UploadFileBaseParams {
  historyId: string
  name: string
}
export interface uploadFileFromUrl extends UploadFileBaseParams {
  srcUrl: string
}

export interface uploadFileFromFile extends UploadFileBaseParams {
  buffer: Buffer
}

export function uploadFileToHistoryFromBufferEffect(params: uploadFileFromFile) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const config = yield* BlendTypeConfig
    const { historyId, buffer, name } = params

    const uploadSource = buffer

    // TUS resumable upload endpoint
    const tusEndpoint = `${config.url}/api/upload/resumable_upload/`

    // Build metadata for TUS upload
    const metadata: Record<string, string> = {
      history_id: historyId,
      file_type: 'auto',
      dbkey: '?',
      name,
    }

    yield* Console.log(
      `Starting TUS upload for ${name} to history ${historyId}`,
    )

    // Perform TUS chunked upload
    const sessionId = yield* uploadWithTus(
      uploadSource,
      tusEndpoint,
      metadata,
      config.apiKey,
    )

    yield* Console.log(`TUS upload complete, session_id: ${sessionId}`)

    // Submit the uploaded file reference to Galaxy
    const payload: Record<string, unknown> = {
      history_id: historyId,
      targets: [
        {
          destination: { type: 'hdas' },
          elements: [
            {
              src: 'files',
              name,
              dbkey: '?',
              ext: 'auto',
              space_to_tab: false,
              to_posix_lines: true,
            },
          ],
        },
      ],
      auto_decompress: true,
      [`files_0|file_data`]: {
        session_id: sessionId,
        name,
      },
    }

    const uploadedDataset = yield* Effect.tryPromise({
      try: () =>
        fetchApi<GalaxyUploadedDataset>('api/tools/fetch', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      catch: caughtError =>
        new HistoryError({
          message: formatErrorMessage(
            'file',
            name,
            'Error uploading',
            caughtError,
          ),
          historyId,
          statusCode: extractStatusCode(caughtError),
          cause: caughtError,
        }),
    }).pipe(
      Effect.tap(() =>
        Console.log(`Uploaded file ${name} to history ${historyId}`),
      ),
      Effect.catchAll((error) => {
        return deleteHistoryEffect(historyId).pipe(
          Effect.flatMap(() => Effect.fail(error)),
        )
      }),
    )

    return uploadedDataset
  })
}

export function uploadFileToHistoryFromUrlEffect(params: uploadFileFromUrl) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const { historyId, srcUrl, name } = params
    const payload: Record<string, unknown> = {
      history_id: historyId,
      targets: [
        {
          destination: { type: 'hdas' },
          elements: [
            {
              src: 'url',
              url: srcUrl,
              name,
              dbkey: '?',
              ext: 'auto',
              space_to_tab: false,
              to_posix_lines: true,
            },
          ],
        },
      ],
      auto_decompress: true,
      files: [],
    }

    return yield* Effect.tryPromise({
      try: () =>
        fetchApi<GalaxyUploadedDataset>('api/tools/fetch', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      catch: caughtError =>
        new HistoryError({
          message: formatErrorMessage(
            'file from URL',
            srcUrl,
            'Error uploading',
            caughtError,
          ),
          historyId,
          statusCode: extractStatusCode(caughtError),
          cause: caughtError,
        }),
    }).pipe(
      Effect.tap(input =>
        Console.log(
          `Uploaded file ${name} to history ${historyId}\n input: ${input}`,
        ),
      ),
      Effect.catchAll((error) => {
        return deleteHistoryEffect(historyId).pipe(
          Effect.flatMap(() => Effect.fail(error)),
        )
      }),
    )
  })
}

export function downloadDatasetEffect(historyId: string, datasetId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const datasetDescription = yield* getDatasetEffect(datasetId, historyId)
    if (datasetDescription.file_size === 0) {
      return yield* Effect.succeed(new Blob([]))
    }
    else {
      const dataset = Effect.tryPromise({
        try: () =>
          fetchApi<Blob>(
            `api/histories/${historyId}/contents/${datasetId}/display`,
            {
              method: 'GET',
            },
          ),
        catch: caughtError =>
          new HistoryError({
            message: formatErrorMessage(
              'dataset',
              datasetId,
              'Error downloading',
              caughtError,
            ),
            historyId,
            statusCode: extractStatusCode(caughtError),
            cause: caughtError,
          }),
      })
      return yield* dataset
    }
  })
}

export function downloadDataset(historyId: string, datasetId: string, layer: Layer.Layer<GalaxyFetch>) {
  return downloadDatasetEffect(historyId, datasetId).pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}
