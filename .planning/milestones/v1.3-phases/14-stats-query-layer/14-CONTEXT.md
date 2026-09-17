# Phase 14: Stats Query Layer - Context

**Gathered:** 2026-08-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver typed, server-side Effect helpers that compute the four usage-statistic dimensions for the `analysis_monitoring` durable survival record: per-user outcome counts (STAT-01), per-workflow usage (STAT-02), a UTC time-bucket trend series (STAT-03), and a single consistent success-rate (STAT-04). Each dimension exposes a self (one user) and an admin (all users) variant, plus a composite helper that assembles all dimensions into the `AnalysisMonitoringStats` shape Phase 15's API endpoints consume. This phase is query-layer only — pure reads against `analysis_monitoring`; no API endpoints (Phase 15), no UI, no new table, no new write path, no new migration.

**In scope:** new read-only Effect query helpers (per-dimension self+admin + composite); a documented, single success-rate definition applied across every path.
**Out of scope:** API endpoints (Phase 15), tests/quality gates (Phase 16), the UI (v2), adding columns or indexes, changing the write path.

</domain>

<decisions>
## Implementation Decisions

### Success-Rate Formula (STAT-04)
- **D-01:** The single source-of-truth success-rate is **`success / (success + error)`** — reliability measured among analyses that reached a definitive terminal outcome. `pending` (in-flight) and `cancelled` (abandoned) rows are excluded from the denominator. Applied identically in the counts, per-workflow, and trend paths so every query yields the same value. — **Reversibility:** costly — changing the formula later would alter published stats after they exist.
- **D-02:** When `success + error = 0` (no terminal outcomes — e.g. an empty trend bucket or a workflow with only pending/cancelled rows), the success-rate is **`0`**, not `null`. This guarantees a valid number in every row/bucket and avoids null-handling in Phase 15 serialization. — **Reversibility:** reversible.
- **D-03:** The formula and its edge-rule are recorded/documentated once (a single helper or constant) so all query paths reuse it — the composite and every per-dimension path must not drift.

### Trend Series (STAT-03)
- **D-04:** The trend helper takes **granularity as a parameter** (`'day' | 'week' | 'month'`), defaulting to `'day'`. Nothing is hard-coded to one granularity; the caller (Phase 15 API) chooses at build time. Aggregation is a query-time concern, not a schema/permanent decision.
- **D-05:** The series is **continuous and zero-filled** over the full covered UTC range — one entry per time bucket including buckets with zero rows — so the result is chart-ready and `bucket sums = total` holds by construction. — **Reversibility:** reversible (payload shape, not a contract on raw data).
- **D-06:** The covered range is **derived from the user's own data**: start = earliest `started_at`, end = latest `started_at`, both floored to the chosen granularity. No caller-supplied range, no risk of truncating data outside the window (guarantees the sums-equal-total invariant). — **Reversibility:** reversible.
- **D-07:** Bucketing is on `started_at`, in **UTC** (`date_trunc` on the UTC `withTimezone` timestamp column), per STAT-03.

### Per-Workflow Usage (STAT-02)
- **D-08:** Each per-workflow entry carries the **total analysis count plus the full success/error/cancelled/pending outcome breakdown, and a per-workflow success-rate** consistent with D-01/D-02. Richer payload lets Phase 15 expose per-workflow reliability without extra queries. — **Reversibility:** reversible.
- **D-09:** Orphaned workflow ids (rows whose snapshot `workflow_name` is NULL — the workflow was deleted before capture) collapse into a **single explicit `unknown` bucket** in the per-workflow array, represented with a sentinel `workflow_id: null` and `name: 'unknown'` (version null). Consistent with Phase 12 D-05's NULL=unknown semantics and STAT-02's "explicit unknown bucket". — **Reversibility:** reversible.
- **D-10:** Each non-orphan entry is keyed by `workflow_id` and surfaces **both `workflow_name` and `workflow_version`** from the snapshot, preserving the first-class version distinction (Phase 12 D-01 — same-name/different-version workflows stay distinguishable) when present.

### Helper Shape & Self/Admin Parity
- **D-11:** Phase 14 ships the **per-dimension Effect helpers** (counts, per-workflow, trend, success-rate) **and** a **composite helper** that assembles them into the full `AnalysisMonitoringStats` object Phase 15 needs. Phase 15 endpoints call the composite; individual helpers stay independently reusable and testable. — **Reversibility:** reversible.
- **D-12:** Each helper has a **separate self variant (ownerId-scoped) and admin variant (all users)**, mirroring the existing `getAnalysisMonitoringCounts(ownerId)` / `getAllAnalysisMonitoringCounts()` convention already in `analysisMonitoring.ts` (e.g. `getWorkflowUsage(ownerId)` / `getAllWorkflowUsage()`).

### the agent's Discretion
Researcher/planner latitude on mechanical details that do not change the decisions above: exact Effect helper names/signatures, precise SQL (generate_series approach for the continuous series, `filter (where ...)` vs `sum(case)` for breakdowns), whether the composite runs sub-queries in parallel (Effect.all) or sequentially, `Data.TaggedError` names, and evlog annotations. The existing `AnalysisMonitoringCounts` interface (total/success/error/cancelled/pending) is the base the composite extends.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stats Query Layer requirements
- `.planning/REQUIREMENTS.md` §"Stats Query Layer" — STAT-01 (counts preserved), STAT-02 (per-workflow + unknown bucket), STAT-03 (UTC trend on started_at), STAT-04 (single success-rate).
- `.planning/REQUIREMENTS.md` §"Out of Scope" — hourly buckets rejected; materialized rollups rejected (query-layer aggregation is sufficient).

### Roadmap & prior-phase contract
- `.planning/ROADMAP.md` §"Phase 14: Stats Query Layer" — goal, success criteria (bucket sums = total; unknown bucket; consistent success-rate), depends-on Phase 12.
- `.planning/phases/12-schema-survival-columns/12-CONTEXT.md` — the snapshot-column contract this phase reads: NULL=unknown bucket (D-05), version-first-class (D-01), column semantics/lengths. **MUST read** before planning.
- `.planning/phases/13-write-path-integrity/13-CONTEXT.md` — confirm snapshot is frozen at write (D-10) and what the `pending`/`cancelled`/`success`/`error` outcome values mean from the write path.

### Existing schema & query patterns (codebase)
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analysisMonitoring.ts` — the table queried: `owner_id`, `workflow_id`, `started_at`, `outcome`, and the three snapshot columns (`workflow_name`, `galaxy_workflow_id`, `workflow_version`); the two composite indexes `idx_analysis_monitoring_owner_workflow` and `idx_analysis_monitoring_owner_started_at` that serve the per-workflow and trend queries.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts` — existing `getAnalysisMonitoringCounts(ownerId)` / `getAllAnalysisMonitoringCounts()` (STAT-01 already satisfied; preserve — do not rewrite); `selectCounts` `filter (where ...)` aggregation pattern to mirror; `data.TaggedError` conventions.
- `packages/nuxt-galaxy/src/runtime/types/nuxt-galaxy.ts` — `AnalysisMonitoringCounts` interface (total/success/error/cancelled/pending) — the base the composite `AnalysisMonitoringStats` extends.
- `packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts` and `test/server/db/schema/galaxy/analysisMonitoring.test.ts` — existing test patterns for the query/schema assertions (Phase 16 builds on these; Phase 14 plans should anticipate them).

### Module conventions
- `packages/nuxt-galaxy/AGENTS.md` — Effect/DI patterns, `Data.TaggedError` + `Effect.tryPromise`, no new migration in this phase.
- `.planning/LOGGING-SPEC.md` — evlog conventions for Effect programs (`Effect.logInfo`/`Effect.logError`) and the "never log secrets" rule; no new logs cross secret boundaries.
- No external specs beyond the above — all requirements and conventions are captured here and in the referenced files.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getAnalysisMonitoringCounts(ownerId)` / `getAllAnalysisMonitoringCounts()` (`utils/grizzle/analysisMonitoring.ts:301,318`): already satisfy STAT-01; their self/admin split and `selectCounts` filter-aggregation shape are the template for the new per-workflow/trend/composite helpers.
- `analysisMonitoring` Drizzle table (`schema/galaxy/analysisMonitoring.ts`): exposes `workflow_id`, `workflow_name`, `workflow_version`, `started_at`, `outcome`; the `idx_analysis_monitoring_owner_workflow` and `idx_analysis_monitoring_owner_started_at` indexes back the per-workflow and trend GROUP BYs.
- `AnalysisMonitoringCounts` interface (`types/nuxt-galaxy.ts:112`): `{ total, success, error, cancelled, pending }` — the composite `AnalysisMonitoringStats` extends this.

### Established Patterns
- Effect.gen + Drizzle + `Effect.tryPromise` + `Data.TaggedError` for read helpers; `takeUniqueOrThrow` for single-row reads.
- Self = `where(eq(ownerId))`, admin = no where clause — the existing counts helpers are the canonical example of the parity the new helpers must mirror.
- `filter (where ${col} = 'x')` SQL for multi-count single-row aggregation (already in `selectCounts`) — reuse for per-workflow/per-bucket outcome breakdowns.

### Integration Points
- New helpers live in `utils/grizzle/analysisMonitoring.ts` alongside the existing counts helpers (same file, same conventions).
- The composite `AnalysisMonitoringStats` helper is the seam Phase 15's API handlers call; its shape must be the object the endpoints return (backward-compatible extension of `AnalysisMonitoringCounts`).
- No DB access via client — all read-only server Effect helpers; RLS remains the security boundary (Phase 16 tests prove one user cannot read another's stats, so the self helpers must always filter by `ownerId` server-side).

</code_context>

<specifics>
## Specific Ideas

- The user emphasized granularity is **not a permanent decision** — `analysis_monitoring` stores raw rows and we aggregate however we want at query time; hence granularity is a helper parameter (D-04), not a schema choice.
- The user accepted a **continuous, chart-ready** trend series (D-05) and an **explicit, single collapsed `unknown` bucket** for orphans (D-09), consistent with the Phase 12 NULL=unknown contract.
- The user kept **version first-class** in the per-workflow result (D-10), carrying forward the Phase 12 D-01 rationale.

</specifics>

<deferred>
## Deferred Ideas

- **UI consumption / chart rendering of the trend series** — the continuous series shape was chosen partly to be chart-ready, but the UI itself is deferred to v2 (UIAU-01..03).
- **Hourly trend buckets** — explicitly rejected in REQUIREMENTS.md out-of-scope; granularity parameter is capped to day/week/month (D-04).
- **Materialized rollups / pre-aggregated tables** — deferred; query-layer aggregation is sufficient at current scale (REQUIREMENTS.md out-of-scope).

None else — discussion stayed within phase scope. No todos were folded or reviewed for this phase.

</deferred>

---

*Phase: 14-Stats Query Layer*
*Context gathered: 2026-08-10*
