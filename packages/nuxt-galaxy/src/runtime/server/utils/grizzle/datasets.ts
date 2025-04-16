import type { Datamap, DatasetState, DatasetTerminalState } from 'blendtype'
import type { EventHandlerRequest, H3Event } from 'h3'

import type { NewDataset } from '~/src/runtime/types/nuxt-galaxy'
import { DatasetsTerminalStates, deleteHistoryEffect as deleteGalaxyHistory, uploadFileToHistoryEffect } from 'blendtype'
import { Console, Data, Effect } from 'effect'
import { parseFilename } from 'ufo'
import { datasets } from '../../db/schema/galaxy/datasets.js'
import { objects } from '../../db/schema/storage/objects.js'
import { Drizzle, eq, useDrizzle } from '../drizzle.js'
import { takeUniqueOrThrow } from './helper.js'
import { deleteHistory } from './histories'
import { createSignedUrl } from './supabase'

// eslint-disable-next-line unicorn/throw-new-error
export class NoStorageObjectError extends Data.TaggedError('NoStorageObjectError')<{
  readonly message: string
}> {}

export function uploadDatasetsEffect(datamap: Datamap, galaxyHistoryId: string, historyId: number, ownerId: string, event: H3Event<EventHandlerRequest>) {
  const datasetEntries = Object.entries(datamap)
  return Effect.all(
    datasetEntries.map(([step, { storage_object_id: storageObjectId }]) => {
      return Effect.gen(function* () {
        if (storageObjectId) {
          const storageObject = yield* getStorageObject(storageObjectId)
          if (storageObject && storageObject?.name) {
            let signedUrl = yield* createSignedUrl(event, storageObject.name)
            signedUrl = 'https://dl.pasteur.fr/fop/9kG35Wvc/ESCO001.0523.00075.prt'
            if (signedUrl) {
              const filename = parseFilename(signedUrl, { strict: false })
              const historyDataset = yield* uploadFileToHistoryEffect(galaxyHistoryId, signedUrl, filename).pipe(
                Effect.tap(input => Console.log(`Uploaded file ${filename} to history ${historyId}\n input: ${input}`)),
                Effect.catchAllCause((cause) => {
                  return deleteGalaxyHistory(galaxyHistoryId).pipe(
                    Effect.flatMap(() => deleteHistory(historyId)),
                    Effect.flatMap(() => Effect.fail(cause)),
                  )
                }),
              )

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

// eslint-disable-next-line unicorn/throw-new-error
export class NotDefinedInsertedDatasetError extends Data.TaggedError('NotDefinedInsertedDatasetError')<{
  readonly message: string
}> {}

// eslint-disable-next-line unicorn/throw-new-error
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
  return DatasetsTerminalStates.includes(state as DatasetTerminalState)
}

// eslint-disable-next-line unicorn/throw-new-error
export class InsertDatasetError extends Data.TaggedError('InsertDatasetError')<{
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
