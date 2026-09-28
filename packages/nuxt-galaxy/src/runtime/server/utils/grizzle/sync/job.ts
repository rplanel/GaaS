import type { SupabaseClient } from '@supabase/supabase-js'
import type { Layer } from 'effect'
import type { Database } from '../../../../types/database'
import * as bt from 'blendtype'
import { Data, Effect } from 'effect'

// Sync trace fields: see docs/LOGGING-SPEC.md ## Sync trace field allowlist

export class SyncJobError extends Data.TaggedError('SyncJobError')<{
  readonly message: string
}> {}

/** The columns of a recorded job row a re-sync compares against Galaxy. */
export type RecordedJob = Pick<
  Database['galaxy']['Tables']['jobs']['Row'],
  'id' | 'galaxy_id' | 'state' | 'update_time'
>

/**
 * The instant a Galaxy timestamp names, in milliseconds, or `null` for one
 * there is no reading.
 *
 * Galaxy serialises `update_time` as a naive UTC timestamp — no `Z` and no
 * offset — and `Date.parse` reads one of those as local time. Supplying the
 * zone Galaxy means leaves only zone-qualified strings to parse, so what this
 * returns never depends on where the server sits; nor does the row, since
 * what is stored is the normalised instant and not the string Galaxy sent.
 *
 * Milliseconds, not the microseconds Galaxy sends: both sides lose the same
 * digits, so the comparison stays symmetric.
 */
function galaxyTimeMillis(value: string | null | undefined): number | null {
  if (!value)
    return null
  const zoned = value.includes('T') && !/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
    ? `${value}Z`
    : value
  const millis = Date.parse(zoned)
  return Number.isNaN(millis) ? null : millis
}

/**
 * The instant to record for a job, as an explicit UTC string, so that reading
 * the row back does not depend on the database session's timezone.
 */
function recordableUpdateTime(value: string | null | undefined): string | null {
  const millis = galaxyTimeMillis(value)
  return millis === null ? null : new Date(millis).toISOString()
}

/**
 * Whether the row already recorded for a job says the same as the invocation's
 * own report of it, in which case `GET /api/jobs/{id}` has nothing to add and
 * the round trip is skipped (#106).
 *
 * `state` and `update_time` are the two fields to compare and the only two
 * there are: both are in `Job.dict_collection_visible_keys` on 22.05 and on
 * 26.1, while `tool_id` joined it only in 26.1 and `stderr`/`stdout` are in
 * neither. So a job with no recorded row still needs the full fetch, and so
 * does one that cannot be compared — a row written before there was an update
 * time to record, or a job an invocation fetched without step details reports
 * without one.
 */
export function isRecordedJobCurrent(
  recorded: RecordedJob,
  reported: bt.GalaxyInvocationStepJob,
): boolean {
  if (recorded.state !== reported.state)
    return false
  const recordedMillis = galaxyTimeMillis(recorded.update_time)
  return recordedMillis !== null && recordedMillis === galaxyTimeMillis(reported.update_time)
}

/**
 * Every job row already recorded for the analysis, keyed by its Galaxy id.
 *
 * One query for the whole sync. The caller asks after each job of each step
 * and a mapped step has one per element, so a lookup per job would move
 * #106's N+1 from Galaxy to Postgres rather than remove it.
 */
export function selectRecordedJobsEffect(
  supabase: SupabaseClient<Database>,
  analysisId: number,
): Effect.Effect<Map<string, RecordedJob>, SyncJobError, never> {
  return Effect.gen(function* () {
    const { data, error } = yield* Effect.tryPromise({
      try: () =>
        supabase
          .schema('galaxy')
          .from('jobs')
          .select('id, galaxy_id, state, update_time')
          .eq('analysis_id', analysisId),
      catch: error =>
        new SyncJobError({ message: `Failed to query recorded jobs: ${error}` }),
    })

    if (error) {
      yield* Effect.logError('failed to query recorded jobs', { message: error.message })
      return yield* Effect.fail(
        new SyncJobError({ message: `Failed to query recorded jobs: ${error.message}` }),
      )
    }

    const rows = data ?? []
    yield* Effect.logDebug('recorded jobs read', { rowCount: rows.length })
    return new Map(rows.map(row => [row.galaxy_id, row]))
  })
}

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
      // What a later sync compares against the invocation's own report of
      // this job, to decide whether it has to be fetched at all (#106).
      update_time: recordableUpdateTime(galaxyJob.update_time),
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
