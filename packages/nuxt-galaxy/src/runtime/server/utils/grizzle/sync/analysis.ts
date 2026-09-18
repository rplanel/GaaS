import type { SupabaseClient } from '@supabase/supabase-js'
import type { Layer } from 'effect'
import type { Database } from '../../../../types/database'
import * as bt from 'blendtype'
import { Data, Duration, Effect, Schedule } from 'effect'
import { buildMonitoringUpdatePayload, deriveInvocationOutcomeFromJobsSummary, isInvocationTerminalState } from '../analysisMonitoring'
import { syncJobEffect } from './job'
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
      .getInvocationEffect(analysis.galaxy_id)
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

    for (const step of invocation.steps || []) {
      if (step.job_id) {
        const jobDbId = yield* syncJobEffect(
          step.job_id,
          step.order_index,
          analysisId,
          ownerId,
          supabase,
          galaxyLayer,
        )
        const outputs = Object.values(invocation.outputs || {}).filter(
          output => output.workflow_step_id === step.workflow_step_id,
        )
        for (const output of outputs) {
          yield* syncOutputDatasetEffect(
            output.id,
            analysisId,
            analysis.history_id,
            jobDbId,
            ownerId,
            supabase,
            galaxyLayer,
          )
        }
      }
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
