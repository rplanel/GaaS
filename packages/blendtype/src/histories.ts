import type { GalaxyHistoryDetailed, GalaxyUploadedDataset } from './types'
import { Console, Data, Effect } from 'effect'
import * as tus from 'tus-js-client'
import { BlendTypeConfig, runWithConfig } from './config'
import { getDatasetEffect } from './datasets'
import { extractStatusCode, formatErrorMessage, HistoryError } from './errors'
import { GalaxyFetch } from './galaxy'

export class TusUploadError extends Data.TaggedError('TusUploadError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Performs a resumable TUS upload to Galaxy server.
 *
 * Uploads a file to the Galaxy server using the TUS (Tus.io) resumable upload protocol.
 * This allows for chunked uploads that can be resumed if interrupted.
 *
 * @param source - The file content to upload (File or Buffer from node:buffer)
 * @param tusEndpoint - The Galaxy TUS endpoint URL (e.g., https://galaxy.example.com/api/upload/resumable_upload/)
 * @param metadata - File metadata for Galaxy including history_id, file_type, dbkey, and name
 * @param apiKey - Galaxy API key for authentication via x-api-key header
 * @param chunkSize - Upload chunk size in bytes, defaults to 10MB (10485760)
 * @returns Effect.Effect<string, TusUploadError> - Effect that resolves to the session ID on success,
 *          or fails with TusUploadError if upload fails
 * @example
 * ```typescript
 * const effect = uploadWithTus(
 *   buffer,
 *   'https://galaxy.example.com/api/upload/resumable_upload/',
 *   { history_id: 'abc123', name: 'data.txt', file_type: 'auto', dbkey: '?' },
 *   'my-api-key'
 * )
 * const sessionId = await Effect.runPromise(effect)
 * ```
 * @throws {TusUploadError} When TUS upload fails or error callback is triggered
 * @see https://tus.io/ - TUS upload protocol documentation
 */
export function uploadWithTus(
  source: File | Blob,
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

export function uploadFileToHistoryEffect(
  params: uploadFileFromUrl | uploadFileFromFile,
) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const config = yield* BlendTypeConfig

    if ('blob' in params) {
      const { historyId, blob, name } = params

      // TUS works natively with File, Blob, and Uint8Array
      // No conversion needed - TUS handles all types directly
      const uploadSource = blob

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
      // Using files_0|file_data format as expected by Galaxy API
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
        Effect.catchAllCause((cause) => {
          return deleteHistoryEffect(historyId).pipe(
            Effect.flatMap(() => Effect.fail(cause)),
          )
        }),
      )

      return uploadedDataset
    }
    else {
      const uploadedDataset = uploadFileToHistoryFromUrlEffect(params)
      return yield* uploadedDataset
    }
  })
}

export function uploadFileToHistory(
  params: uploadFileFromUrl | uploadFileFromFile,
) {
  return uploadFileToHistoryEffect(params).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
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
            name,
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
      Effect.catchAllCause((cause) => {
        return deleteHistoryEffect(historyId).pipe(
          Effect.flatMap(() => Effect.fail(cause)),
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

export function downloadDataset(historyId: string, datasetId: string) {
  return downloadDatasetEffect(historyId, datasetId).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
}
