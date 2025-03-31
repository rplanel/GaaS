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

export function createServerSupabaseUser(event: H3Event<EventHandlerRequest>) {
  return Effect.tryPromise({
    try: () => serverSupabaseUser(event),
    catch: e => new Error(`Failed to get Supabase user: ${e}`),
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
      yield* Effect.fail(new Error(error.message))
    }
    return data
  })
}
