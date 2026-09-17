import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../../types/database'
import { Data, Effect } from 'effect'

// Sync trace fields: see docs/LOGGING-SPEC.md ## Sync trace field allowlist

export class SyncLockError extends Data.TaggedError('SyncLockError')<{
  readonly message: string
}> {}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function acquireSyncLock(
  supabase: SupabaseClient<Database>,
  analysisId: number,
  ttlSeconds: number,
): Effect.Effect<boolean, SyncLockError, never> {
  return Effect.gen(function* () {
    yield* Effect.logDebug('acquiring sync lock', { analysisId, ttlSeconds })

    const { data, error } = yield* Effect.tryPromise(() =>
      supabase.schema('galaxy').rpc('acquire_sync_lock', {
        p_analysis_id: analysisId,
        p_ttl_seconds: ttlSeconds,
      }),
    ).pipe(
      Effect.tapError(error => Effect.logError('acquire sync lock failed', { message: getErrorMessage(error) })),
      Effect.mapError(_error => new SyncLockError({ message: 'Failed to acquire sync lock' })),
    )

    if (error) {
      yield* Effect.logError('acquire sync lock failed', { message: error.message })
      return yield* Effect.fail(
        new SyncLockError({ message: 'Failed to acquire sync lock' }),
      )
    }

    return data ?? false
  }).pipe(
    Effect.annotateLogs({
      analysisId: String(analysisId),
      ownerId: null,
      galaxyInvocationId: null,
      historyId: null,
      jobId: null,
      datasetId: null,
    }),
  )
}

export function releaseSyncLock(
  supabase: SupabaseClient<Database>,
  analysisId: number,
): Effect.Effect<void, SyncLockError, never> {
  return Effect.gen(function* () {
    yield* Effect.logDebug('releasing sync lock', { analysisId })
    const { error } = yield* Effect.tryPromise({
      try: () => supabase.schema('galaxy').from('sync_locks').delete().eq('analysis_id', analysisId),
      catch: error => new SyncLockError({ message: `Failed to release sync lock: ${error instanceof Error ? error.message : String(error)}` }),
    })

    if (error) {
      return yield* Effect.fail(new SyncLockError({ message: `Failed to release sync lock: ${error.message}` }))
    }
  }).pipe(
    Effect.annotateLogs({
      analysisId: String(analysisId),
      ownerId: null,
      galaxyInvocationId: null,
      historyId: null,
      jobId: null,
      datasetId: null,
    }),
  )
}
