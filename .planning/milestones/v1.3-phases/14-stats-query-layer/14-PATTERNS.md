# Phase 14: Stats Query Layer - Pattern Map

**Mapped:** 2026-08-10
**Files analyzed:** 3 new/modified files
**Analogs found:** 3 / 3 (all exact)

Phase 14 adds read-only Effect query helpers to the existing `analysisMonitoring.ts`, extends the type surface in `types/nuxt-galaxy.ts`, and extends the existing test file. It modifies no schema, adds no migration/index, and leaves the existing counts helpers byte-identical (STAT-01 preserve).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts` | service | CRUD (read/aggregate) | Same file: `selectCounts` (L283-299) + `getAnalysisMonitoringCounts`/`getAllAnalysisMonitoringCounts` (L301-333) | exact |
| `packages/nuxt-galaxy/src/runtime/types/nuxt-galaxy.ts` | type/interface | (type-only) | `AnalysisMonitoringCounts` interface (L112-118) | exact |
| `packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts` | test | CRUD (read assert) | Existing `getAnalysisMonitoringCounts` (L298-319) + `getAllAnalysisMonitoringCounts` (L517-536) tests | exact |

---

## Pattern Assignments

### `analysisMonitoring.ts` — Query helpers (service, read aggregate)

**Analog:** `selectCounts` (L283-299) + counts helpers (L301-333) in the SAME file — this file is the canonical home; new helpers follow the identical shape.

**Imports pattern** (top of file, L1-8) — already present; new code reuses them. Note `and`, `eq`, `sql` re-exported from `../drizzle` (see drizzle.ts L7 re-export) — the file imports them from `'drizzle-orm'`:
```typescript
import { and, eq, sql } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { analysisMonitoring } from '../../db/schema/galaxy/analysisMonitoring'
import { Drizzle } from '../drizzle'
import { takeUniqueOrThrow } from './helper'
```

**DI / self-admin parity pattern** (L283-298) — the SELECT builder scopes by ownerId conditionally; admin path passes no `ownerId` and emits no WHERE:
```typescript
function selectCounts(ownerId?: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle            // DI via Context.Tag ('@nuxt-galaxy/Drizzle', drizzle.ts L17)
    const baseQuery = useDrizzle
      .select({
        total: sql<number>`count(*)`,
        success: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'success')`,
        error: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'error')`,
        cancelled: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'cancelled')`,
        pending: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'pending')`,
      })
      .from(analysisMonitoring)
    return ownerId
      ? baseQuery.where(eq(analysisMonitoring.ownerId, ownerId))   // self variant: always WHERE owner_id
      : baseQuery                                                   // admin variant: no WHERE
  })
}
```

**Error handling + TaggedError pattern** (L279-281, L304-307) — one `Data.TaggedError` per helper, wrapped via `Effect.tryPromise`:
```typescript
export class GetAnalysisMonitoringCountsError extends Data.TaggedError('GetAnalysisMonitoringCountsError')<{
  readonly message: string
}> {}

export function getAnalysisMonitoringCounts(ownerId: string) {
  return Effect.gen(function* () {
    const query = yield* selectCounts(ownerId)
    const row = yield* Effect.tryPromise({
      try: () => query.then(takeUniqueOrThrow),
      catch: error => new GetAnalysisMonitoringCountsError({ message: `Error getting monitoring counts: ${error}` }),
    })
    return {
      total: row?.total ?? 0, success: row?.success ?? 0, error: row?.error ?? 0,
      cancelled: row?.cancelled ?? 0, pending: row?.pending ?? 0,
    }
  })
}

export function getAllAnalysisMonitoringCounts() {   // admin twin, no ownerId
  return Effect.gen(function* () { ... same body, selectCounts() ... })
}
```

**Applying to STAT-02 / STAT-03 / STAT-04 / composite:**
- **STAT-04** — add pure `computeSuccessRate(success, error)` (from RESEARCH Code Example 1); the single source reused by every path (D-01..D-03). Signature: `success + error === 0 ? 0 : success / (success + error)`. Independent of Drizzle — no `Drizzle` dependency.
- **STAT-02** — `getWorkflowUsage(ownerId)` / `getAllWorkflowUsage()`: `GROUP BY analysisMonitoring.workflowId`, `sql<number>`count(*)` for `total` + the exact `filter (where outcome = 'x')` expressions from `selectCounts`, `sql<string | null>`max(${workflowName})`` / `max(workflowVersion)` for name/version, ownerId-conditional `.where(eq(...))`. Note Drizzle `groupBy` accepts a column (`workflowId`), unlike trend which groups by a `sql` bucket fragment (RESEARCH A1). JS post-step merges NULL-name rows into single sentinel `{ workflowId: null, name: 'unknown', version: null }` (D-09) — result-shaping only; column is `integer NOT NULL` (schema L31) so NULL never goes to DB.
- **STAT-03** — `getTrend(ownerId, granularity?)` / `getAllTrend(granularity?)`: bucket via `sql<string>`date_trunc(${gran}, ${analysisMonitoring.startedAt} AT TIME ZONE 'UTC')`` (D-07); range derived from `min`/`max(started_at)` (D-06); continuous zero-fill (D-05) via `generate_series` OR two-query+JS merge (planner discretion, RESEARCH Open Q1). `granularity` is the `'day'|'week'|'month'` allowlist only (D-04) — never interpolate caller input into SQL.
- **Composite** — `getAnalysisMonitoringStats(ownerId)` / `getAllAnalysisMonitoringStats()`: `Effect.all([counts, workflowUsage, trend])` in parallel, spreads counts + adds `successRate: computeSuccessRate(counts.success, counts.error)` + `perWorkflow` + `trend` (D-11). Return type is additive extension of `AnalysisMonitoringCounts`.

**Logging:** existing count helpers log nothing (no `Effect.log*`). Keep new read helpers log-free (per RESEARCH §Standard Stack: "existing read helpers log nothing"); follow nuxt-galaxy AGENTS.md evlog block + `.planning/LOGGING-SPEC.md` if any annotation is added. Never log `ownerId`.

---

### `types/nuxt-galaxy.ts` — Composite + entry interfaces (type-only)

**Analog:** `AnalysisMonitoringCounts` (L112-118) — the exact base the composite extends:
```typescript
export interface AnalysisMonitoringCounts {
  total: number
  success: number
  error: number
  cancelled: number
  pending: number
}
```

**Apply to STAT-02/03/04 (backward-compatible additive extension):**
```typescript
// Per-workflow entry (STAT-02): extends counts + snapshot provenance + per-workflow rate
export interface AnalysisMonitoringWorkflowUsage extends AnalysisMonitoringCounts {
  workflowId: number | null      // null => collapsed 'unknown' bucket (D-09)
  name: string | null            // 'unknown' for orphans
  version: string | null
  successRate: number            // computeSuccessRate(success, error) (D-01..D-03)
}

// Trend point (STAT-03): one entry per UTC bucket; zero-filled so bucket sums = total (D-05)
export interface AnalysisMonitoringTrendPoint extends AnalysisMonitoringCounts {
  bucket: string                  // iso date truncated to granularity (UTC)
  successRate: number
}

// Composite (D-11): additive extension of the existing counts — Phase 15's endpoint return shape
export interface AnalysisMonitoringStats extends AnalysisMonitoringCounts {
  perWorkflow: AnalysisMonitoringWorkflowUsage[]
  trend: AnalysisMonitoringTrendPoint[]
  successRate: number             // overall, from counts
}
```
Keep `AnalysisMonitoringCounts` untouched (preserved) and express new types as additive `extends` so Phase 15 compatibility is guaranteed.

---

### `analysisMonitoring.test.ts` — New helper tests

**Analog:** `getAnalysisMonitoringCounts` test (L298-319) for the self/`where(eq(...))` assertion + `getAllAnalysisMonitoringCounts` test (L517-536) for the no-WHERE admin assertion. Both use `createMockDrizzle()` + `drizzle.setResult([...])` + `.pipe(Effect.provide(drizzle.layer), Effect.runPromise)`.

**Self-variant assertion** (L300-318):
```typescript
const drizzle = createMockDrizzle()
drizzle.setResult([{ total: 7, success: 3, error: 2, cancelled: 1, pending: 1 }])
const result = await getAnalysisMonitoringCounts('owner-uuid-1').pipe(
  Effect.provide(drizzle.layer),
  Effect.runPromise,
)
expect(result).toEqual({ total: 7, success: 3, error: 2, cancelled: 1, pending: 1 })
expect(drizzle.mock.select).toHaveBeenCalledTimes(1)
const whereCall = drizzle.mock.select.mock.results[0]?.value.where.mock.calls[0]?.[0]
expect(whereCall).toEqual(eq(analysisMonitoring.ownerId, 'owner-uuid-1'))
```

**Admin no-WHERE assertion** (L522-535):
```typescript
const result = await getAllAnalysisMonitoringCounts().pipe(
  Effect.provide(drizzle.layer),
  Effect.runPromise,
)
expect(result).toEqual({ total: 12, success: 5, error: 4, cancelled: 2, pending: 1 })
expect(drizzle.mock.select).toHaveBeenCalledTimes(1)
expect(drizzle.mock.select.mock.results[0]?.value.where.mock.calls.length).toBe(0)  // admin: no WHERE
```

**Test imports** (L5-15) — path aliases to the source helpers; add the new helpers to the named import list:
```typescript
import { analysisMonitoring } from '../../../../src/runtime/server/db/schema/galaxy/analysisMonitoring'
import {
  getAllAnalysisMonitoringCounts,
  getAnalysisMonitoringCounts,
  ... // add computeSuccessRate, getWorkflowUsage, getAllWorkflowUsage, getTrend, getAllTrend,
  ... // getAnalysisMonitoringStats, getAllAnalysisMonitoringStats
} from '../../../../src/runtime/server/utils/grizzle/analysisMonitoring'
import { createMockDrizzle, createMockDrizzleResult } from '../../fixtures'
```

**Mock chain limitation (fixtures.ts L377-394):** `createMockDrizzleResult` exposes `groupBy` but NOT a `sql`-FROM/subquery method for a `generate_series`-backed LEFT JOIN. If the trend uses a single `generate_series` SQL FROM (RESEARCH Open Q1), ADD that method to `test/server/fixtures.ts` `chainMethods` + the `DrizzleSelectMethod` union (L406). If the trend uses the two-query + JS merge alternative, existing methods (`select`/`where`/`groupBy`/`then`) already cover it — no fixture change.

---

## Shared Patterns

### Single Success-Rate Source (STAT-04 / D-01..D-03)
**Source (to add):** `analysisMonitoring.ts` — `computeSuccessRate(success, error)`.
**Apply to:** composite counts path, every per-workflow entry, every trend point. Never write `success / (success + error)` inline anywhere else (D-03 drift guard).
```typescript
export function computeSuccessRate(success: number, error: number): number {
  return success + error === 0 ? 0 : success / (success + error)   // D-02: 0, never null
}
```

### Self / Admin Parity (D-12)
**Source (canonical):** `analysisMonitoring.ts` L283-298 (`selectCounts(ownerId?)`), L301/318 (self twin with `ownerId: string`, admin twin with no arg).
**Apply to:** `getWorkflowUsage(ownerId)`/`getAllWorkflowUsage()`, `getTrend(ownerId, gran?)`/`getAllTrend(gran?)`, `getAnalysisMonitoringStats(ownerId)`/`getAllAnalysisMonitoringStats()`. Self = `baseQuery.where(eq(analysisMonitoring.ownerId, ownerId))`; admin = `baseQuery` with no WHERE. This is the RLS defense-in-depth guarantee (self always server-side filters `owner_id`).

### Outcome `filter (where ...)` Aggregation
**Source:** `analysisMonitoring.ts` L288-292 (`selectCounts`).
**Apply to:** per-workflow and trend bucket SELECTs — identical `count(*) filter (where ${analysisMonitoring.outcome} = 'success'|'error'|'cancelled'|'pending')` expressions, so outcome definitions cannot drift between paths.
**DB column:** `analysisMonitoring.outcome` maps to enum `monitoring_outcome` `['pending','success','error','cancelled']` (schema L18-23).

### Error Handling (TaggedError + tryPromise)
**Source:** `analysisMonitoring.ts` L279-281, L304-307.
**Apply to:** each new fetch helper (`GetWorkflowUsageError`, `GetTrendError`, `GetAnalysisMonitoringStatsError`) — one `Data.TaggedError('<Name>')<{ readonly message: string }>{}` per helper, wrapped with `Effect.tryPromise({ try, catch })`. `takeUniqueOrThrow` (helper.ts L3-13) for single-row reads — throws h3 `createError` 500 on non-unique, so counts/range reads reuse it.

### Drizzle DI (`yield* Drizzle`)
**Source:** `drizzle.ts` L17-24 (`Context.Tag('@nuxt-galaxy/Drizzle')`) + `analysisMonitoring.ts` L284.
**Apply to:** every SELECT builder. `and`/`eq`/`sql` are re-exported from `../drizzle` (drizzle.ts L7); the helper file imports them from `'drizzle-orm'`. `groupBy` accepts a `sql` fragment re-used in `select` (trend) or a bare column (per-workflow) — RESEARCH A1.

### Logging
**Source:** nuxt-galaxy AGENTS.md evlog block (L215-227) + `.planning/LOGGING-SPEC.md`.
**Apply to:** new helpers log nothing by default (matching existing counts helpers). If `Effect.logInfo`/`Effect.logError` annotations are added, never log `ownerId`/`workflowId` at error level and never log secrets (GALAXY_API_KEY, Supabase keys, tokens). Effect logs are routed to evlog by `runGalaxyEffect`/`runTaskEffect`.

### Schema / Index Contract (for SQL correctness only — no edits)
**Source:** `schema/galaxy/analysisMonitoring.ts` L25-51.
**Purpose:** the two composite indexes the per-workflow and trend GROUP BYs rely on — `idx_analysis_monitoring_owner_workflow` (ownerId, workflowId, L50) and `idx_analysis_monitoring_owner_started_at` (ownerId, startedAt, L51). `workflowId` is `integer NOT NULL` (L31); `startedAt` is `timestamp with time zone` (L33) — hence the `AT TIME ZONE 'UTC'` clamp (D-07) and the `workflowId: null` sentinel existing only in the returned JS payload (never DB). **Do not modify this file.**

---

## No Analog Found

None — all three target files have exact in-file or in-repo analogs. The only novel dependency concern is Drizzle ergonomics for `generate_series` (no built-in Drizzle helper — must be a `sql` template; RESEARCH confirmed against vendored drizzle-orm@1.0.0-rc.4) and the mock chain gap noted above, both deferrable to the planner/executor within `the agent's Discretion`.

## Metadata

**Analog search scope:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/` (analysisMonitoring.ts, helper.ts, drizzle.ts), `packages/nuxt-galaxy/src/runtime/types/nuxt-galaxy.ts`, `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analysisMonitoring.ts`, `packages/nuxt-galaxy/test/server/{utils/grizzle/analysisMonitoring.test.ts, fixtures.ts}`, `packages/nuxt-galaxy/AGENTS.md`.
**Files scanned:** 7
**Pattern extraction date:** 2026-08-10
