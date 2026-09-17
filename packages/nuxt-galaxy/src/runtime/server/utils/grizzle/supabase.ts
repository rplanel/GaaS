import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventHandlerRequest, H3Event } from 'h3'
import type { Database } from '../../../types/database'
import type { RoleType } from '../../../types/nuxt-galaxy'
import process from 'node:process'
import { useRuntimeConfig } from '#imports'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createClient } from '@supabase/supabase-js'
import { and, eq } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { roles } from '../../db/schema/galaxyRbac/roles'
import { userRoles } from '../../db/schema/galaxyRbac/userRoles'
import { Drizzle } from '../drizzle'

export class ServerSupabaseClientError extends Data.TaggedError('NoServerSupabaseClientError')<{
  readonly message: string
}> {}

/**
 * Effect to create a server-side Supabase client.
 * @param event - The H3 event object containing the HTTP request context and server-side utilities
 * @returns An Effect that resolves to a Supabase client instance or fails with ServerSupabaseClientError
 */

export function createServerSupabaseClient(event: H3Event<EventHandlerRequest>) {
  return Effect.gen(function* () {
    return yield* Effect.tryPromise({
      try: () => serverSupabaseClient<Database>(event),
      catch: e => new ServerSupabaseClientError({ message: `Failed to create Supabase client: ${e}` }),
    })
  })
}

/**
 * Effect layer for the server-side Supabase client.
 * This layer provides access to the Supabase client instance
 * which can be used to interact with the Supabase database and storage.
 */
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

export class GetSupabaseUserError extends Data.TaggedError('GetSupabaseUserError')<{
  readonly message: string
}> {}

export class ForbiddenError extends Data.TaggedError('ForbiddenError')<{
  readonly message: string
}> {}

export class AdminRoleCheckError extends Data.TaggedError('AdminRoleCheckError')<{
  readonly message: string
}> {}

export function createServerSupabaseClaims(event: H3Event<EventHandlerRequest>) {
  return Effect.tryPromise({
    try: () => serverSupabaseUser(event),
    catch: e => new GetSupabaseUserError({ message: `Failed to get Supabase user: ${e}` }),
  })
}

/**
 * Effect layer for the server-side Supabase user.
 * This layer provides access to the current authenticated user,
 * which can be used to perform user-specific operations.
 */
export class ServerSupabaseClaims extends Context.Tag('@nuxt-galaxy/ServerSupabaseClaims')<
  ServerSupabaseClaims,
 typeof createServerSupabaseClaims
>() {
  static readonly Live = Layer.effect(
    ServerSupabaseClaims,
    Effect.gen(function* () {
      return (event: H3Event<EventHandlerRequest>) => createServerSupabaseClaims(event)
    }),
  )
}

export class UploadFileToStorageError extends Data.TaggedError('UploadFileToStorageError')<{
  readonly message: string
}> {}

export function createServiceRoleSupabaseClient() {
  return Effect.gen(function* () {
    const config = useRuntimeConfig()
    const url = (config.public.supabase?.url as string | undefined)
      || process.env.SUPABASE_URL
      || process.env.NUXT_PUBLIC_SUPABASE_URL
    const secretKey = ((config.supabase as any)?.secretKey as string | undefined)
      || process.env.NUXT_SUPABASE_SECRET_KEY
      || process.env.SUPABASE_SERVICE_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY
      || process.env.NUXT_SUPABASE_SERVICE_KEY
      || process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY
    const serviceKey = (config.supabase as any)?.serviceKey as string | undefined
    const serverKey = secretKey || serviceKey
    if (!url || !serverKey) {
      return yield* Effect.fail(new ServerSupabaseClientError({
        message: 'Missing Supabase URL or service role key in runtime config or environment variables',
      }))
    }
    return createClient<Database>(url, serverKey, {
      auth: { detectSessionInUrl: false, persistSession: false, autoRefreshToken: false },
    })
  })
}

export function uploadStreamToStorage(
  supabase: SupabaseClient<Database>,
  path: string,
  stream: NodeJS.ReadableStream | ReadableStream<Uint8Array>,
) {
  return Effect.gen(function* () {
    const { data, error } = yield* Effect.promise(() =>
      supabase.storage.from('analysis_files').upload(path, stream),
    )
    if (error) {
      return yield* Effect.fail(new UploadFileToStorageError({ message: error.message }))
    }
    return { id: data!.id, path: data!.path }
  })
}

export function uploadFileToStorage(event: H3Event<EventHandlerRequest>, datasetName: string, datasetBlob: Blob) {
  return Effect.gen(function* () {
    const createSupabase = yield* ServerSupabaseClient
    const supabase = yield* createSupabase(event)
    const path = `${crypto.randomUUID()}/${datasetName}`
    return yield* uploadStreamToStorage(supabase, path, datasetBlob.stream() as ReadableStream<Uint8Array>)
  })
}

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
      return yield* Effect.fail(new CreateSignedUrlError({ message: error.message }))
    }
    return data?.signedUrl
  })
}

export function getSupabaseUser(event: H3Event<EventHandlerRequest>) {
  return Effect.gen(function* () {
    const createServerSupabaseClient = yield* ServerSupabaseClient
    const supabaseClient = yield* createServerSupabaseClient(event)
    const { error: authUserError, data: authUser } = yield* Effect.promise(() => supabaseClient.auth.getUser())
    if (authUserError) {
      return yield* Effect.fail(
        new GetSupabaseUserError({
          message: `Failed to get auth user: ${authUserError.message}`,
        }),
      )
    }
    return authUser.user
  })
}

/**
 * Generic role gate (D-01..D-04): verifies that `user` holds the given `role`
 * via the Drizzle `userRoles ⋈ roles WHERE roles.name = role` join (limit 1).
 * Returns Unit on success, ForbiddenError (403) when the user has no such role,
 * or AdminRoleCheckError (500) when the query itself is rejected. Per D-04 this
 * helper performs NO logging — denial and failure logging happen at the handler
 * layer only.
 */
export function requireRole(
  user: { readonly id: string },
  role: RoleType,
): Effect.Effect<void, AdminRoleCheckError | ForbiddenError, Drizzle> {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    const roleRows = yield* Effect.tryPromise({
      try: () => useDrizzle
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(eq(userRoles.userId, user.id), eq(roles.name, role)))
        .limit(1),
      catch: error => new AdminRoleCheckError({ message: `Failed to verify ${role} role: ${error}` }),
    })
    if (roleRows.length === 0) {
      return yield* Effect.fail(new ForbiddenError({ message: 'Forbidden: admin role required' }))
    }
    return yield* Effect.void
  })
}
