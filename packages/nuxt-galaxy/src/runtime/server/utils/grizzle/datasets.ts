import type { Datamap, DatasetState, DatasetTerminalState } from 'blendtype'
import type { EventHandlerRequest, H3Event } from 'h3'

import type { NewDataset } from '~/src/runtime/types/nuxt-galaxy'
import * as bt from 'blendtype'
import { Console, Data, Effect } from 'effect'
import { parseFilename } from 'ufo'
import { datasets } from '../../db/schema/galaxy/datasets.js'
import { objects } from '../../db/schema/storage/objects.js'
import { Drizzle, eq, useDrizzle } from '../drizzle.js'
import { takeUniqueOrThrow } from './helper.js'
import { deleteHistory } from './histories'
import { createSignedUrl } from './supabase'

export class NoStorageObjectError extends Data.TaggedError('NoStorageObjectError')<{
  readonly message: string
}> {}

export interface UploadDatasetParams {
  datamap: Datamap
  galaxyHistoryId: string
  historyId: number
  ownerId: string
  event: H3Event<EventHandlerRequest>
  file: boolean
}

export function uploadDatasetsEffect(params: UploadDatasetParams) {
  const { datamap, galaxyHistoryId, historyId, ownerId, event, file = true } = params
  const datasetEntries = Object.entries(datamap)
  return Effect.all(
    datasetEntries.map(([step, { storage_object_id: storageObjectId }]) => {
      return Effect.gen(function* () {
        if (storageObjectId) {
          const storageObject = yield* getStorageObject(storageObjectId)
          if (storageObject && storageObject?.name) {
            const signedUrl = yield* createSignedUrl(event, storageObject.name)
            // let signedUrl = yield* createSignedUrl(event, storageObject.name)
            // signedUrl = 'https://raw.githubusercontent.com/mdmparis/defense-finder/refs/heads/master/tests/data/prot/df_test_prot.faa'
            // signedUrl = 'https://supabase-satellite-finder.dev.pasteur.cloud/storage/v1/object/public/genome//GCF_000006945.2-prot.faa'
            // signedUrl = 'https://supabase-satellite-finder.dev.pasteur.cloud/storage/v1/object/public/genome//GCF_000008865.2-prot.faa'
            // signedUrl = 'https://supabase-satellite-finder.dev.pasteur.cloud/storage/v1/object/public/genome//NZ_CP018928.1.faa'

            if (signedUrl) {
              const filename = parseFilename(signedUrl, { strict: false }) || 'gaas_input_file'
              let historyDatasetEffect: ReturnType<typeof bt.uploadFileToHistoryEffect>
              if (file) {
                const response = yield* bt.fetchDatasetEffect(signedUrl)
                // const contentType = response.headers.get('content-type') || 'application/octet-stream'
                // const body = response.body
                const blob = yield* Effect.tryPromise({
                  try: () => response.blob(),
                  catch: _caughtError => new bt.HttpError({ message: `Error fetching dataset from ${signedUrl}: ${_caughtError}` }),
                })
                // const form = new FormData()
                // form.append('files', body, { filename, contentType })
                // Galaxy-specific fields
                // form.append('file_type', 'auto')
                // form.append('dbkey', '?')
                if (blob.size === 0) {
                  yield* Effect.fail(new bt.HttpError({ message: `Dataset at ${signedUrl} is empty` }))
                }
                historyDatasetEffect = bt.uploadFileToHistoryEffect({
                  historyId: galaxyHistoryId,
                  blob,
                  name: filename,
                })
              }
              else {
                historyDatasetEffect = bt.uploadFileToHistoryEffect({
                  historyId: galaxyHistoryId,
                  srcUrl: signedUrl,
                  name: filename,
                })
              }
              historyDatasetEffect.pipe(
                Effect.tap(input => Console.log(`Uploaded file ${filename} to history ${historyId}\n input: ${input}`)),
                Effect.catchAllCause((cause) => {
                  return bt.deleteHistoryEffect(galaxyHistoryId).pipe(
                    Effect.flatMap(() => deleteHistory(historyId)),
                    Effect.flatMap(() => Effect.fail(cause)),
                  )
                }),
              )
              const historyDataset = yield* historyDatasetEffect
              const uploadedDatasets = historyDataset.outputs

              if (uploadedDatasets.length === 1 && uploadedDatasets[0]) {
                const {
                  id: uploadedGalaxyId,
                  name,
                  uuid,
                  file_ext: extension,
                  create_time: createdAt,
                } = uploadedDatasets[0]
                if (storageObjectId) {
                  const insertedDataset = yield* insertDatasetEffect({
                    datasetName: name,
                    ownerId,
                    storageObjectId,
                    historyId,
                    uuid,
                    extension,
                    createdAt: new Date(createdAt),
                    dataLines: 0,
                    galaxyId: uploadedGalaxyId,
                  })
                  if (insertedDataset) {
                    return {
                      step,
                      insertedId: insertedDataset.id,
                      galaxyId: insertedDataset.galaxyId,
                    }
                  }
                  else {
                    yield* Effect.fail(new NotDefinedInsertedDatasetError(
                      { message: 'inserted dataset is undefined' },
                    ))
                  }
                }
              }
            }
          }
        }
      })
    }),
  )
}

export function uploadFileToSupabase() {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .select()
        .from(objects)
        .where(eq(objects.id, ''))
        .then(takeUniqueOrThrow),
      catch: error => new NoStorageObjectError({ message: `Error getting storage object: ${error}` }),
    })
  })
}

export class NotDefinedInsertedDatasetError extends Data.TaggedError('NotDefinedInsertedDatasetError')<{
  readonly message: string
}> {}

export class GetStorageObjectError extends Data.TaggedError('GetStorageObjectError')<{
  readonly message: string
}> {}

export function getStorageObject(storageObjectId: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .select()
        .from(objects)
        .where(eq(objects.id, storageObjectId))
        .then(takeUniqueOrThrow),
      catch: error => new GetStorageObjectError({ message: `Error getting storage object: ${error}` }),
    })
  })
}

export function isDatasetTerminalState(state: DatasetState): boolean {
  return bt.DatasetsTerminalStates.includes(state as DatasetTerminalState)
}

export class InsertDatasetError extends Data.TaggedError('InsertDatasetError')<{
  readonly message: string
}> {}

export class UpdateDatasetError extends Data.TaggedError('UpdateDatasetError')<{
  readonly message: string
}> {}

export function insertDatasetEffect(dataset: NewDataset) {
  return Effect.tryPromise({
    try: () => useDrizzle().insert(datasets).values(
      dataset,
    ).onConflictDoNothing().returning().then(takeUniqueOrThrow),
    catch: error => new InsertDatasetError({ message: `Error inserting dataset: ${error}` }),
  })
}
