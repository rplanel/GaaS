<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The single source-of-truth success-rate is **`success / (success + error)`** — reliability measured among analyses that reached a definitive terminal outcome. `pending` (in-flight) and `cancelled` (abandoned) rows are excluded from the denominator. Applied identically in the counts, per-workflow, and trend paths so every query yields the same value.
- **D-02:** When `success + error = 0` (no terminal outcomes), the success-rate is **`0`**, not `null`.
- **D-03:** The formula and its edge-rule are recorded/documentated once (a single helper or constant) so all query paths reuse it — no drift.
- **D-04:** The trend helper takes **granularity as a parameter** (`'day' | 'week' | 'month'`), defaulting to `'day'`. Nothing hard-coded to one granularity.
- **D-05:** The series is **continuous and zero-filled** over the full covered UTC range — one entry per time bucket including empty buckets, so the result is chart-ready and `bucket sums = total` holds by construction.
- **D-06:** The covered range is **derived from the user's own data**: start = earliest `started_at`, end = latest `started_at`, both floored to the chosen granularity. No caller-supplied range.
- **D-07:** Bucketing is on `started_at`, in **UTC** (`date_trunc` on the UTC `withTimezone` timestamp column).
- **D-08:** Each per-workflow entry carries the **total analysis count plus the full success/error/cancelled/pending outcome breakdown, and a per-workflow success-rate** consistent with D-01/D-02.
- **D-09:** Orphaned workflow ids (rows whose snapshot `workflow_name` is NULL) collapse into a **single explicit `unknown` bucket**, represented with a sentinel `workflow_id: null` and `name: 'unknown'` (version null).
- **D-10:** Each non-orphan entry is keyed by `workflow_id` and surfaces **both `workflow_name` and `workflow_version`** from the snapshot.
- **D-11:** Phase 14 ships the **per-dimension Effect helpers** (counts, per-workflow, trend, success-rate) **and** a **composite helper** that assembles them into the full `AnalysisMonitoringStats` object Phase 15 needs.
- **D-12:** Each helper has a **separate self variant (ownerId-scoped) and admin variant (all users)**, mirroring `getAnalysisMonitoringCounts(ownerId)` / `getAllAnalysisMonitoringCounts()`.

### the agent's Discretion

Researcher/planner latitude on mechanical details that do not change the decisions above: exact Effect helper names/signatures, precise SQL (generate_series approach for the continuous series, `filter (where ...)` vs `sum(case)` for breakdowns), whether the composite runs sub-queries in parallel (Effect.all) or sequentially, `Data.TaggedError` names, and evlog annotations. The existing `AnalysisMonitoringCounts` interface (total/success/error/cancelled/pending) is the base the composite extends.

### Deferred Ideas (OUT OF SCOPE)

- **UI consumption / chart rendering of the trend series** — deferred to v2 (UIAU-01..03).
- **Hourly trend buckets** — explicitly rejected in REQUIREMENTS.md out-of-scope; granularity capped to day/week/month (D-04).
- **Materialized rollups / pre-aggregated tables** — deferred; query-layer aggregation is sufficient at current scale.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STAT-01 | Query-layer Effect helper returns per-user total + success/error/cancelled/pending outcome breakdown (existing counts preserved) | **Already satisfied** by `getAnalysisMonitoringCounts(ownerId)` / `getAllAnalysisMonitoringCounts()` (`utils/grizzle/analysisMonitoring.ts:301,318`). Must be preserved, not rewritten. This phase only adds the composite that consumes them and a shared success-rate. |
| STAT-02 | Query-layer Effect helper returns per-workflow usage (GROUP BY workflow_id) for a user, using the snapshot workflow name | New `getWorkflowUsage(ownerId)` / `getAllWorkflowUsage()` helpers: GROUP BY `workflow_id`, `filter (where ...)` outcome aggregation, `MAX(workflow_name)`/`MAX(workflow_version)` surfacing, JS post-collapse of NULL-name rows into the single `unknown` bucket (D-09/D-10). |
| STAT-03 | Query-layer Effect helper returns time-bucket trend series (date_trunc on `started_at`, UTC) for a user | New `getTrend(ownerId, granularity?)` / `getAllTrend(granularity?)` helpers: `date_trunc(gran, started_at AT TIME ZONE 'UTC')` bucketing, range derived from data (D-06), continuous zero-filled `generate_series` series (D-05), `bucket sums = total` by construction. |
| STAT-04 | A recorded success-rate definition is chosen and applied consistently | `computeSuccessRate(success, error)` single pure helper/constant (D-03): `success/(success+error)`, `0` when `success+error = 0` (D-02), reused by counts-composite, per-workflow, and trend paths (D-01). |
</phase_requirements>

# Phase 14: Stats Query Layer - Research

**Researched:** 2026-08-10
**Domain:** Drizzle ORM read aggregation + Effect-TS query helpers over the `analysis_monitoring` table
**Confidence:** HIGH

## Summary

Phase 14 is the read-only query layer for four usage-statistic dimensions against the `analysis_monitoring` table: per-user outcome counts (already built), per-workflow usage (STAT-02), a UTC time-bucket trend (STAT-03), and a single consistent success-rate (STAT-04). Every dimension ships as a **self (ownerId-scoped)** and **admin (no WHERE)** Effect pair mirroring the existing `getAnalysisMonitoringCounts(ownerId)` / `getAllAnalysisMonitoringCounts()` convention, plus one composite helper that assembles all dimensions into the `AnalysisMonitoringStats` object Phase 15's API endpoints will consume.

This is a pure query-layer phase: new read-only Effect helpers in `utils/grizzle/analysisMonitoring.ts` (+ type additions in `types/nuxt-galaxy.ts`). **No schema file, no migration, no index, no API endpoint, no UI is touched.** All external behavior is preserved (STAT-01's counts helpers are left byte-identical).

**Primary recommendation:** Build the new helpers in the same file (`utils/grizzle/analysisMonitoring.ts`) that owns the cutover. Per-workflow uses GROUP BY `workflow_id` with the already-proven `filter (where outcome = 'x')` aggregation style; trend uses `date_trunc` + a `generate_series`-backed continuous series with an `AT TIME ZONE 'UTC'` clamp; success-rate is one pure `computeSuccessRate(success, error)` helper reused everywhere (D-03). Both Drizzle functions (`date_trunc`, `generate_series`) have **no built-in Drizzle helper** — they are written as `sql` template literals exactly like the existing `selectCounts` does.

**Confidence:** HIGH — every claim grounded in the on-disk schema, the existing helper file, the test fixtures, the plain-language decisions, and the vendored Drizzle reference.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Outcome counts aggregation (STAT-01) | Database / Storage | API / Backend | `count(*) filter (where outcome=...)` runs in Postgres; Effect helper in the server wraps the single-row read. Already built. |
| Per-workflow usage (STAT-02) | Database / Storage | API / Backend | `GROUP BY workflow_id` + filtered counts in Postgres; JS collapses NULL-name rows into the `unknown` bucket. |
| Time-bucket trend (STAT-03) | Database / Storage | API / Backend | `date_trunc` bucketing + count aggregation in Postgres; JS merges/zero-fills the `generate_series` bucket list (range derived from data). |
| Success-rate (STAT-04) | API / Backend | — | Pure arithmetic (`success/(success+error)`, `0` on zero denominator) computed in the Effect helper from already-returned counts; a single shared function. |
| RLS / owner scoping | Database / Storage | — | `pgPolicy` enforces row-level security; the self helpers additionally filter `owner_id` server-side (defense in depth for Phase 16's cross-user test). |

Security boundary note: RLS (schema `analysisMonitoring.ts:55-59`) is the authority; the **self** helpers must always filter by `ownerId` in their SQL so one user can never read another's stats even if a policy were misconfigured.

## Standard Stack

No new runtime dependencies. This phase uses only dependencies already in the catalog and already used by the existing helpers.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | `1.0.0-rc.4` (`catalog:`) | `select`, `sql` template literals, `eq`/`and`, `groupBy` | Already import-gated in `analysisMonitoring.ts`; the existing `selectCounts` uses `sql<number>\`count(*) filter (where ...)\``. `date_trunc`/`generate_series` are written as `sql` templates (no built-in Drizzle helper exists). |
| effect | `^3.19.6` (`catalog:`) | `Effect.gen`, `Effect.tryPromise`, `Data.TaggedError`, `Effect.all` | Existing helper shape; DI via `yield* Drizzle`. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| blendtype | `workspace:*` | Outcome/state constants (`InvocationTerminalStates`, etc.) | Already imported in this file; not required for the new read helpers. |
| evlog | `workspace:` | `Effect.log*` annotations | Optional; existing read helpers log nothing. Follow LOGGING-SPEC §5 if adding `Effect.log*`. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `filter (where outcome = 'x')` | `sum(case when outcome='x' then 1 else 0 end)` | Both correct; `filter` is already used in `selectCounts` and is shorter — keep it. Decision at planner's discretion (both are valid). |
| Single `generate_series` + `LEFT JOIN` query | Two queries (range + bucket aggregate) + JS zero-fill merge | One-round-trip SQL keeps aggregation purely query-time but is harder to express in Drizzle and to assert with the existing single-result mock; two-query JS merge is simpler and equally correct. Recommend **generate_series single query** per CONTEXT naming, with two-query merge accepted if it simplifies testing. |

**Installation:** none — no packages added. (Dependencies already present.)

**Version verification:** Verify current published versions at execution time with `npm view drizzle-orm version` and `npm view effect version`; the catalog pins already cover them. No new install command.

## Package Legitimacy Audit

**No external packages installed by this phase.** All dependencies (`drizzle-orm`, `effect`, `blendtype`) are already in the workspace catalog and already used by the existing helpers. No Package Legitimacy Gate action required.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none added)* | — | — | — | — | — | N/A |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
            ┌────────────────────  Phase 15 API endpoints (NEXT PHASE, no code here) ────────────────────┐
            │                                                                                            │
            │   GET /api/db/analyses/monitoring (self)      GET /api/db/analyses/monitoring/admin        │
            └───────────────────────────────────┬───────────────────────────────────────────────────────┘
                                                │  call the composite helper
                                                ▼
                              ┌─────────────────────────────────────────┐
                              │  Phase 14 composite (this phase)        │
                              │  getAnalysisMonitoringStats(ownerId?)   │
                              │  extends AnalysisMonitoringCounts       │
                              │  assembles via Effect.all in parallel   │
                              └───────┬───────────────┬───────────────┬──┘
                                      │               │               │
                ┌─────────────────────▼──────────┐ ┌──▼─────────────────────┐ ┌─────────▼──────────────────┐
                │ COUNTS (STAT-01, preserved)    │ │ PER-WORKFLOW (STAT-02) │ │ TREND (STAT-03)          │
                │ getAnalysisMonitoringCounts    │ │ getWorkflowUsage(owner?)│ │ getTrend(gran, owner?)   │
                │ getAllAnalysisMonitoringCounts │ │ GROUP BY workflow_id    │ │ date_trunc(started_at,UTC)│
                └─────────────────────┬──────────┘ │ filter-where counts     │ │ generate_series → zero-fill│
                                      │            │ MAX(name/version)       │ └─────────┬──────────────────┘
                                      │            │ JS: NULL-name → unknown │          │
                                      │            └───────────┬─────────────┘          │
                                      ▼                        ▼                        ▼
                            ┌────────────────────────────────────────────────────────────────────────────┐
                            │  SHARED SUCCESS-RATE (D-03)  computeSuccessRate(success, error) → number    │
                            │  success/(success+error); 0 when success+error=0  — used by ALL paths       │
                            └────────────────────────────────────────────────────────────────────────────┘
                                                        │
                                                        ▼
                            ┌─────────────────────────────────────────────────────────────┐
                            │  DB:  galaxy.analysis_monitoring (read-only via server Drizzle) │
                            │  - idx_analysis_monitoring_owner_workflow  (owner_id, workflow_id)   │
                            │  - idx_analysis_monitoring_owner_started_at (owner_id, started_at)    │
                            │  - RLS: owner-scoped SELECT + admin is_admin() SELECT                 │
                            └─────────────────────────────────────────────────────────────┘
```

Trace of the primary use case: a Phase 15 handler calls the composite → the composite runs counts + per-workflow + trend in parallel (each self-filtered by `ownerId` or admin all-rows) → each dimension computes its per-entry success-rate through the one shared `computeSuccessRate` → the composite returns the assembled `AnalysisMonitoringStats` (backward-compatible extension of counts). No page render, no client fetch — this is server-only.

### Recommended Project Structure

All new code lives in existing files (no new dirs):

```
packages/nuxt-galaxy/src/runtime/
├── server/utils/grizzle/analysisMonitoring.ts   # ADD: computeSuccessRate, workflow-usage helpers,
│                                                #      trend helpers, composite helper, new TaggedErrors
└── types/nuxt-galaxy.ts                          # ADD: AnalysisMonitoringStats, per-workflow + trend
                                                  #      entry interfaces extending AnalysisMonitoringCounts
```

### Pattern 1: Per-Workflow Usage (STAT-02) — GROUP BY + filter aggregation + JS unknown-collapse
**What:** One `GROUP BY workflow_id` returns per-workflow totals and outcome breakdowns; JS turns NULL-name rows into a single `unknown` bucket.
**When to use:** Every per-workflow stats query (self + admin).
**Reasoning:**
- Group by `workflow_id` (an `integer NOT NULL` column) — D-10 says key by `workflow_id`; same-name/different-version workflows have different ids so they stay distinguishable automatically.
- Select `MAX(workflow_name)` / `MAX(workflow_version)` — a single `workflow_id` maps to exactly one frozen snapshot (Phase 13 D-10) so MAX is deterministic. Orphan ids (name NULL) yield `MAX = null` → flagged for the unknown bucket.
- `filter (where outcome = 'x')` counts mirror `selectCounts` exactly (see Code Examples).
- **JS post-processing:** any row whose name is `null` merges into one sentinel entry `{ workflowId: null, name: 'unknown', version: null, ...counts }`. Non-orphan rows pass through with their `workflowId`, `name`, `version`.

### Pattern 2: Trend Series (STAT-03) — date_trunc + generate_series + zero-fill
**What:** Continuous, zero-filled UTC time-bucket series whose bucket sums equal the total.
**When to use:** Any trend query (self + admin).
**Reasoning:**
- Bucket = `date_trunc(gran, started_at AT TIME ZONE 'UTC')`. The `AT TIME ZONE 'UTC'` clamp makes the result deterministic regardless of session timezone (D-07). (`started_at` is `timestamp with time zone`; bare `date_trunc` would truncate in the session tz — the clamp is required for "UTC".)
- Continuous range (D-06): floor(min(`started_at`)) → floor(max(`started_at`)) — derived from the user's own data, no caller range.
- Zero-fill (D-05): either a single `generate_series(...) LEFT JOIN (aggregate GROUP BY bucket)` producing one row per bucket including empty ones, or a range query + JS loop stepping by granularity filling zeros. Both give `bucket sums = total` because every real row lands in exactly one generated bucket and empty buckets contribute 0.
- Granularity → interval map is a fixed allowlist (`day`→`1 day`, `week`→`1 week`, `month`→`1 month`); embed safely (never concatenate caller input).

### Pattern 3: Single Success-Rate helper (STAT-04, D-01..D-03)
**What:** One pure function used by every path.
**When to use:** Counts composite, per-workflow entries, and trend points.
```
computeSuccessRate(success, error) => success === 0 && error === 0 ? 0 : success / (success + error)
```
Put it in `analysisMonitoring.ts` and import/use it from every dimension so formulas cannot drift (D-03).

### Anti-Patterns to Avoid
- **Rewriting `getAnalysisMonitoringCounts` / `getAllAnalysisMonitoringCounts`:** STAT-01 says "existing counts preserved." Leave them byte-identical; the composite calls them as-is. Rewriting risks breaking existing callers/tests.
- **Bare `date_trunc(started_at)` without `AT TIME ZONE 'UTC'`:** bucketing shifts with the session timezone and breaks D-07's "UTC" contract and cross-environment determinism.
- **Putting `workflowId: null` into the DB:** the orphan collapse is a *result-shaping* step in JS. The column is `integer NOT NULL`; the null sentinel exists only in the returned payload (D-09).
- **Embedding user-supplied granularity via string concatenation into `interval`:** only ever select the interval from the fixed `'day'|'week'|'month'` allowlist.
- **Duplicate formula literals** (`success / (success + error)` written inline in more than one helper): violates D-03 and invites drift when D-02's zero-rule is later edited.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Aggregating outcome counts | A separate count query per outcome, or client-side counting | `count(*) filter (where outcome = 'x')` in one SQL statement | One round-trip; single-row result; already the proven `selectCounts` pattern. |
| Generating a continuous time series | Manually emitting bucket rows and hoping every gap is covered | Postgres `generate_series` over the data-derived range (or a deterministic JS date-step loop over min/max) | Guarantees completeness and `bucket sums = total` without off-by-one bucket math. |
| Truncating timestamps to a bucket | JS-side date math splitting `started_at` | Postgres `date_trunc(field, ts)` | Native, UTC-clamped (with `AT TIME ZONE 'UTC'`), matches the DB type and index semantics. |
| The success-rate formula | Re-deriving the ratio in counts / workflow / trend separately | One `computeSuccessRate` helper (D-03) | Single source of truth; the zero-denominator rule (D-02) applied everywhere identically. |
| Drizzle query building | Raw SQL string concatenation for queries | Drizzle `sql` template literals + `eq`/`and`/`groupBy` | Type-checked column refs; consistency with the whole file. |

**Key insight:** The hard part of this phase is not the aggregation — it is keeping three read paths (counts, per-workflow, trend) from drifting apart on (a) the outcome-count definitions and (b) the success-rate formula. Centralize both in shared helpers and the "single consistent success-rate" acceptance criterion is satisfied by construction.

## Common Pitfalls

### Pitfall 1: Bucket sums ≠ total
**What goes wrong:** The trend's per-bucket counts don't add up to the composite total.
**Why it happens:** Range derived differently than bucketing (e.g., truncating max to `week` drops a partial trailing week; or filtering rows out in the range both ways inconsistently), or a sparse series with implicit gaps.
**How to avoid:** Derive range with the same `date_trunc` expression used for bucketing (D-06), floored both ends; include every bucket in the generated range; every row's `started_at` falls in `[floor(min), floor(max)]`. Assert `sum(trend[].total) === counts.total` in the Phase 16 tests (TEST-01/03).
**Warning signs:** A handwritten bucket loop omitting trailing/leading partial buckets; two different `date_trunc` calls in the same query.

### Pitfall 2: Timezone drift on `started_at`
**What goes wrong:** Buckets shift for users/servers in non-UTC sessions, so reported counts move across day boundaries.
**Why it happens:** `date_trunc` on a `timestamptz` truncates in the session timezone (default can be non-UTC in Postgres/Supabase).
**How to avoid:** Always `date_trunc(gran, started_at AT TIME ZONE 'UTC')` (D-07). Keep this identical across the range subquery and the bucket GROUP BY.
**Warning signs:** Trend builder relies on session tz; tests pass locally but shift in CI with a different `TZ`.

### Pitfall 3: Orphan rows splitting into many "unknown" entries
**What goes wrong:** Two deleted workflows (both name NULL) show as separate rows instead of one collapsed `unknown` bucket.
**Why it happens:** GROUP BY `workflow_id` yields one row per distinct orphan id, all with NULL names.
**How to avoid:** Post-process: merge every result row whose `workflow_name` is `null` into the single sentinel entry `{ workflowId: null, name: 'unknown', version: null }` (D-09). This is a result-shape step in JS, not SQL.
**Warning signs:** Per-workflow array contains multiple `name: null` entries.

### Pitfall 4: Zero-denominator success-rate
**What goes wrong:** `success / (success + error)` yields `Infinity`/`NaN` for an empty bucket or an only-pending/cancelled workflow.
**Why it happens:** Division by zero when `success + error = 0`.
**How to avoid:** Route every rate through `computeSuccessRate`, which returns `0` when `success + error = 0` (D-02), never null.
**Warning signs:** Any direct inline ratio outside `computeSuccessRate`.

### Pitfall 5: Breaking STAT-01 backward compatibility
**What goes wrong:** Existing callers of `getAnalysisMonitoringCounts(ownerId)` break or change shape.
**Why it happens:** Refactoring the preserved counts helpers to "clean them up."
**How to avoid:** Do not edit the two counts helpers (STAT-01 explicitly preserves them). Add new helpers alongside; the composite consumes the existing ones.
**Warning signs:** Intending to "extract a shared query builder" out of `selectCounts` — resist; `selectCounts` stays.

## Code Examples

Verified patterns (SQL expressed via Drizzle `sql` template literals, matching the existing `selectCounts` style at `utils/grizzle/analysisMonitoring.ts:283-299`; Drizzle has **no** built-in `date_trunc`/`generate_series`, so these are `sql` templates — verified against the vendored drizzle-orm@1.0.0-rc.4 source, which contains neither helper).

### 1. Shared success-rate single source (D-01..D-03)
```typescript
// utils/grizzle/analysisMonitoring.ts
/** D-01: reliability among terminal outcomes. D-02: 0 when no terminal outcomes. D-03: single source, used by every path. */
export function computeSuccessRate(success: number, error: number): number {
  return success + error === 0 ? 0 : success / (success + error)
}
```

### 2. Per-workflow usage — GROUP BY `workflow_id`, existing `filter (where ...)` aggregation shape
```typescript
// Mirrors the aggregation style of `selectCounts` (analysisMonitoring.ts:283-299):
//   count(*) filter (where ${analysisMonitoring.outcome} = 'success')  ... etc.
import { count, eq, sql } from 'drizzle-orm'
import { and } from 'drizzle-orm'
import { analysisMonitoring } from '../../db/schema/galaxy/analysisMonitoring'

function selectWorkflowUsage(ownerId?: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    const base = useDrizzle
      .select({
        workflowId: analysisMonitoring.workflowId,            // integer NOT NULL — key (D-10)
        name: sql<string | null>`max(${analysisMonitoring.workflowName})`,
        version: sql<string | null>`max(${analysisMonitoring.workflowVersion})`,
        total: sql<number>`count(*)`,
        success: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'success')`,
        error: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'error')`,
        cancelled: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'cancelled')`,
        pending: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'pending')`,
      })
      .from(analysisMonitoring)
      .groupBy(analysisMonitoring.workflowId)
    return ownerId ? base.where(eq(analysisMonitoring.ownerId, ownerId)) : base
  })
}

// JS result shaping: merge every NULL-name row into the single unknown bucket (D-09).
function shapeWorkflowUsage(rows: WorkflowUsageRow[]): AnalysisMonitoringWorkflowUsage[] {
  const out: AnalysisMonitoringWorkflowUsage[] = []
  let unknownTotal = 0, unknownSuccess = 0, unknownError = 0, unknownCancelled = 0, unknownPending = 0
  for (const r of rows) {
    if (r.name === null) {
      unknownTotal += r.total; unknownSuccess += r.success; unknownError += r.error
      unknownCancelled += r.cancelled; unknownPending += r.pending
      continue
    }
    out.push({
      workflowId: r.workflowId,
      name: r.name,
      version: r.version ?? null,
      total: r.total, success: r.success, error: r.error,
      cancelled: r.cancelled, pending: r.pending,
      successRate: computeSuccessRate(r.success, r.error),
    })
  }
  if (unknownTotal > 0 || unknownSuccess + unknownError + unknownCancelled + unknownPending > 0) {
    out.push({
      workflowId: null, name: 'unknown', version: null,
      total: unknownTotal, success: unknownSuccess, error: unknownError,
      cancelled: unknownCancelled, pending: unknownPending,
      successRate: computeSuccessRate(unknownSuccess, unknownError),
    })
  }
  return out
}

export function getWorkflowUsage(ownerId: string) {
  return Effect.gen(function* () {
    const q = yield* selectWorkflowUsage(ownerId)
    const rows = yield* Effect.tryPromise({
      try: () => q.then(r => r),
      catch: e => new GetWorkflowUsageError({ message: `Error getting workflow usage: ${e}` }),
    })
    return shapeWorkflowUsage(rows as WorkflowUsageRow[])
  })
}
export function getAllWorkflowUsage() { /* same, ownerId = undefined, WHERE length 0 */ }
```

### 3. Trend — `date_trunc` UTC + `generate_series` continuous zero-filled series
```typescript
export type TrendGranularity = 'day' | 'week' | 'month'
export const TREND_INTERVALS: Record<TrendGranularity, string> = {
  day: '1 day', week: '1 week', month: '1 month',
}

// Single source for the UTC bucket expression (D-07): AT TIME ZONE 'UTC' clamps determinism.
const utcBucket = (gran: TrendGranularity) =>
  sql<string>`date_trunc(${gran}, ${analysisMonitoring.startedAt} AT TIME ZONE 'UTC')`

function selectTrendRange(ownerId?: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    const base = useDrizzle.select({
      min: sql<Date>`min(${analysisMonitoring.startedAt})`,
      max: sql<Date>`max(${analysisMonitoring.startedAt})`,
    }).from(analysisMonitoring)
    return ownerId ? base.where(eq(analysisMonitoring.ownerId, ownerId)) : base
  })
}

function selectTrendBuckets(ownerId: string | undefined, gran: TrendGranularity) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    const bucket = utcBucket(gran)
    const base = useDrizzle
      .select({
        bucket,
        total: sql<number>`count(*)`,
        success: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'success')`,
        error: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'error')`,
        cancelled: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'cancelled')`,
        pending: sql<number>`count(*) filter (where ${analysisMonitoring.outcome} = 'pending')`,
      })
      .from(analysisMonitoring)
      .groupBy(bucket)
    return ownerId ? base.where(eq(analysisMonitoring.ownerId, ownerId)) : base
  })
}

// Merge + zero-fill so every bucket in [floor(min), floor(max)] appears (D-05, D-06).
// This is the two-query JS-step alternative; content-equivalent to a single
// generate_series LEFT JOIN. Either is acceptable at planner discretion.
export function getTrend(ownerId: string, granularity: TrendGranularity = 'day') {
  return Effect.gen(function* () {
    const [rangeQuery, bucketQuery] = yield* Effect.all([
      selectTrendRange(ownerId),
      selectTrendBuckets(ownerId, granularity),
    ])
    const range = yield* Effect.tryPromise({ try: () => rangeQuery.then(takeUniqueOrThrow), catch: e => new GetTrendError({ message: `Error getting trend range: ${e}` }) })
    const buckets = yield* Effect.tryPromise({ try: () => bucketQuery.then(r => r), catch: e => new GetTrendError({ message: `Error getting trend buckets: ${e}` }) })
    if (!range.min || !range.max) return []                                    // no data
    const byBucket = new Map<string, typeof buckets[number]>(
      (buckets as BucketRow[]).map(b => [b.bucket, b]),
    )
    const step = granularity === 'day' ? 86_400_000 : granularity === 'week' ? 604_800_000 : 0
    // (month uses calendar stepping — see Assumptions A3; day/week use ms-stepping)
    const points: AnalysisMonitoringTrendPoint[] = []
    const start = new Date(range.min)
    const end = new Date(range.max)
    // step bucket-by-bucket from start to end; fill zeros when a bucket row is absent
    return points
  })
}
export function getAllTrend(granularity: TrendGranularity = 'day') { /* ownerId = undefined */ }
```

> **Note on Drizzle `generate_series` alternative (one query, purely query-time aggregation, favored by D-05 wording):**
> ```sql
> -- Expressible via db.select().from(sql`...)` or a raw sql fragment; decision at planner discretion.
> SELECT b.bucket,
>        COALESCE(d.total, 0) AS total, COALESCE(d.success, 0) AS success, ...
> FROM generate_series(
>        date_trunc($1, (SELECT min(started_at) FROM analysis_monitoring /* owner? */)),
>        date_trunc($1, (SELECT max(started_at) FROM analysis_monitoring /* owner? */)),
>        interval '1 day'
>      ) AS b(bucket)
> LEFT JOIN (
>        SELECT date_trunc($1, started_at AT TIME ZONE 'UTC') AS bucket,
>               count(*) total, count(*) filter (where outcome='success') success, ...
>        FROM analysis_monitoring /* owner? */
>        GROUP BY 1
>      ) d ON d.bucket = b.bucket
> ```

### 4. Composite helper (D-11) — parallel assembly
```typescript
export interface AnalysisMonitoringStats extends AnalysisMonitoringCounts {
  perWorkflow: AnalysisMonitoringWorkflowUsage[]
  trend: AnalysisMonitoringTrendPoint[]
  successRate: number                                // overall, from the counts via computeSuccessRate
}

export function getAnalysisMonitoringStats(ownerId: string) {
  return Effect.gen(function* () {
    const [counts, perWorkflow, trend] = yield* Effect.all([
      getAnalysisMonitoringCounts(ownerId),
      getWorkflowUsage(ownerId),
      getTrend(ownerId),
    ])
    return {
      ...counts,
      successRate: computeSuccessRate(counts.success, counts.error),
      perWorkflow,
      trend,
    }
  })
}
export function getAllAnalysisMonitoringStats() { /* admin variants, no ownerId */ }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Aggregate per-read, no durable snapshot (workflow stats broke after deletion) | Snapshot columns (`workflow_name`, `galaxy_workflow_id`, `workflow_version`) populate at write (Phase 12/13) and are read here | Phase 12/13 (prior) | Per-workflow and trend stats survive workflow deletion — this phase reads that durable contract. |
| Outcome rate undefined / per-query formula drift | Single `computeSuccessRate` = `success/(success+error)`, `0` on zero denominator, used across counts/workflow/trend | This phase (D-01..D-03) | Every query path yields the identical success-rate by construction. |
| One granularity baked into schema | Granularity is a query-time helper parameter (`'day'\|'week'\|'month'`, default day) | This phase (D-04) | Aggregation is a query concern; no schema/permanent commitment; chart-ready continuous series (D-05). |

**Deprecated/outdated:**
- None for this phase — it introduces new read helpers while preserving the existing counts helpers verbatim.

## Assumptions Log

> All listed claims are mechanical details left to the planner/executor to confirm. None alter the locked decisions.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Drizzle `groupBy` accepts a `sql` template fragment used in both `select` and `groupBy` (`bucket`). | Code Examples | If Drizzle requires grouping by the full expression string, uses an alias or duplicates the literal — small refactor, no behavior change. |
| A2 | `count(*) filter (where outcome = 'x')` returns a number that Drizzle surfaces as `sql<number>`. | Code Examples | Already proven in `selectCounts`; the per-workflow/trend variants reuse the identical expression style. |
| A3 | Month-level trend zero-filling is best done with Postgres `generate_series(start, finish, interval '1 month')` (calendar-aware) rather than JS ms-stepping (ms-stepping drifts on variable-length months). | Code Examples | If the executor uses JS ms-stepping for `month`, bucket boundaries drift; prefer the SQL `generate_series` or explicit calendar stepping. |
| A4 | `date_trunc($1, col AT TIME ZONE 'UTC')` accepts the granularity as a bound text parameter. | Code Examples | Postgres accepts a text parameter for `date_trunc`'s field; if the driver binds it as text successfully this holds. Fallback: inline the allowlisted literal. |
| A5 | The composite exposes an overall `successRate` field. | Code Examples | Additive, so it cannot break Phase 15; if the planner prefers not to expose it, the field is simply omitted. Low risk. |
| A6 | The `unknown` bucket appears in the array even when zero (currently gated on any nonzero total). | Code Examples | Phase 12/15 haven't fixed whether a zero-count `unknown` renders; irrelevant to correctness, purely cosmetic. |

## Open Questions (RESOLVED)

1. **Trend series: single `generate_series LEFT JOIN` SQL vs two-query + JS zero-fill merge?**
   - What we know: both satisfy D-05/D-06 and produce `bucket sums = total`. CONTEXT names `generate_series`; the single-query form keeps aggregation purely query-time (matching the user's "aggregation is a query-time concern" emphasis).
   - What's unclear: Drizzle ergonomics of a `generate_series`-backed FROM + LEFT JOIN subquery, and how to assert it with the existing single-result `createMockDrizzle` fixture.
   - Recommendation: Default to the **`generate_series` single query**; fall back to two-query+JS if it proves unwieldy in Drizzle or hard to unit-test. Both are within `the agent's Discretion`.
   - **RESOLVED:** Committed to the **two-query + JS zero-fill merge** (`selectTrendRange` + `selectTrendBuckets` run together via `Effect.all`, canonical-UTC-key merge) — 14-02-PLAN Task 1. The `generate_series` LEFT JOIN subquery was compared and dropped: the range-floor (`min`/`max`) must feed the bucket range, which is cleaner as a separate range query, and it aligns with the existing single-result chainable `createMockDrizzle` fixture semantics. To make the multi-query trend test executable, `createMockDrizzle` in `fixtures.ts` gains a result-sequencing queue (`enqueueResult`) popped per `.select()` call (see 14-02-PLAN.md Task 1).

2. **Should the composite expose an overall `successRate` beyond the per-entry ones?**
   - What we know: STAT-04 is a *consistent formula*, not necessarily a new top-level field; D-08 only mandates per-workflow rate.
   - Recommendation: Add it as an additive field on `AnalysisMonitoringStats` (cheap, useful to Phase 15); it cannot break backward compatibility. Flag to confirm-phase if wanting to omit.
   - **RESOLVED:** Added — `AnalysisMonitoringStats` carries an overall `successRate` computed via `computeSuccessRate(counts.success, counts.error)` (14-03-PLAN Task 1), additive over `AnalysisMonitoringCounts`, routed through the same single formula so STAT-04 parity holds across all paths.

3. **Month-level continuous series boundary handling (A3)?**
   - What we know: weeks/days are fixed ms multiples; months are variable length.
   - Recommendation: Use Postgres `generate_series(..., interval '1 month')` for correctness, or explicit calendar stepping in JS. Confirm the executor uses calendar-aware stepping for `month`.
   - **RESOLVED:** Chose **calendar-aware JS month stepping** in the zero-fill merge — advance month-of-year wrapping year, staying on the 1st, never a fixed 30/31-day ms value (14-02-PLAN Task 1, MUST-HAVE "month stepping is calendar-aware", T-14-07). Verified by Test 4 (month span 2026-01-15 → 2026-03-10 yields buckets 2026-01/02/03 with no fixed-ms drift).

## Environment Availability

This phase is code/config-only: it adds TypeScript helpers that run against the existing server Drizzle connection. It introduces **no** external tools, services, runtimes, or CLI utilities beyond what the repo already uses.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| drizzle-orm | new query helpers | ✓ (catalog) | `1.0.0-rc.4` | — |
| effect | Effect helpers / DI | ✓ (catalog) | `^3.19.6` | — |
| Node.js | compile/test | ✓ | v20+ (AGENTS) | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

Step 2.6 classification: **no external dependency gaps** — no availability blockers.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` — this section is required so a VALIDATION.md can be created.

### Validation Strategy Overview

Query-layer validation focuses on **aggregation correctness** (counts sum to totals, unknown bucket collapse, success-rate consistency) and **self/admin scoping** (a user only ever sees their own rows). This is a read-only layer with no schema, migration, or API surface in this phase, so validation is unit-level against a mock Drizzle result set that mirrors real SQL output shapes.

### Validation Dimensions

| Dimension | Method | Tooling | Reference Data / Source |
|-----------|--------|---------|-------------------------|
| Aggregation SQL correctness (per-workflow, trend, outcome counts) | Unit tests asserting the returned arrays/objects against crafted mock row sets | Vitest + `createMockDrizzle` (`test/server/fixtures.ts`) | The on-disk column/outcome definitions (`analysisMonitoring.ts:18-23`, `:25-45`) and the existing `getAnalysisMonitoringCounts` test (`test/server/utils/grizzle/analysisMonitoring.test.ts:298-319`) |
| `bucket sums = total` invariant (STAT-03/D-05/D-06) | Unit assert: `sum(trend[].total) === counts.total`; also assert continuous coverage (no gaps) | Vitest | Mock data spanning multiple buckets incl. an empty middle bucket |
| Unknown-bucket orphan collapse (STAT-02/D-09) | Unit test with rows where `workflowName` is `null` (multiple orphan ids) → exactly one `{ workflowId: null, name: 'unknown' }` entry, counts summed | Vitest | Phase 12 D-05 NULL=unknown semantics; mock rows with NULL `workflow_name` |
| Version surfacing (D-10) | Unit test that each non-orphan entry exposes `workflowId`, `name`, `version`; two same-name/different-version ids stay distinct | Vitest | Phase 12 D-01 rationale; schema `workflow_version` column |
| Success-rate consistency (STAT-04/D-01..D-03) | Unit test `computeSuccessRate` directly (normal, zero-denominator → 0) + assert per-workflow, trend, and composite all call it (formula parity) | Vitest | D-01/D-02/D-03; single shared helper |
| Self vs admin scoping (D-12) | Unit assert the self query emits an `owner_id` WHERE and admin emits none (mirror existing `getAllAnalysisMonitoringCounts` no-WHERE test, `analysisMonitoring.test.ts:517-536`) | Vitest | Existing self/admin parity convention |
| RLS cross-user isolation | *Deferred to Phase 16* (TEST-03) — this phase only guarantees the self helper always filters `ownerId` in SQL | Phase 16 (integration) | RLS policies in `analysisMonitoring.ts:55-64` |

### Primary Validation Tooling
- **Framework:** Vitest (`^4.1.0`, catalog:testing)
- **Test file:** extend `packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts`
- **Mocking:** `createMockDrizzle` / `createMockDrizzleResult` from `test/server/fixtures.ts` (already used by the counts tests) — assert on the query-builder call graph (e.g. WHERE `eq(ownerId)` present/absent).
- **Commands:** from repo root `pnpm --filter ./packages/nuxt-galaxy test`; per-file `pnpm --filter ./packages/nuxt-galaxy vitest run test/server/utils/grizzle/analysisMonitoring.test.ts`.

### Wave 0 Gaps (to be planned)
- [ ] New unit tests in `test/server/utils/grizzle/analysisMonitoring.test.ts` covering the five new helpers (`computeSuccessRate`, `getWorkflowUsage`, `getAllWorkflowUsage`, `getTrend`, `getAllTrend`, `getAnalysisMonitoringStats`, `getAllAnalysisMonitoringStats`).
- [ ] Possibly extend `test/server/fixtures.ts` `chainMethods` if a new method (e.g. a `sql`-FROM subquery for `generate_series`) is not yet in the mock chain.

### Sampling Rate
- **Per task commit:** run the grizzle analysisMonitoring test file.
- **Per wave merge / phase gate:** `pnpm --filter ./packages/nuxt-galaxy test` + root `pnpm lint` + `pnpm typecheck` green before `/gsd-verify-work`.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Not touched — no auth changes (session-derived ownerId is Phase 15 / API-03). |
| V3 Session Management | no | Not touched in this phase. |
| V4 Access Control | yes | Self helpers ALWAYS filter `owner_id` server-side (defense in depth beyond RLS); admin variants rely on the existing RLS admin SELECT policy (`is_admin()`). The composite is invoked only server-side. |
| V5 Input Validation | yes | Trend `granularity` is a closed allowlist (`'day'\|'week'\|'month'`); never interpolate caller input into SQL. Drizzle `sql` template fragments use allowlisted interval strings only. |
| V6 Cryptography | no | No secrets, tokens, or keys touched (query layer only). |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via granularity/interval | Injection | Fixed `'day'\|'week'\|'month'` allowlist (D-04); no string concatenation of caller input; Drizzle `sql` templates + bound column refs. |
| Cross-tenant data leak (user reads another's stats) | Information Disclosure | RLS (`analysisMonitoring.ts:55-59`) as authority + self helpers always `WHERE owner_id = ?` server-side. Phase 16 (TEST-03) proves it. |
| Logging PII/secrets | Information Disclosure | No new logging required; if `Effect.log*` added, follow LOGGING-SPEC "never log secrets" and avoid echoing owner_id/names at error level unnecessarily. |

## Sources

### Primary (HIGH confidence) — read this session
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analysisMonitoring.ts:18-23` — verbatim: `monitoringOutcome` enum `['pending','success','error','cancelled']`; columns `workflowId`, `startedAt` (`timestamp with time zone`), snapshot `workflowName`/`galaxyWorkflowId`/`workflowVersion`; indexes `idx_analysis_monitoring_owner_workflow` (`ownerId, workflowId`), `idx_analysis_monitoring_owner_started_at` (`ownerId, startedAt`); RLS owner+admin SELECT policies.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts:283-333` — verbatim: `selectCounts` `filter (where outcome = 'x')` aggregation; `getAnalysisMonitoringCounts(ownerId)` / `getAllAnalysisMonitoringCounts()` self/admin pattern using `takeUniqueOrThrow` + `GetAnalysisMonitoringCountsError`.
- `packages/nuxt-galaxy/src/runtime/types/nuxt-galaxy.ts:112-118` — verbatim: `AnalysisMonitoringCounts { total: number; success: number; error: number; cancelled: number; pending: number }` (the composite base).
- `packages/nuxt-galaxy/AGENTS.md` — Effect/DI, migration rules, server-only Drizzle; `pnpm-workspace.yaml` catalog versions (`drizzle-orm 1.0.0-rc.4`, `effect ^3.19.6`).
- `.planning/LOGGING-SPEC.md:113-128` — Effect programs use `Effect.log*`; run through `runGalaxyEffect`/`runTaskEffect`.
- Vendored `drizzle-orm@1.0.0-rc.4` reference — confirmed **no** built-in `date_trunc` or `generate_series` helper (both expressed as `sql` templates).

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` §"Stats Query Layer" (STAT-01..04) and §API-01..04.
- `.planning/ROADMAP.md` §"Phase 14" success criteria.
- `.planning/phases/12-schema-survival-columns/12-CONTEXT.md` (D-01 version-first-class, D-05 NULL=unknown, D-07 per-column backfill).
- `.planning/phases/13-write-path-integrity/13-CONTEXT.md` (D-10 snapshot frozen at write; outcome values pending/cancelled/success/error).

### Tertiary (LOW confidence)
- Postgres `date_trunc`/`generate_series`/`timestamptz AT TIME ZONE` semantics — from training knowledge, [ASSUMED] correctness, flagged under A3/A4 for executor confirmation against the actual Postgres/Supabase version.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; existing catalog pins verified from `pnpm-workspace.yaml`.
- Architecture: HIGH — helper patterns mirror the on-disk `selectCounts`/counts-helper code read this session.
- Pitfalls: HIGH — grounded in the schema types (timestamptz, integer NOT NULL workflow_id) and the existing preserved-test expectations; only SQL-shape specifics (A1/A3/A4) are MEDIUM.

**Research date:** 2026-08-10
**Valid until:** 2026-09-09 (stable dependencies; pre-release `drizzle-orm` tracked via catalog, re-verify `npm view` if the catalog bumps)
