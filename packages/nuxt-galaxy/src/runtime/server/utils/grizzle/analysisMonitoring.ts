import type { InvocationJobsSummary, InvocationState, InvocationTerminalState, JobState } from 'blendtype'
import type { AnalysisMonitoringTrendPoint, AnalysisMonitoringWorkflowUsage } from '../../../types/nuxt-galaxy'
import type { useDrizzle } from '../drizzle'
import { InvocationTerminalStates, JobStates } from 'blendtype'
import { and, eq, sql } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { analysisMonitoring } from '../../db/schema/galaxy/analysisMonitoring'
import { Drizzle } from '../drizzle'
import { takeUniqueOrThrow } from './helper'

/**
 * Immutable snapshot of the workflow an analysis was created against,
 * frozen at write time (D-10). It is never re-resolved on later workflow
 * rename/re-version so per-workflow stats survive workflow deletion.
 * An unresolved field stays `null` and surfaces as the "unknown" bucket (D-05).
 */
export interface WorkflowSnapshot {
  readonly workflowName: string | null
  readonly galaxyWorkflowId: string | null
  readonly workflowVersion: string | null
}

type DrizzleClient = ReturnType<typeof useDrizzle>
// The client type passed to a `useDrizzle.transaction(...)` callback. Distinct
// from the root `Drizzle` service value: the transaction client is a
// `PgAsyncTransaction`, not the connection-holding database handle.
type DrizzleTransaction = Parameters<Parameters<DrizzleClient['transaction']>[0]>[0]

export const terminalOutcomeMap = Object.freeze({
  failed: 'error',
  cancelled: 'cancelled',
  completed: 'success',
} as const satisfies Record<InvocationTerminalState, 'success' | 'error' | 'cancelled'>)

export interface MonitoringUpdatePayload {
  readonly outcome: 'success' | 'error' | 'cancelled'
  readonly completedAt: Date
  readonly errorMessage: string | null
}

export function buildMonitoringUpdatePayload(
  state: InvocationState,
  stderr: string | null | undefined,
): MonitoringUpdatePayload | undefined {
  if (!isInvocationTerminalState(state)) {
    return undefined
  }
  const outcome = terminalOutcomeMap[state]
  if (!outcome) {
    return undefined
  }
  return {
    outcome,
    completedAt: new Date(),
    errorMessage: state === 'failed' ? (stderr ?? null) : null,
  }
}

export function isInvocationTerminalState(state: InvocationState): state is InvocationTerminalState {
  return (InvocationTerminalStates as readonly InvocationState[]).includes(state)
}

export const terminalJobStates = Object.freeze(new Set<JobState>([
  'ok',
  'error',
  'failed',
  'stopped',
  'stop',
  'deleted',
  'skipped',
]))

export const nonTerminalJobStates = Object.freeze(new Set<JobState>([
  'new',
  'upload',
  'queued',
  'running',
  'paused',
  'deleting',
  'resubmitted',
  'waiting',
]))

function isKnownJobState(state: string): state is JobState {
  return (JobStates as readonly string[]).includes(state)
}

export function deriveInvocationOutcomeFromJobsSummary(
  summary: InvocationJobsSummary,
): 'success' | 'error' | 'cancelled' | undefined {
  if (summary.populated_state !== 'ok') {
    return undefined
  }

  const states = Object.entries(summary.states)
  if (states.length === 0) {
    return undefined
  }

  let totalJobs = 0
  let terminalCount = 0
  let hasError = false
  let hasOkOrSkipped = false
  let hasDeleted = false
  let nonDeletedTerminalCount = 0

  for (const [state, count] of states) {
    if (count === undefined || count === 0) {
      continue
    }
    if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
      return undefined
    }
    if (!isKnownJobState(state)) {
      return undefined
    }
    if (nonTerminalJobStates.has(state)) {
      return undefined
    }
    if (!terminalJobStates.has(state)) {
      return undefined
    }

    totalJobs += count
    terminalCount += count
    if (state === 'ok' || state === 'skipped') {
      hasOkOrSkipped = true
    }
    if (state === 'error' || state === 'failed' || state === 'stopped' || state === 'stop') {
      hasError = true
    }
    if (state === 'deleted') {
      hasDeleted = true
    }
    else {
      nonDeletedTerminalCount += count
    }
  }

  if (totalJobs === 0 || terminalCount < totalJobs) {
    return undefined
  }

  if (hasError) {
    return 'error'
  }
  if (hasOkOrSkipped) {
    return 'success'
  }
  if (hasDeleted && nonDeletedTerminalCount === 0) {
    return 'cancelled'
  }
  return undefined
}

export class InsertAnalysisMonitoringError extends Data.TaggedError('InsertAnalysisMonitoringError')<{
  readonly message: string
}> {}

export function insertAnalysisMonitoringEffect(
  analysisId: number,
  ownerId: string,
  workflowId: number,
  name: string,
  galaxyInvocationId: string,
  workflowSnapshot?: WorkflowSnapshot,
  tx?: DrizzleTransaction,
) {
  return Effect.gen(function* () {
    const db = tx ?? (yield* Drizzle)
    return yield* Effect.tryPromise({
      try: () => db
        .insert(analysisMonitoring)
        .values({
          analysisId,
          ownerId,
          workflowId,
          name,
          outcome: 'pending',
          galaxyInvocationId,
          workflowName: workflowSnapshot?.workflowName ?? null,
          galaxyWorkflowId: workflowSnapshot?.galaxyWorkflowId ?? null,
          workflowVersion: workflowSnapshot?.workflowVersion ?? null,
        })
        .returning({ insertedId: analysisMonitoring.id })
        .then(takeUniqueOrThrow),
      catch: error => new InsertAnalysisMonitoringError({ message: `Error inserting analysis monitoring: ${error}` }),
    })
  })
}

export class UpdateAnalysisMonitoringError extends Data.TaggedError('UpdateAnalysisMonitoringError')<{
  readonly message: string
}> {}

export function updateAnalysisMonitoringEffect(
  { galaxyInvocationId, state, stderr, ownerId }: {
    galaxyInvocationId: string
    state: InvocationState
    stderr: string | null | undefined
    ownerId: string
  },
) {
  return Effect.gen(function* () {
    const payload = buildMonitoringUpdatePayload(state, stderr)
    if (!payload) {
      return
    }
    const { outcome, completedAt, errorMessage } = payload
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .update(analysisMonitoring)
        .set({
          outcome,
          completedAt,
          errorMessage,
        })
        .where(
          and(
            eq(analysisMonitoring.galaxyInvocationId, galaxyInvocationId),
            eq(analysisMonitoring.ownerId, ownerId),
            eq(analysisMonitoring.outcome, 'pending'),
          ),
        )
        .returning({ updatedId: analysisMonitoring.id })
        .then(takeUniqueOrThrow)
        .then((row) => {
          if (row === null) {
            return undefined
          }
          return row
        }),
      catch: error => new UpdateAnalysisMonitoringError({ message: `Error updating analysis monitoring: ${error}` }),
    })
  })
}

export class FinalizeAnalysisMonitoringError extends Data.TaggedError('FinalizeAnalysisMonitoringError')<{
  readonly message: string
}> {}

/**
 * Finalizes a stranded `pending` monitoring row to `cancelled` when an analysis
 * is deleted (WRIT-02). It is pending-guarded (D-09) and located by
 * `analysisId` + `ownerId` (D-08), so a real terminal outcome written by the
 * sync task is never overwritten. Returns the updated row or `undefined` on a
 * 0-row no-op (never a numeric count).
 *
 * Must be called with the transaction-callback client (`tx`), only from inside
 * an existing `useDrizzle.transaction(...)` — it never `yield* Drizzle`, so the
 * finalize and the sibling `analyses` DELETE commit/roll back atomically (D-07).
 */
export function finalizeAnalysisMonitoringEffect(
  analysisId: number,
  ownerId: string,
  tx: DrizzleTransaction,
) {
  return Effect.tryPromise({
    try: () => tx
      .update(analysisMonitoring)
      .set({
        outcome: 'cancelled',
        completedAt: new Date(),
      })
      .where(
        and(
          eq(analysisMonitoring.analysisId, analysisId),
          eq(analysisMonitoring.ownerId, ownerId),
          eq(analysisMonitoring.outcome, 'pending'),
        ),
      )
      .returning({ updatedId: analysisMonitoring.id })
      .then(takeUniqueOrThrow)
      .then(row => row === null ? undefined : row),
    catch: error => new FinalizeAnalysisMonitoringError({ message: `Error finalizing analysis monitoring: ${error}` }),
  })
}

export class GetAnalysisMonitoringCountsError extends Data.TaggedError('GetAnalysisMonitoringCountsError')<{
  readonly message: string
}> {}

// exported so the SQL it emits can be asserted without a database
export function selectCounts(ownerId?: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    const baseQuery = useDrizzle
      .select({
        total: sql<number>`count(*)::int`,
        success: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'success')::int`,
        error: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'error')::int`,
        cancelled: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'cancelled')::int`,
        pending: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'pending')::int`,
      })
      .from(analysisMonitoring)
    return ownerId
      ? baseQuery.where(eq(analysisMonitoring.ownerId, ownerId))
      : baseQuery
  })
}

export function getAnalysisMonitoringCounts(ownerId: string) {
  return Effect.gen(function* () {
    const query = yield* selectCounts(ownerId)
    const row = yield* Effect.tryPromise({
      try: () => query.then(takeUniqueOrThrow),
      catch: error => new GetAnalysisMonitoringCountsError({ message: `Error getting monitoring counts: ${error}` }),
    })
    return {
      total: row?.total ?? 0,
      success: row?.success ?? 0,
      error: row?.error ?? 0,
      cancelled: row?.cancelled ?? 0,
      pending: row?.pending ?? 0,
    }
  })
}

export function getAllAnalysisMonitoringCounts() {
  return Effect.gen(function* () {
    const query = yield* selectCounts()
    const row = yield* Effect.tryPromise({
      try: () => query.then(takeUniqueOrThrow),
      catch: error => new GetAnalysisMonitoringCountsError({ message: `Error getting monitoring counts: ${error}` }),
    })
    return {
      total: row?.total ?? 0,
      success: row?.success ?? 0,
      error: row?.error ?? 0,
      cancelled: row?.cancelled ?? 0,
      pending: row?.pending ?? 0,
    }
  })
}

/**
 * Single source-of-truth success rate (STAT-04 / D-01..D-03).
 * Reliability is measured among analyses that reached a definitive terminal
 * outcome: `success / (success + error)`. `pending` and `cancelled` rows are
 * excluded from the denominator. When there are no terminal outcomes (D-02),
 * returns `0` — never `null` — so every entry carries a valid number. Every
 * query path in this file must compute the ratio through this helper (D-03).
 */
export function computeSuccessRate(success: number, error: number): number {
  const denominator = success + error
  if (denominator === 0) {
    return 0
  }
  return success / denominator
}

export class GetWorkflowUsageError extends Data.TaggedError('GetWorkflowUsageError')<{
  readonly message: string
}> {}

interface WorkflowUsageRow {
  workflowId: number
  name: string | null
  version: string | null
  total: number
  success: number
  error: number
  cancelled: number
  pending: number
}

// exported so the SQL it emits can be asserted without a database
export function selectWorkflowUsage(ownerId?: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    const base = useDrizzle
      .select({
        workflowId: analysisMonitoring.workflowId,
        name: sql<string | null>`max(${analysisMonitoring.workflowName})`,
        version: sql<string | null>`max(${analysisMonitoring.workflowVersion})`,
        total: sql<number>`count(*)::int`,
        success: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'success')::int`,
        error: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'error')::int`,
        cancelled: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'cancelled')::int`,
        pending: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'pending')::int`,
      })
      .from(analysisMonitoring)
      .groupBy(analysisMonitoring.workflowId)
    return ownerId
      ? base.where(eq(analysisMonitoring.ownerId, ownerId))
      : base
  })
}

function shapeWorkflowUsage(rows: WorkflowUsageRow[]): AnalysisMonitoringWorkflowUsage[] {
  let orphanTotal = 0
  let orphanSuccess = 0
  let orphanError = 0
  let orphanCancelled = 0
  let orphanPending = 0
  const entries: AnalysisMonitoringWorkflowUsage[] = []
  for (const row of rows) {
    if (row.name === null) {
      // D-09 orphan: snapshot workflow_name unresolved (workflow deleted before capture).
      // workflowId stays a non-null integer in the DB; collapse here in JS only.
      orphanTotal += row.total
      orphanSuccess += row.success
      orphanError += row.error
      orphanCancelled += row.cancelled
      orphanPending += row.pending
    }
    else {
      entries.push({
        workflowId: row.workflowId,
        name: row.name,
        version: row.version ?? null,
        total: row.total,
        success: row.success,
        error: row.error,
        cancelled: row.cancelled,
        pending: row.pending,
        successRate: computeSuccessRate(row.success, row.error),
      })
    }
  }
  if (orphanTotal > 0) {
    entries.push({
      workflowId: null,
      name: 'unknown',
      version: null,
      total: orphanTotal,
      success: orphanSuccess,
      error: orphanError,
      cancelled: orphanCancelled,
      pending: orphanPending,
      successRate: computeSuccessRate(orphanSuccess, orphanError),
    })
  }
  return entries
}

export function getWorkflowUsage(ownerId: string) {
  return Effect.gen(function* () {
    const query = yield* selectWorkflowUsage(ownerId)
    const rows = yield* Effect.tryPromise({
      try: () => query.then(rows => rows as WorkflowUsageRow[], (reason) => { throw reason }),
      catch: error => new GetWorkflowUsageError({ message: `Error getting workflow usage: ${error}` }),
    })
    return shapeWorkflowUsage(rows)
  })
}

export function getAllWorkflowUsage() {
  return Effect.gen(function* () {
    const query = yield* selectWorkflowUsage()
    const rows = yield* Effect.tryPromise({
      try: () => query.then(rows => rows as WorkflowUsageRow[], (reason) => { throw reason }),
      catch: error => new GetWorkflowUsageError({ message: `Error getting workflow usage: ${error}` }),
    })
    return shapeWorkflowUsage(rows)
  })
}

// ============================================================================
// Trend dimension (STAT-03) — time-bucket series over started_at
// ============================================================================

/**
 * Closed allowlist of supported trend granularities (D-04). The value of this
 * argument is NEVER interpolated into SQL from caller input — it indexes the
 * fixed `TREND_INTERVALS` map and drives a JS flooring helper, so a caller can
 * only ever select a pre-authorized bucket width (T-14-05 mitigation).
 */
export type TrendGranularity = 'day' | 'week' | 'month'

/** Fixed interval literals ($interval in `date_trunc($text, ...)`) for each granularity (D-04 allowlist). */
export const TREND_INTERVALS: Record<TrendGranularity, string> = {
  day: '1 day',
  week: '1 week',
  month: '1 month',
}

export class GetTrendError extends Data.TaggedError('GetTrendError')<{
  readonly message: string
}> {}

interface TrendRangeRow {
  min: Date | null
  max: Date | null
}

interface TrendBucketRow {
  bucket: string
  total: number
  success: number
  error: number
  cancelled: number
  pending: number
}

/**
 * The unit each granularity names in SQL (D-04 allowlist). Written into the
 * query as a literal rather than bound as a parameter: Postgres matches a
 * GROUP BY entry against the select list by expression, and Drizzle emits a
 * bound value as a fresh placeholder in each position it appears -- $1 in the
 * select list, $3 in the GROUP BY -- which makes the two expressions unequal
 * and leaves started_at ungrouped, so Postgres rejects the query. Caller input
 * still only ever indexes this frozen map and never reaches the SQL text, so
 * the allowlist property (T-14-05) holds.
 */
const BUCKET_UNITS = Object.freeze({
  day: 'day',
  week: 'week',
  month: 'month',
} as const satisfies Record<TrendGranularity, string>)

/**
 * The single `date_trunc(unit, started_at AT TIME ZONE 'UTC')` bucket
 * expression used in the bucket GROUP BY (D-07). The covered range is floored
 * with the identical UTC truncation semantics on the JS side (D-06), so the
 * range and the buckets always agree and `sum(trend[].total) === counts.total`.
 */
function utcBucket(gran: TrendGranularity) {
  return sql<string>`date_trunc('${sql.raw(BUCKET_UNITS[gran])}', ${analysisMonitoring.startedAt} AT TIME ZONE 'UTC')`
}

function selectTrendRange(ownerId?: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    const base = useDrizzle
      .select({
        min: sql<Date>`min(${analysisMonitoring.startedAt})`,
        max: sql<Date>`max(${analysisMonitoring.startedAt})`,
      })
      .from(analysisMonitoring)
    return ownerId
      ? base.where(eq(analysisMonitoring.ownerId, ownerId))
      : base
  })
}

// exported so the SQL it emits can be asserted without a database
export function selectTrendBuckets(ownerId: string | undefined, gran: TrendGranularity) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    const bucket = utcBucket(gran)
    const base = useDrizzle
      .select({
        bucket,
        total: sql<number>`count(*)::int`,
        success: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'success')::int`,
        error: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'error')::int`,
        cancelled: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'cancelled')::int`,
        pending: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'pending')::int`,
      })
      .from(analysisMonitoring)
      .groupBy(bucket)
    return ownerId
      ? base.where(eq(analysisMonitoring.ownerId, ownerId))
      : base
  })
}

/** Floors a UTC instant to the start of its bucket, in UTC. */
function floorToGranularity(date: Date, gran: TrendGranularity): Date {
  const floored = new Date(date)
  floored.setUTCHours(0, 0, 0, 0)
  if (gran === 'day') {
    return floored
  }
  if (gran === 'week') {
    // Postgres date_trunc('week', ...) is ISO-week: the week starts on Monday.
    const day = floored.getUTCDay()
    const daysSinceMonday = (day + 6) % 7
    floored.setUTCDate(floored.getUTCDate() - daysSinceMonday)
    return floored
  }
  // month
  floored.setUTCDate(1)
  return floored
}

/**
 * Advances a bucket-start instant to the start of the NEXT bucket. Day and week
 * step by fixed calendar units; month steps by calendar month (staying on the
 * 1st and wrapping the year), so variable-length months never accumulate
 * fixed-ms drift (RESEARCH A3 / T-14-07).
 */
function addGranularity(date: Date, gran: TrendGranularity): Date {
  if (gran === 'month') {
    const next = new Date(date)
    let month = next.getUTCMonth() + 1
    let year = next.getUTCFullYear()
    if (month === 12) {
      month = 0
      year += 1
    }
    next.setUTCFullYear(year, month, 1)
    next.setUTCHours(0, 0, 0, 0)
    return next
  }
  return new Date(date.getTime() + (gran === 'week' ? 7 : 1) * 86_400_000)
}

const BUCKET_KEY_LENGTH: Record<TrendGranularity, number> = {
  day: 10, // YYYY-MM-DD
  week: 10, // YYYY-MM-DD (Monday of ISO week)
  month: 7, // YYYY-MM
}

/**
 * Normalizes any bucket key — whether SQL-returned (`date_trunc` output shaped
 * by the driver) or JS-generated — to ONE canonical UTC string ('YYYY-MM-DD'
 * for day/week, 'YYYY-MM' for month), so the two sides always align regardless
 * of driver formatting (D-05, main drift risk).
 */
function canonicalBucketKey(key: string | Date, gran: TrendGranularity): string {
  const date = new Date(key instanceof Date ? key : key)
  if (Number.isNaN(date.getTime())) {
    return String(key)
  }
  return floorToGranularity(date, gran).toISOString().slice(0, BUCKET_KEY_LENGTH[gran])
}

function buildTrendSeries(
  range: TrendRangeRow | undefined,
  rows: TrendBucketRow[],
  gran: TrendGranularity,
): AnalysisMonitoringTrendPoint[] {
  if (!range || range.min === null || range.max === null) {
    // STAT-03 empty edge: no rows at all → empty series.
    return []
  }

  const start = floorToGranularity(new Date(range.min), gran)
  const end = floorToGranularity(new Date(range.max), gran)
  if (end.getTime() < start.getTime()) {
    return []
  }

  const byBucket = new Map<string, TrendBucketRow>()
  for (const row of rows) {
    byBucket.set(canonicalBucketKey(row.bucket, gran), row)
  }

  const points: AnalysisMonitoringTrendPoint[] = []
  let cursor = start
  while (cursor.getTime() <= end.getTime()) {
    const key = canonicalBucketKey(cursor, gran)
    const row = byBucket.get(key)
    const success = row?.success ?? 0
    const error = row?.error ?? 0
    points.push({
      bucket: key,
      total: row?.total ?? 0,
      success,
      error,
      cancelled: row?.cancelled ?? 0,
      pending: row?.pending ?? 0,
      successRate: computeSuccessRate(success, error),
    })
    cursor = addGranularity(cursor, gran)
  }
  return points
}

function trendSeries(ownerId: string | undefined, granularity: TrendGranularity) {
  return Effect.gen(function* () {
    const [rangeQuery, bucketQuery] = yield* Effect.all([
      selectTrendRange(ownerId),
      selectTrendBuckets(ownerId, granularity),
    ])

    const rangeRows = yield* Effect.tryPromise({
      try: () => rangeQuery.then((rows: unknown) => rows as TrendRangeRow[], (reason) => { throw reason }),
      catch: error => new GetTrendError({ message: `Error getting trend range: ${error}` }),
    })
    const bucketRows = yield* Effect.tryPromise({
      try: () => bucketQuery.then((rows: unknown) => rows as TrendBucketRow[], (reason) => { throw reason }),
      catch: error => new GetTrendError({ message: `Error getting trend buckets: ${error}` }),
    })

    return buildTrendSeries(rangeRows[0], bucketRows, granularity)
  })
}

export function getTrend(ownerId: string, granularity: TrendGranularity = 'day') {
  return trendSeries(ownerId, granularity)
}

export function getAllTrend(granularity: TrendGranularity = 'day') {
  return trendSeries(undefined, granularity)
}

// ============================================================================
// Composite dimension (D-11) — assembles counts + perWorkflow + trend into the
// single AnalysisMonitoringStats object Phase 15 endpoints consume.
// ============================================================================

export class GetAnalysisMonitoringStatsError extends Data.TaggedError('GetAnalysisMonitoringStatsError')<{
  readonly message: string
}> {}

/**
 * Assembles the three finished monitoring dimensions — counts, per-workflow
 * usage, and trend — into a single `AnalysisMonitoringStats` object (D-11).
 * The overall success-rate is routed through the shared `computeSuccessRate`
 * formula (STAT-04 / D-01..D-03), so every successRate on every path is
 * produced by the same single documented formula.
 *
 * Self variant (T-14-09): only ever composes the ownerId-scoped helpers, each
 * of which adds a server-side `WHERE owner_id`, so no other user's rows can be
 * surfaced. Runs all three dimensions via `Effect.all` (sequential by default)
 * and maps any constituent failure to `GetAnalysisMonitoringStatsError`.
 */
export function getAnalysisMonitoringStats(ownerId: string) {
  return Effect.gen(function* () {
    const [counts, perWorkflow, trend] = yield* Effect.all([
      getAnalysisMonitoringCounts(ownerId),
      getWorkflowUsage(ownerId),
      getTrend(ownerId),
    ]).pipe(
      Effect.mapError(error =>
        new GetAnalysisMonitoringStatsError({ message: `Error assembling monitoring stats: ${error}` }),
      ),
    )
    return {
      ...counts,
      successRate: computeSuccessRate(counts.success, counts.error),
      perWorkflow,
      trend,
    }
  })
}

/**
 * Admin variant (T-14-10): composes the all-rows helpers (`GetAll*`), which rely
 * on the RLS admin SELECT policy and emit no `WHERE`. Phase 15 gates this behind
 * an admin role check before invocation; no endpoint exists in this phase.
 */
export function getAllAnalysisMonitoringStats() {
  return Effect.gen(function* () {
    const [counts, perWorkflow, trend] = yield* Effect.all([
      getAllAnalysisMonitoringCounts(),
      getAllWorkflowUsage(),
      getAllTrend(),
    ]).pipe(
      Effect.mapError(error =>
        new GetAnalysisMonitoringStatsError({ message: `Error assembling monitoring stats: ${error}` }),
      ),
    )
    return {
      ...counts,
      successRate: computeSuccessRate(counts.success, counts.error),
      perWorkflow,
      trend,
    }
  })
}
