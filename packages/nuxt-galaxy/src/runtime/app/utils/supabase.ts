import type { Database } from '../../types/database'
import { toValue, useSupabaseClient, useSupabaseUser } from '#imports'
import { Context, Data, Effect, Layer } from 'effect'

/**
 * Effect layer for the client-side Supabase client.
 * This layer provides access to the Supabase client instance
 * which can be used to interact with the Supabase database and storage.
 *
 * @class SupabaseClientLayer
 * @extends Context.Tag
 *
 * @example
 * ```typescript
 * // Using the layer in an Effect
 * const myEffect = Effect.gen(function* () {
 *   const supabase = yield* SupabaseClientLayer
 *   // Use supabase client...
 * }).pipe(Effect.provide(SupabaseClientLayer.Live))
 * ```
 *
 */
export class SupabaseClientLayer extends Context.Tag('@nuxt-galaxy/SupabaseClient')<
  SupabaseClientLayer,
  ReturnType<typeof useSupabaseClient<Database>>
>() {
  static readonly Live = Layer.effect(
    SupabaseClientLayer,
    Effect.gen(function* () {
      return useSupabaseClient<Database>()
    }),
  )
}

export class NoSupabaseUserError extends Data.TaggedError('NoSupabaseUserError')<{
  readonly message: string
}> {}

/**
 * Effect layer for the user session in Supabase.
 * This layer provides access to the current authenticated user,
 * which can be used to perform user-specific operations.
 * @class SupabaseUserLayer
 * @extends Context.Tag
 */
export class SupabaseUserLayer extends Context.Tag('@nuxt-galaxy/SupabaseUser')<
  SupabaseUserLayer,
  ReturnType<typeof useSupabaseUser>
>() {
  static readonly Live = Layer.effect(
    SupabaseUserLayer,
    Effect.gen(function* () {
      return useSupabaseUser()
    }),
  )
}

export const SupabaseConfigLive = Layer.merge(
  SupabaseClientLayer.Live,
  SupabaseUserLayer.Live,
)

export class UploadFileToStorageError extends Data.TaggedError('UploadFileToStorageError')<{
  readonly message: string
}> {}

/**
 * Effect to upload a file to a specified storage bucket in Supabase.
 * This function generates a unique directory for the file upload
 * and handles any errors that may occur during the upload process.
 *
 * @param {string} bucket - The name of the storage bucket where the file will be uploaded.
 * @param {File} file - The file to be uploaded.
 * @returns {Effect<unknown, UploadFileToStorageError>} An effect that resolves to the uploaded file data or fails with an error.
 */
export function uploadFileToStorageEffect(bucket: string, file: File) {
  return Effect.gen(function* () {
    const supabase = yield* SupabaseClientLayer
    const uniqueDirectory = crypto.randomUUID()
    const { data, error } = yield* Effect.promise(
      () => supabase.storage.from(bucket).upload(`${uniqueDirectory}/${file.name}`, file),
    )
    if (error) {
      yield* Effect.fail(
        new UploadFileToStorageError({
          message: `Failed to upload file: ${error.message}`,
        }),
      )
    }
    return data
  })
}

export class InsertUploadedDatasetEffect extends Data.TaggedError('InsertUploadedDatasetEffect')<{
  readonly message: string
}> {}

/**
 * Inserts an uploaded dataset record into the database.
 *
 * This function creates a new record in the 'uploaded_datasets' table within the 'galaxy' schema,
 * associating the uploaded dataset with the current authenticated user.
 *
 * @param uploadedDataset - The dataset information to insert
 * @param uploadedDataset.storageObjectId - The unique identifier of the storage object containing the dataset
 * @param uploadedDataset.datasetName - The human-readable name of the dataset
 *
 * @returns An Effect that resolves to the inserted dataset data on success
 *
 * @throws {NoSupabaseUserError} When no authenticated user is found
 * @throws {UploadFileToStorageError} When the database insertion fails
 *
 * @example
 * ```typescript
 * const dataset = {
 *   storageObjectId: "abc-123",
 *   datasetName: "My Dataset"
 * };
 * const result = yield* insertUploadedDatasetEffect(dataset);
 * ```
 */
export function insertUploadedDatasetEffect(uploadedDataset: { storageObjectId: string, datasetName: string }) {
  return Effect.gen(function* () {
    const supabase = yield* SupabaseClientLayer
    const user = yield* SupabaseUserLayer
    const userVal = toValue(user)

    if (!userVal) {
      return yield* Effect.fail(
        new NoSupabaseUserError({
          message: 'No supabase user found',
        }),
      )
    }
    const { data, error } = yield* Effect.promise(
      () => supabase
        .schema('galaxy')
        .from('uploaded_datasets')
        .insert({
          storage_object_id: uploadedDataset.storageObjectId,
          dataset_name: uploadedDataset.datasetName,
          owner_id: userVal.id,
        })
        .select(),
    )
    if (error) {
      yield* Effect.fail(
        new UploadFileToStorageError({
          message: `Failed to insert dataset: ${error.message}`,
        }),
      )
    }
    return data
  })
}
