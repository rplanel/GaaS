import type { SupabaseClient } from '@supabase/supabase-js'
import type { Layer } from 'effect'
import type { Database } from '../../../../types/database'
import * as bt from 'blendtype'
import { Data, Effect } from 'effect'

// Sync trace fields: see .planning/LOGGING-SPEC.md ## Sync trace field allowlist

export class SyncJobError extends Data.TaggedError('SyncJobError')<{
  readonly message: string
}> {}

export function syncJobEffect(
  galaxyJobId: string,
  stepId: number,
  analysisId: number,
  ownerId: string,
  supabase: SupabaseClient<Database>,
  galaxyLayer: Layer.Layer<bt.GalaxyFetch>,
): Effect.Effect<number, SyncJobError, never> {
  return Effect.gen(function* () {
    yield* Effect.logDebug('syncing job', { galaxyJobId, stepId })
    const { data: existing, error: selectError } = yield* Effect.tryPromise({
      try: () =>
        supabase
          .schema('galaxy')
          .from('jobs')
          .select('id')
          .eq('galaxy_id', galaxyJobId)
          .eq('analysis_id', analysisId)
          .maybeSingle(),
      catch: error =>
        new SyncJobError({
          message: `Failed to query existing job: ${error}`,
        }),
    })

    if (selectError) {
      yield* Effect.logError('failed to query existing job', { message: selectError.message })
      return yield* Effect.fail(
        new SyncJobError({ message: `Failed to query existing job: ${selectError.message}` }),
      )
    }

    const galaxyJob = yield* bt
      .getJobEffect(galaxyJobId)
      .pipe(
        Effect.tapError(error =>
          Effect.logError('failed to fetch job from Galaxy', {
            message: error instanceof Error ? error.message : String(error),
          }),
        ),
        Effect.mapError(error =>
          new SyncJobError({
            message: `Failed to fetch job from Galaxy: ${error instanceof Error ? error.message : String(error)}`,
          }),
        ),
        Effect.provide(galaxyLayer),
      )

    const isTerminal = bt.JobTerminalStates.includes(galaxyJob.state as typeof bt.JobTerminalStates[number])

    const payload = {
      galaxy_id: galaxyJobId,
      analysis_id: analysisId,
      owner_id: ownerId,
      step_id: stepId,
      state: galaxyJob.state,
      tool_id: galaxyJob.tool_id,
      exit_code: galaxyJob.exit_code ?? null,
      stderr: galaxyJob.stderr ?? null,
      stdout: galaxyJob.stdout ?? null,
      created_at: galaxyJob.create_time,
      is_sync: isTerminal,
    }

    if (existing) {
      const { error: updateError } = yield* Effect.tryPromise({
        try: () =>
          supabase
            .schema('galaxy')
            .from('jobs')
            .update(payload)
            .eq('id', existing.id),
        catch: error =>
          new SyncJobError({
            message: `Failed to update job: ${error}`,
          }),
      })

      if (updateError) {
        yield* Effect.logError('failed to update job', { message: updateError.message })
        return yield* Effect.fail(
          new SyncJobError({ message: `Failed to update job: ${updateError.message}` }),
        )
      }

      yield* Effect.logDebug('job upsert complete', { dbJobId: existing.id, state: galaxyJob.state })
      return existing.id
    }

    const { data, error } = yield* Effect.tryPromise({
      try: () =>
        supabase
          .schema('galaxy')
          .from('jobs')
          .insert(payload)
          .select('id')
          .single(),
      catch: error =>
        new SyncJobError({
          message: `Failed to insert job: ${error}`,
        }),
    })

    if (error) {
      const errorMessage = error && typeof error === 'object' && 'message' in error
        ? (error as { message: string }).message
        : String(error)
      yield* Effect.logError('failed to insert job', { message: errorMessage })
      return yield* Effect.fail(new SyncJobError({ message: `Failed to insert job: ${errorMessage}` }))
    }

    const dbJobId = (data as { id: number }).id
    yield* Effect.logDebug('job upsert complete', { dbJobId, state: galaxyJob.state })
    return dbJobId
  }).pipe(
    Effect.annotateLogs({
      analysisId: String(analysisId),
      ownerId,
      galaxyInvocationId: null,
      historyId: null,
      jobId: galaxyJobId,
      datasetId: null,
    }),
  )
}
