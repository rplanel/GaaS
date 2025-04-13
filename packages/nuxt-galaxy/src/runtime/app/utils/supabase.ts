import type { Database } from '../../types/database'
import { toValue, useSupabaseClient, useSupabaseUser } from '#imports'
import { Context, Data, Effect, Layer } from 'effect'

export class ClientSupabaseClient extends Context.Tag('@nuxt-galaxy/SupabaseClient')<
  ClientSupabaseClient,
  ReturnType<typeof useSupabaseClient<Database>>
>() {
  static readonly Live = Layer.effect(
    ClientSupabaseClient,
    Effect.gen(function* () {
      return useSupabaseClient<Database>()
    }),
  )
}

// eslint-disable-next-line unicorn/throw-new-error
export class NoSupabaseUserError extends Data.TaggedError('NoSupabaseUserError')<{
  readonly message: string
}> {}

export class ClientSupabaseUser extends Context.Tag('@nuxt-galaxy/SupabaseUser')<
  ClientSupabaseUser,
  ReturnType<typeof useSupabaseUser>
>() {
  static readonly Live = Layer.effect(
    ClientSupabaseUser,
    Effect.gen(function* () {
      return useSupabaseUser()
    }),
  )
}

export const SupabaseConfigLive = Layer.merge(
  ClientSupabaseClient.Live,
  ClientSupabaseUser.Live,
)

// eslint-disable-next-line unicorn/throw-new-error
export class UploadFileToStorageError extends Data.TaggedError('UploadFileToStorageError')<{
  readonly message: string
}> {}

export function uploadFileToStorageEffect(bucket: string, file: File) {
  return Effect.gen(function* () {
    const supabase = yield* ClientSupabaseClient
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

// eslint-disable-next-line unicorn/throw-new-error
export class InsertUploadedDatasetEffect extends Data.TaggedError('InsertUploadedDatasetEffect')<{
  readonly message: string
}> {}

export function insertUploadedDatasetEffect(uploadedDataset: { storageObjectId: string, datasetName: string }) {
  return Effect.gen(function* () {
    const supabase = yield* ClientSupabaseClient
    const user = yield* ClientSupabaseUser
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
