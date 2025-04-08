import type { EventHandlerRequest, H3Event } from 'h3'
import type { Database } from '../../../types/database'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { Context, Data, Effect, Layer } from 'effect'

// eslint-disable-next-line unicorn/throw-new-error
export class ServerSupabaseClientError extends Data.TaggedError('NoServerSupabaseClientError')<{
  readonly message: string
}> {}

export function createServerSupabaseClient(event: H3Event<EventHandlerRequest>) {
  return Effect.gen(function* () {
    return yield* Effect.tryPromise({
      try: () => serverSupabaseClient<Database>(event),
      catch: e => new ServerSupabaseClientError({ message: `Failed to create Supabase client: ${e}` }),
    })
  })
}
export class ServerSupabaseClient extends Context.Tag('@nuxt-galaxy/ServerSupabaseClient')<
  ServerSupabaseClient,
  typeof createServerSupabaseClient
>() {
  static readonly Live = Layer.effect(
    ServerSupabaseClient,
    Effect.gen(function* () {
      return (event: H3Event<EventHandlerRequest>) => createServerSupabaseClient(event)
    }),
  )
}

// eslint-disable-next-line unicorn/throw-new-error
export class GetSupabaseUserError extends Data.TaggedError('GetSupabaseUserError')<{
  readonly message: string
}> {}

export function createServerSupabaseUser(event: H3Event<EventHandlerRequest>) {
  return Effect.tryPromise({
    try: () => serverSupabaseUser(event),
    catch: e => new GetSupabaseUserError({ message: `Failed to get Supabase user: ${e}` }),
  })
}

export class ServerSupabaseUser extends Context.Tag('@nuxt-galaxy/ServerSupabaseUser')<
  ServerSupabaseUser,
 typeof createServerSupabaseUser
>() {
  static readonly Live = Layer.effect(
    ServerSupabaseUser,
    Effect.gen(function* () {
      return (event: H3Event<EventHandlerRequest>) => createServerSupabaseUser(event)
    }),
  )
}

// eslint-disable-next-line unicorn/throw-new-error
export class UploadFileToStorageError extends Data.TaggedError('UploadFileToStorageError')<{
  readonly message: string
}> {}

export function uploadFileToStorage(event: H3Event<EventHandlerRequest>, datasetName: string, datasetBlob: Blob) {
  return Effect.gen(function* () {
    const createSupabase = yield* ServerSupabaseClient
    const supabase = yield* createSupabase(event)
    const { data, error } = yield* Effect.promise(
      () => supabase.storage
        .from('analysis_files')
        .upload(`${crypto.randomUUID()}/${datasetName}`, datasetBlob),
    )
    if (error) {
      yield* Effect.fail(new UploadFileToStorageError({ message: error.message }))
    }
    return data
  })
}

// eslint-disable-next-line unicorn/throw-new-error
export class CreateSignedUrlError extends Data.TaggedError('CreateSignedUrlError')<{
  readonly message: string
}> {}

export function createSignedUrl(event: H3Event<EventHandlerRequest>, path: string) {
  return Effect.gen(function* () {
    const createSupabase = yield* ServerSupabaseClient
    const supabase = yield* createSupabase(event)
    const { data, error } = yield* Effect.promise(
      () => supabase.storage.from('analysis_files').createSignedUrl(path, 60),
    )
    if (error) {
      yield* Effect.fail(new CreateSignedUrlError({ message: error.message }))
    }
    return data?.signedUrl
  })
}
