# Architecture Research — Per-User Analysis Usage Statistics (v1.3)

**Domain:** Server-side, deletion-surviving per-user usage statistics for a Galaxy analysis sync engine
**Researched:** 2026-08-10
**Mode:** Project research (architecture integration)
**Confidence:** HIGH (based on reading current source, not inference)

## Executive Finding

**The durable survival record already exists.** The `galaxy.analysis_monitoring` table
(`packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analysisMonitoring.ts`) is, today,
already a per-analysis stats record that (a) is written on persist inside the `insertAnalysis`
transaction, (b) survives `analyses` row deletion via `analysis_id ... onDelete: 'set null'`, and
(c) is updated on terminal-state reconciliation by the scheduled sync task. It also already has
self-scoped + `galaxy_rbac.is_admin()` RLS and two server endpoints (self + admin) returning
outcome counts.

**The genuine v1.3 delta is therefore small and additive:** two missing aggregation dimensions
(per-workflow usage, time-bucket trend), one durability gap (workflow name is not snapshotted, so a
per-workflow join would break if the `workflows` row is deleted), supporting indexes, and endpoint
enrichment. **Do NOT create a new table** — that would duplicate the survival record and fork the
write paths.

---

## System Overview

```text
                              Nuxt / Nitro (nuxt-galaxy server runtime)
┌────────────────────────────────────────────────────────────────────────────────┐
│  API handlers  runtime/server/api/db/analyses/                                  │
│   analyses.post.ts        (persist → creates analysis_monitoring row)  ★ extend │
│   [analysisId].delete.ts  (deletes analyses; monitoring survives set-null)     │
│   monitoring.get.ts       (self counts)                     ★ enrich → stats    │
│   monitoring/admin.get.ts (admin counts + admin-role check) ★ enrich → stats    │
└───────────────┬───────────────────────────────────────────────────────────────┘
                │ Effect programs (runGalaxyEffect)
                ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│  Grizzle Effect service layer  runtime/server/utils/grizzle/                    │
│   analyses.ts          insertAnalysis (tx: analyses + analysis_monitoring) ★ext │
│   analysisMonitoring.ts counts query        ★ ADD byWorkflow + trend (+admin)   │
│   sync/analysis.ts     updateAnalysisMonitoringOutcome (terminal, in task)      │
└───────┬───────────────────────────────┬────────────────────────────────────────┘
        │ Drizzle (server, RLS-bypassing)│ service-role Supabase client (sync task)
        ▼                               ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│  Data  PostgreSQL / Supabase  schema galaxy_                                   │
│   analysis_monitoring  ← THE durable survival record; no new table              │
│   analyses             (monitoring.analysis_id → analyses.id ON DELETE SET NULL)│
│   workflows            (denormalize name onto monitoring — do NOT rely on join) │
└────────────────────────────────────────────────────────────────────────────────┘

  Nitro scheduled task galaxy:sync-analyses (sole terminal-state mutator)
   → syncAnalysisEffect → updateAnalysisMonitoringOutcome   [unchanged]
```

### Component Boundaries (new vs modified vs unchanged)

| Component | Responsibility | Change |
|-----------|----------------|--------|
| `analysis_monitoring` table | Durable per-analysis survival record (owner, workflow, outcome, time, galaxy ref) | **Modify** — add `workflow_name` + `galaxy_workflow_id` snapshot columns + 2 indexes |
| `insertAnalysis` (`grizzle/analyses.ts`) | Persist write path: creates `analyses` + `analysis_monitoring` in one tx | **Modify** — snapshot workflow name/id onto the monitoring row |
| `runAnalysis` (`grizzle/analyses.ts`) / `analyses.post.ts` | Orchestrates persist; already holds the resolved `workflow` | **Modify** — thread `workflowName`/`galaxyWorkflowId` into `insertAnalysis` |
| `syncAnalysisEffect` (`grizzle/sync/analysis.ts`) | Terminal-state reconciliation → updates monitoring outcome | **Unchanged** — already the sole writer of final outcome |
| `analysisMonitoring.ts` grizzle helper | Query layer: counts | **Modify** — add `byWorkflow` + `trend` Effect functions (+ admin variants) |
| `monitoring.get.ts` / `monitoring/admin.get.ts` | Server endpoints (self / admin) | **Modify** — enrich response to composite stats |
| `nuxt-galaxy.ts` (types) | Response type contracts | **Modify** — add `/workflow` + `/trend` types + composite |
| `module.ts` | Handler registration | **Unchanged** (enriching existing routes, no new routes) |
| RBAC / RLS | Access control | **Unchanged** — existing self + `is_admin()` policies suffice; reads go through Drizzle |

---

## Recommended Integration Design

### 1. Schema: extend `analysis_monitoring` (no new table)

Add, to `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analysisMonitoring.ts`:

```ts
workflowName: varchar('workflow_name', { length: 256 }),   // snapshot, nullable for backfill
galaxyWorkflowId: varchar('galaxy_workflow_id', { length: 256 }), // durable galaxy ref
// table indexes:
index('idx_analysis_monitoring_owner_workflow').on(table.ownerId, table.workflowId),
index('idx_analysis_monitoring_owner_started').on(table.ownerId, table.startedAt),
```

**Why denormalize `workflow_name` instead of joining `workflows`?** Per-workflow usage must survive
*workflow* deletion too (consistent with the milestone's deletion-survival philosophy). A live join
to `workflows` would null out the name once that row is gone. Snapshotting the display name at
persist makes the per-workflow dimension durable and independent. `workflow_id` stays as the
grouping key; `galaxy_workflow_id` keeps the Galaxy reference.

**Backfill:** existing `analysis_monitoring` rows lack the snapshot columns. Add a one-time
UPDATE…FROM join against `workflows` (in the same migration) so history is not empty, then the
columns become write-once.

**Alterations require a migration** via `pnpm drizzle:generate` (never hand-edit
`supabase/migrations/`) and then `pnpm supabase:generate:types` to refresh
`runtime/types/database.ts` (protected file, CLI-generated).

### 2. Write path: extend persist, keep the task as sole terminal-state mutator

The milestone asks to preserve *"the scheduled task is the sole sync-state mutator"*. Note the
distinction clearly:

- **Persist creation** (MONITORING row with `outcome='pending'`) is *not* sync-state mutation — it
  is record creation at analysis persist. This already happens today inside `insertAnalysis`'
  transaction. Extend it (in the *same transaction, same place*) to also write
  `workflowName`/`galaxyWorkflowId`.
- **Terminal outcome write** stays **only** in `syncAnalysisEffect` →
  `updateAnalysisMonitoringOutcome`, inside the scheduled task. **Do not** add a terminal-outcome
  write to any request handler or to the on-demand `POST /:id/sync` (which must keep *enqueueing*
  the task via `runTask`, never writing outcome directly).

Thread the workflow snapshot from `analyses.post.ts` (which already resolves `workflow` via
`getWorkflowEffect`) → `runAnalysis(...)` → `insertAnalysis(analysis, { workflowName, galaxyWorkflowId })`.

### 3. Query layer: additive Effect functions (follow the existing `selectCounts` pattern)

All server aggregation reads go through **Drizzle** (server-side, RLS-bypassing), scoped by
`ownerId` in the query, with admin variants that omit the owner filter. Add to
`grizzle/analysisMonitoring.ts`, mirroring `getAnalysisMonitoringCounts`:

```ts
export function getAnalysisMonitoringByWorkflow(ownerId: string)            // group by workflow_id, name
export function getAnalysisMonitoringTrend(ownerId: string, params: TrendParams)
export function getAllAnalysisMonitoringByWorkflow()                        // admin
export function getAllAnalysisMonitoringTrend(params: TrendParams)          // admin
```

- **By workflow:** `SELECT workflow_id, max(workflow_name), count(*) total,
  count(*) filter (where outcome='success') …, … GROUP BY workflow_id ORDER BY total DESC`
- **Trend:** group by `date_trunc(bucket, started_at)` over a bounded window. Because
  `started_at` (creation time) is stable and rows survive deletion, it is the correct trend axis —
  not `completed_at` (null until terminal, and never the "when the user started" signal you want
  in usage analysis). Require a `bucket` (`day|week|month`) + `start`/`end` range to bound payload.
- Wrap each in `Effect.tryPromise` with a domain `Data.TaggedError` (existing convention:
  `GetAnalysisMonitoringCountsError` etc.), and expose only the Effect form (`*Effect` name or the
  same naming already in this module — the module already uses the Effect-only style).

### 4. Types (`runtime/types/nuxt-galaxy.ts`)

```ts
export interface AnalysisMonitoringByWorkflow {
  workflowId: number
  workflowName: string | null
  total: number; success: number; error: number; cancelled: number; pending: number
}
export interface AnalysisMonitoringTrendPoint {
  bucket: string            // ISO date of the truncated bucket
  total: number; success: number; error: number; cancelled: number; pending: number
}
export interface AnalysisMonitoringStats extends AnalysisMonitoringCounts {
  byWorkflow: AnalysisMonitoringByWorkflow[]
  trend: AnalysisMonitoringTrendPoint[]
}
```

### 5. Endpoints: enrich the existing self/admin pair (additive, backward-compatible)

Keep the two existing routes (`/api/db/analyses/monitoring`, `/api/db/analyses/monitoring/admin`)
and change their response to `AnalysisMonitoringStats`. Because `AnalysisMonitoringStats`
**extends** `AnalysisMonitoringCounts` (total/success/error/cancelled/pending stay top-level), any
existing consumer reading count fields keeps working; we only add `byWorkflow` and `trend`.

- **Self:** `monitoring.get.ts` — after the auth check, call `getAnalysisMonitoringByWorkflow(id)`
  + `getAnalysisMonitoringTrend(id, params)` and merge with existing counts.
- **Admin:** `monitoring/admin.get.ts` — reuse the existing `userRoles`+`roles` admin check, then
  call the `getAll*` variants.
- Refactor: extract the duplicated admin-role verification from `admin.get.ts` into a reusable
  Effect helper (e.g. `requireAdminRole(userId)` in `grizzle/supabase.ts` or a small
  `grizzle/adminRole.ts`) and reuse it — do not copy it a third time. Also factor the shared
  `Effect.provide(...)`/`Either.match` error→HTTP mapping into a helper if it grows.

No `module.ts` change is needed because we are not adding routes.

### 6. RLS

**No new RLS is required** for the new aggregation reads: the server query layer runs through
Drizzle (bypassing RLS) and enforces scoping in code. The existing `analysis_monitoring` policies
already cover (a) owner `select` and (b) admin `select` via `galaxy_rbac.is_admin()`. They remain
as defense-in-depth for any accidental PostgREST/Supabase direct reads. Since we add **no new
table**, there is no new RLS to author. If the team prefers the admin global endpoint to be
enforced by DB rather than handler code, that is already possible via the existing `is_admin()`
policy — but the established server pattern is the Drizzle-join check in the handler; keep that.

### 7. Preserving the invariants

| Invariant | How it holds |
|-----------|--------------|
| Scheduled task = sole sync-state mutator | Terminal-outcome write stays in `syncAnalysisEffect`; persist only creates a `pending` row; on-demand `POST /:id/sync` keeps enqueuing via `runTask` |
| Layer boundaries | All changes live in `nuxt-galaxy/src/runtime/server/`; no client/UI code; `@gaas/ui`/`@gaas/wiki` untouched |
| No new dependencies | Pure Drizzle + Effect + evlog additions |
| Drizzle confined to server | New query functions live under `runtime/server/utils/grizzle/` |
| No secrets logged | New endpoints log error causes via `useLogger(event)` (existing pattern), never tokens/keys |

---

## Data Flow

### Persist → survival record creation (modified)

```text
Client POST /api/db/analyses
  → analyses.post.ts (getSupabaseUser, health, getWorkflow)
  → runAnalysis(name, …workflow…)          ★ passes workflowName + galaxyWorkflowId
  → insertAnalysis(tx: insert analyses)
      └─ tx.insert(analysis_monitoring, { ownerId, workflowId, workflowName,
                                          galaxyWorkflowId, outcome:'pending', … })  ★
  → returns new analysis id
```

### Sync task → terminal reconciliation (unchanged)

```text
galaxy:sync-analyses (scheduled)
  → syncAnalysisEffect(row)  [acquire lock → fetch invocation → derive terminal]
  → if terminal → updateAnalysisMonitoringOutcome(galaxyInvocationId, …, outcome)   [only writer]
```

### Usage-stats read (new)

```text
GET /api/db/analyses/monitoring[?bucket=&start=&end=]   (or .../admin)
  → monitoring.get.ts / admin.get.ts
      → getSupabaseUser → (admin) requireAdminRole
      → getAnalysisMonitoringCounts          (existing)
      → getAnalysisMonitoringByWorkflow      (new, Drizzle, owner-scoped / global)
      → getAnalysisMonitoringTrend           (new, Drizzle, date_trunc, bounded)
  → merge → { counts…, byWorkflow, trend } → JSON
```

### Deletion survival (unchanged, verified)

```text
DELETE /api/db/analyses/:id → deleteAnalysis → useDrizzle.delete(analyses)
  → FK analysis_monitoring.analysis_id ON DELETE SET NULL → monitoring row persists,
    analysis_id → NULL, all stats fields + owner_id retained.
```

---

## Build Order (dependency-respecting)

Dependencies: schema → write-path → query-layer → types/endpoints → tests.

1. **Phase A — Schema (unblocks all else).** Add `workflow_name`, `galaxy_workflow_id` columns +
   `(owner_id, workflow_id)` and `(owner_id, started_at)` indexes; migration with one-time backfill
   from `workflows`; regenerate Supabase types. *Dependent:* everything.
2. **Phase B — Write path.** Thread `workflowName`/`galaxyWorkflowId` through
   `analyses.post.ts → runAnalysis → insertAnalysis`; snapshot on persist. (Depends on A.)
3. **Phase C — Query layer.** Add `byWorkflow` + `trend` Effect functions + admin variants;
   factor `requireAdminRole`. (Depends on A's columns; independent of B.)
4. **Phase D — Types + endpoints.** Add stat types to `nuxt-galaxy.ts`; enrich
   `monitoring.get.ts`/`monitoring/admin.get.ts` to return `AnalysisMonitoringStats`. (Depends on C;
   type contract before endpoint compile.)
5. **Phase E — Tests + gates.** Unit tests for aggregation SQL, admin scoping, deletion survival of
   the monitoring row, and the persist snapshot; then `pnpm lint` / `pnpm typecheck` / `pnpm test`.

**Rationale:** A before B/C because the snapshot columns and indexes must exist for the query layer
to use `workflow_name` and for `(owner_id, started_at)` lookups. C before D because endpoints
compose the query functions. B is independent of C except both need A, so B/C could run in parallel
after A. D before E so tests target a compiled, wired contract.

---

## Patterns / Anti-Patterns

### Follow: dual Effect function per query in `grizzle/analysisMonitoring.ts`
Match the existing module shape — `Effect.tryPromise` + domain `Data.TaggedError` + owner-scoped
`where`. Example:
```ts
export class GetAnalysisMonitoringStatsError extends Data.TaggedError('GetAnalysisMonitoringStatsError')<{
  readonly message: string
}> {}
export function getAnalysisMonitoringByWorkflow(ownerId: string) {
  return Effect.gen(function* () {
    const drizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => drizzle
        .select({ workflowId: am.workflowId, workflowName: am.workflowName,
                  total: sql<number>`count(*)`,
                  success: sql<number>`count(*) filter (where ${am.outcome}='success')`,
                  /* …error/cancelled/pending */ })
        .from(am).where(eq(am.ownerId, ownerId))
        .groupBy(am.workflowId, am.workflowName).orderBy(sql`count(*) desc`),
      catch: e => new GetAnalysisMonitoringStatsError({ message: `… ${e}` }),
    })
  })
}
```

### Anti-pattern: creating a second survival table
A fresh `analysis_stats` table would duplicate `analysis_monitoring`, fork the persist and sync
write paths, and need its own RLS + backfill. **Do this instead:** extend the existing table. This
is the single highest-risk mistake for this milestone because the milestone text literally describes
building a record that already exists.

### Anti-pattern: joining `workflows` for per-workflow display names
If `workflows` is deleted, the breakdown loses its label and the "usage survives deletion" property
fails. **Do this instead:** denormalize `workflow_name` (and `galaxy_workflow_id`) onto the
monitoring row at persist; keep `workflow_id` as the grouping key.

### Anti-pattern: unbounded trend query
Returning every monitoring row, or every bucket ever, bloats the response. **Do this instead:**
require `bucket` + `start`/`end` and aggregate in Postgres with `date_trunc`.

### Anti-pattern: third code path that writes terminal outcome
Any handler that directly calls `updateAnalysisMonitoringOutcome` or flips monitoring outcome
outside the scheduled task violates the sole-mutator invariant (and the RLS update policy keys on
`outcome='pending'` + `galaxy_invocation_id`, which only the task writes correctly). **Do this
instead:** persist writes `pending` only; the task is the only terminal writer.

### Anti-pattern: hand-editing migrations / forgetting type regen
`supabase/migrations/` is managed by drizzle-kit and `runtime/types/database.ts` is CLI-generated
(protected). Hand-edits drift the schema from the types. **Do this instead:** `pnpm drizzle:generate`
then `pnpm supabase:generate:types`, and never touch them directly.

---

## Scaling Considerations

| Scale | Notes |
|-------|-------|
| 0–1k analyses | Composite stats via single GROUP BY queries is trivially fast; default indexes suffice |
| 1k–100k | The added `(owner_id, workflow_id)` / `(owner_id, started_at)` indexes keep per-user aggregations index-scan based; keep trend bounded by range |
| 100k+ | Consider materialized rollups or a metrics table if the per-user GROUP BY becomes hot; not needed now |

First bottleneck: the trend `GROUP BY date_trunc` scanning all of one user's monitoring rows — bounded
by the `start`/`end` range and indexes on `(owner_id, started_at)`. Second: nothing else; this is a
read-only aggregation over a modest, deletion-surviving table.

---

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `analyses.post.ts ↔ insertAnalysis` | direct Effect call (already) | only signature change: pass workflow snapshot |
| `insertAnalysis ↔ analysis_monitoring` | same transaction insert | extend existing insert, don't add new path |
| sync task ↔ `analysis_monitoring` | service-role Supabase update | **unchanged**; only terminal writer |
| query layer ↔ monitoring endpoints | Effect functions via `runGalaxyEffect` + `Drizzle.Live` | new `byWorkflow`/`trend` |
| `monitoring.get.ts ↔ monitoring/admin.get.ts` | share `requireAdminRole` helper | extract, don't duplicate |

### External Services

| Service | Pattern | Notes |
|---------|---------|-------|
| PostgreSQL | Drizzle ORM, server-only | aggregation source; RLS bypassed server-side |
| Supabase | service-role client | sync task writes outcome (unchanged) |

### Sources

- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analysisMonitoring.ts` (table + RLS)
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts` (FK `onDelete: 'set null'`)
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts` (`insertAnalysis` tx)
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts` (counts queries)
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` (terminal outcome, sole mutator)
- `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/monitoring.get.ts` & `monitoring/admin.get.ts`
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxyRbac/` (roles, userRoles, is_admin)
- `packages/nuxt-galaxy/src/module.ts` (handler registration)
- `.planning/PROJECT.md` (v1.3 milestone scope & Key Decisions)

---

*Architecture research for: v1.3 per-user analysis usage statistics — GaaS*
*Researched: 2026-08-10*
