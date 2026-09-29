import type { SupabaseClient } from '@supabase/supabase-js'
import type { Layer } from 'effect'
import type { Database } from '../../../../types/database'
import * as bt from 'blendtype'
import { Data, Duration, Effect, Schedule } from 'effect'
import { buildMonitoringUpdatePayload, deriveInvocationOutcomeFromJobsSummary, isInvocationTerminalState } from '../analysisMonitoring'
import { selectRecordedJobsEffect, syncJobEffect, unchangedRecordedJob } from './job'
import { acquireSyncLock, releaseSyncLock } from './lock'
import { syncOutputDatasetEffect } from './output'

// Sync trace fields: see docs/LOGGING-SPEC.md ## Sync trace field allowlist

export class SyncAnalysisError extends Data.TaggedError('SyncAnalysisError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

export interface SyncConfig {
  lockTtlSeconds: number
  batchSize: number
  maxRetries: number
  retryBaseDelayMs: number
  retryMaxDelayMs: number
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function isTransientError(error: unknown): boolean {
  const statusCode = bt.extractStatusCode(error)
  if (statusCode === 503 || statusCode === 429) {
    return true
  }

  const message = getErrorMessage(error).toLowerCase()
  const transientIndicators = [
    '503',
    'service unavailable',
    'service is unavailable',
    '429',
    'too many requests',
    'econnrefused',
    'etimedout',
    'fetch failed',
    'network',
  ]
  return transientIndicators.some(indicator => message.includes(indicator))
}

/** A Galaxy job of an invocation step, with the step's own report of it. */
interface StepGalaxyJob {
  galaxyJobId: string
  /**
   * What the step says about the job, which is what a re-sync compares
   * against the recorded row (#106). Absent for the `job_id` fallback: a
   * payload fetched without step details reports no job fields at all, so
   * such a job is always fetched.
   */
  reported?: bt.GalaxyInvocationStepJob
}

/**
 * Every Galaxy job an invocation step ran.
 *
 * A step that maps over a collection runs one job per element and carries
 * none of them in `job_id`; `jobs` — populated only under
 * `step_details=true` — is the one place they appear against their step. It
 * also holds the single job of an ordinary step, so it is read first and
 * `job_id` is the fallback for a payload fetched without step details.
 *
 * Empty counts as absent rather than as an answer. On both 22.05 and 26.1 a
 * step with a `job_id` always reports that job in `jobs`, so the two cannot
 * disagree — but if one ever did, dropping a job Galaxy named in `job_id`
 * is the failure this exists to prevent.
 */
function stepGalaxyJobs(step: bt.GalaxyInvocationStep): StepGalaxyJob[] {
  if (step.jobs?.length) {
    return step.jobs.map(job => ({ galaxyJobId: job.id, reported: job }))
  }
  return step.job_id ? [{ galaxyJobId: step.job_id }] : []
}

/**
 * Every Galaxy job a subworkflow ran, at any depth, from the invocation it
 * ran under.
 *
 * A subworkflow step runs no job of its own — `WorkflowInvocationStep.jobs`
 * is `self.job or implicit_collection_jobs.job_list` and it has neither — so
 * `stepGalaxyJobs` answers nothing for one and the sync used to move on,
 * exactly as it did for a mapped step before #84. The jobs are there; they
 * belong to a **separate invocation**, named by `subworkflow_invocation_id`.
 *
 * Fetched with `step_details=true` as the outer invocation is, and for the
 * same reason: without it a mapped step *inside* the subworkflow reports
 * `job_id: null` and says nothing about its elements' jobs.
 *
 * **How deep: as deep as Galaxy nests them.** A subworkflow may embed a
 * subworkflow — the `subworkflow-nested` fixture is two levels — and any
 * depth cap would silently restore this very gap one level below it. What
 * bounds the walk instead is `fetched`: an invocation already walked is not
 * walked again, so a cycle cannot spin and no job is collected twice. The
 * caller seeds it with the analysis's own invocation.
 */
function subworkflowGalaxyJobsEffect(
  subInvocationId: string,
  galaxyLayer: Layer.Layer<bt.GalaxyFetch>,
  fetched: Set<string>,
): Effect.Effect<StepGalaxyJob[], SyncAnalysisError, never> {
  return Effect.gen(function* () {
    if (fetched.has(subInvocationId)) {
      yield* Effect.logDebug('subworkflow invocation already walked', {
        galaxyInvocationId: subInvocationId,
      })
      return []
    }
    fetched.add(subInvocationId)

    const subInvocation = yield* bt
      .getInvocationEffect(subInvocationId, { stepDetails: true })
      .pipe(
        bt.toGalaxyServiceUnavailable,
        Effect.provide(galaxyLayer),
        Effect.mapError(
          error =>
            new SyncAnalysisError({
              message: `Failed to fetch subworkflow invocation: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        ),
      )

    const jobs: StepGalaxyJob[] = []
    for (const step of subInvocation.steps || []) {
      jobs.push(...stepGalaxyJobs(step))
      if (step.subworkflow_invocation_id) {
        jobs.push(...yield* subworkflowGalaxyJobsEffect(
          step.subworkflow_invocation_id,
          galaxyLayer,
          fetched,
        ))
      }
    }

    yield* Effect.logDebug('subworkflow invocation walked', {
      galaxyInvocationId: subInvocationId,
      steps: subInvocation.steps?.length ?? 0,
      synced: jobs.length,
    })
    return jobs
  })
}

export function getAnalysisStderrEffect(
  supabase: SupabaseClient<Database>,
  analysisId: number,
  ownerId: string,
) {
  return Effect.gen(function* () {
    const { data, error } = yield* Effect.tryPromise({
      try: () =>
        supabase
          .schema('galaxy')
          .from('jobs')
          .select('stderr')
          .eq('analysis_id', analysisId)
          .eq('owner_id', ownerId)
          .not('stderr', 'is', null)
          .neq('stderr', '')
          .order('id', { ascending: true })
          .limit(1)
          .maybeSingle(),
      catch: error =>
        new SyncAnalysisError({ message: `Failed to get analysis stderr: ${error}` }),
    })

    if (error) {
      return yield* Effect.fail(
        new SyncAnalysisError({ message: `Failed to get analysis stderr: ${error.message}` }),
      )
    }

    const stderr = data?.stderr
    if (typeof stderr !== 'string')
      return null
    const trimmed = stderr.trim()
    return trimmed.length > 0 ? trimmed : null
  })
}

export function updateAnalysisMonitoringOutcome(
  supabase: SupabaseClient<Database>,
  galaxyInvocationId: string,
  ownerId: string,
  state: bt.InvocationState,
  stderr: string | null,
) {
  return Effect.gen(function* () {
    const payload = buildMonitoringUpdatePayload(state, stderr)
    if (!payload) {
      return
    }

    const { outcome, completedAt, errorMessage } = payload

    const { error } = yield* Effect.tryPromise({
      try: () =>
        supabase
          .schema('galaxy')
          .from('analysis_monitoring')
          .update({
            outcome,
            completed_at: completedAt.toISOString(),
            error_message: errorMessage,
          })
          .eq('galaxy_invocation_id', galaxyInvocationId)
          .eq('owner_id', ownerId)
          .eq('outcome', 'pending'),
      catch: error =>
        new SyncAnalysisError({ message: `Failed to update monitoring outcome: ${error}` }),
    })

    if (error) {
      return yield* Effect.fail(
        new SyncAnalysisError({ message: `Failed to update monitoring outcome: ${error.message}` }),
      )
    }

    yield* Effect.logInfo('monitoring outcome updated', { galaxyInvocationId, outcome })
  })
}

export function syncAnalysisEffect(
  analysisId: number,
  ownerId: string,
  supabase: SupabaseClient<Database>,
  galaxyLayer: Layer.Layer<bt.GalaxyFetch>,
  syncConfig: SyncConfig,
) {
  let currentAnalysis: { sync_attempts: number } | null = null
  return Effect.gen(function* () {
    yield* Effect.logDebug('starting analysis')
    const acquired = yield* acquireSyncLock(supabase, analysisId, syncConfig.lockTtlSeconds)
    yield* Effect.logDebug('lock acquired', { acquired })
    if (!acquired) {
      return
    }
    yield* Effect.addFinalizer(() =>
      releaseSyncLock(supabase, analysisId).pipe(
        Effect.catchAll(error =>
          Effect.logError('failed to release sync lock', { message: error.message }),
        ),
      ),
    )

    const { data: analysis, error: analysisError } = yield* Effect.tryPromise({
      try: () =>
        supabase
          .schema('galaxy')
          .from('analyses')
          .select('id, state, galaxy_id, history_id, owner_id, sync_attempts')
          .eq('id', analysisId)
          .single(),
      catch: error =>
        new SyncAnalysisError({ message: `Failed to fetch analysis: ${error}` }),
    })

    if (analysisError || !analysis) {
      return yield* Effect.fail(
        new SyncAnalysisError({ message: `Analysis ${analysisId} not found` }),
      )
    }
    currentAnalysis = analysis

    if (analysis.owner_id !== ownerId) {
      yield* Effect.logError('ownership mismatch', { analysisId, ownerId })
      return yield* Effect.fail(new SyncAnalysisError({ message: 'Ownership mismatch' }))
    }

    yield* Effect.logDebug('fetching invocation', { galaxyInvocationId: analysis.galaxy_id })
    const invocation = yield* bt
      // `step_details` is what makes a mapped step's jobs reachable: without
      // it Galaxy reports `job_id: null` for the step and says nothing about
      // the jobs the implicit collection holds (#84).
      .getInvocationEffect(analysis.galaxy_id, { stepDetails: true })
      .pipe(
        bt.toGalaxyServiceUnavailable,
        Effect.provide(galaxyLayer),
        Effect.mapError(
          error =>
            new SyncAnalysisError({
              message: `Failed to fetch invocation: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            }),
        ),
      )

    yield* Effect.logDebug('invocation state', { state: invocation.state, steps: invocation.steps?.length ?? 0 })
    let effectiveState = invocation.state
    let isTerminal = isInvocationTerminalState(invocation.state)

    if (!isTerminal) {
      const jobsSummary = yield* bt
        .getInvocationJobsSummaryEffect(analysis.galaxy_id)
        .pipe(
          bt.toGalaxyServiceUnavailable,
          Effect.provide(galaxyLayer),
          Effect.mapError(
            error =>
              new SyncAnalysisError({
                message: `Failed to fetch invocation jobs summary: ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
              }),
          ),
        )
      const derivedOutcome = deriveInvocationOutcomeFromJobsSummary(jobsSummary)
      yield* Effect.logDebug('derived outcome from jobs summary', { derivedOutcome })
      if (derivedOutcome) {
        effectiveState = derivedOutcome === 'success' ? 'completed' : derivedOutcome === 'error' ? 'failed' : 'cancelled'
        isTerminal = true
      }
    }

    const stderr
      = isTerminal && effectiveState === 'failed'
        ? yield* getAnalysisStderrEffect(supabase, analysisId, ownerId)
        : null

    const { error: updateAnalysisError } = yield* Effect.tryPromise({
      try: () =>
        supabase
          .schema('galaxy')
          .from('analyses')
          .update({
            state: effectiveState,
            invocation: invocation as any,
            is_sync: isTerminal,
            stderr,
            sync_attempts: 0,
            last_sync_error_at: null,
            next_sync_at: null,
          })
          .eq('id', analysisId),
      catch: error =>
        new SyncAnalysisError({ message: `Failed to update analysis state: ${error}` }),
    })

    if (updateAnalysisError) {
      return yield* Effect.fail(
        new SyncAnalysisError({ message: `Failed to update analysis state: ${updateAnalysisError.message}` }),
      )
    }
    yield* Effect.logInfo('updated state', { state: effectiveState, isSync: isTerminal })

    if (isTerminal) {
      yield* updateAnalysisMonitoringOutcome(
        supabase,
        analysis.galaxy_id,
        ownerId,
        effectiveState,
        stderr,
      )
    }

    // Read once, before the loop: a mapped step asks after one job per
    // element, and a row-by-row lookup would only move #106's N+1 from
    // Galaxy to Postgres.
    const recordedJobs = yield* selectRecordedJobsEffect(supabase, analysisId)
    let skipped = 0

    // Seeded with the analysis's own invocation, so a sub-invocation naming
    // it back could not send the walk round in a circle (#119).
    const fetchedInvocations = new Set<string>([analysis.galaxy_id])

    /**
     * Record one job of a step under `stepId` and answer its row id.
     *
     * The invocation has already told us this job's state and update time,
     * so a job that matches what we recorded has nothing to write and costs
     * no `GET /api/jobs/{id}` (#106). Its row id still stands in for what
     * the fetch would have returned.
     */
    const recordStepJob = (stepId: number, { galaxyJobId, reported }: StepGalaxyJob) =>
      Effect.gen(function* () {
        const unchanged = unchangedRecordedJob(recordedJobs.get(galaxyJobId), reported)
        if (unchanged) {
          skipped++
          return unchanged.id
        }
        return yield* syncJobEffect(
          galaxyJobId,
          stepId,
          analysisId,
          ownerId,
          supabase,
          galaxyLayer,
        )
      })

    for (const step of invocation.steps || []) {
      const jobDbIds: number[] = []
      for (const stepJob of stepGalaxyJobs(step)) {
        // every job of a mapped step belongs to the one step, so they all
        // carry its `order_index`; `jobs.step_id` bears no constraint
        jobDbIds.push(yield* recordStepJob(step.order_index, stepJob))
      }

      // A subworkflow's jobs are recorded against the **outer** step's
      // `order_index`, never their own. A nested step's index is 0, 1, 2…
      // like any other, so a nested job written under it would be
      // indistinguishable from the outer step at that index. Under the
      // outer index they cannot be confused with an outer step's own job
      // either: a subworkflow step runs none, so every row at a subworkflow
      // step's index came from inside it (#119).
      //
      // Deliberately kept out of `jobDbIds`: the output sync below takes the
      // step's own single job, and a subworkflow step has none. Attaching an
      // outer labelled output to whichever nested job happened to be alone
      // would be an arbitrary choice that a second nested job silently
      // reverses.
      if (step.subworkflow_invocation_id) {
        const nestedJobs = yield* subworkflowGalaxyJobsEffect(
          step.subworkflow_invocation_id,
          galaxyLayer,
          fetchedInvocations,
        )
        for (const nestedJob of nestedJobs) {
          yield* recordStepJob(step.order_index, nestedJob)
        }
      }

      // `analysis_outputs.job_id` names a single job, and the invocation's
      // `outputs` map holds only the workflow's labelled dataset outputs — a
      // mapped step's output is a collection and appears under
      // `output_collections`, which this sync does not read. So a step with
      // more than one job has nothing here to attach, and attaching the same
      // dataset to each of its jobs would write one row and re-upload the
      // file once per element.
      if (jobDbIds.length !== 1) {
        continue
      }
      const outputs = Object.values(invocation.outputs || {}).filter(
        output => output.workflow_step_id === step.workflow_step_id,
      )
      for (const output of outputs) {
        yield* syncOutputDatasetEffect(
          output.id,
          analysisId,
          analysis.history_id,
          jobDbIds[0]!,
          ownerId,
          supabase,
          galaxyLayer,
        )
      }
    }

    if (skipped > 0) {
      yield* Effect.logDebug('unchanged jobs left unfetched', { skipped })
    }

    const { error: historyError } = yield* Effect.tryPromise({
      try: () =>
        supabase
          .schema('galaxy')
          .from('histories')
          .update({
            state: isTerminal ? 'ok' : 'running',
            is_sync: isTerminal,
          })
          .eq('id', analysis.history_id),
      catch: error =>
        new SyncAnalysisError({ message: `Failed to update history state: ${error}` }),
    })

    if (historyError) {
      return yield* Effect.fail(
        new SyncAnalysisError({ message: `Failed to update history state: ${historyError.message}` }),
      )
    }

    yield* Effect.logInfo('history state updated', {
      historyId: analysis.history_id,
      state: isTerminal ? 'ok' : 'running',
      isSync: isTerminal,
    })
  }).pipe(
    Effect.annotateLogs({
      analysisId: String(analysisId),
      ownerId,
      galaxyInvocationId: null,
      historyId: null,
      jobId: null,
      datasetId: null,
    }),
    Effect.scoped,
    Effect.tapError(error =>
      isTransientError(error)
        ? Effect.logDebug('transient error, retrying', { message: getErrorMessage(error) })
        : Effect.void,
    ),
    Effect.retry({
      schedule: Schedule.exponential(`${syncConfig.retryBaseDelayMs} millis`).pipe(
        Schedule.delayed(duration =>
          Math.min(Duration.toMillis(duration), syncConfig.retryMaxDelayMs),
        ),
        Schedule.intersect(Schedule.recurs(syncConfig.maxRetries)),
      ),
      while: isTransientError,
    }),
    Effect.tapError(error =>
      isTransientError(error)
        ? Effect.logDebug('transient retry attempts exhausted', { message: getErrorMessage(error) })
        : Effect.void,
    ),
    Effect.catchAll((originalError) => {
      if (!currentAnalysis || !isTransientError(originalError)) {
        return Effect.fail(originalError)
      }
      const analysis = currentAnalysis
      return Effect.gen(function* () {
        const baseDelayMs = syncConfig.retryBaseDelayMs
        const delayMs = Math.min(baseDelayMs * 2 ** analysis.sync_attempts, syncConfig.retryMaxDelayMs)
        const nextSyncAt = new Date(Date.now() + delayMs).toISOString()
        yield* Effect.tryPromise({
          try: () =>
            supabase
              .schema('galaxy')
              .from('analyses')
              .update({
                sync_attempts: analysis.sync_attempts + 1,
                last_sync_error_at: new Date().toISOString(),
                next_sync_at: nextSyncAt,
              })
              .eq('id', analysisId),
          catch: dbError =>
            new SyncAnalysisError({ message: `Failed to record sync attempt: ${dbError}` }),
        }).pipe(
          Effect.catchAll(dbError =>
            Effect.logError('failed to record sync attempt', { message: dbError.message }),
          ),
        )
        return yield* Effect.fail(originalError)
      })
    }),
  )
}
