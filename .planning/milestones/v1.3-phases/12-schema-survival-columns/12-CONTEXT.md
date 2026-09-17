# Phase 12: Schema & Survival Columns - Context

**Gathered:** 2026-08-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the existing `analysis_monitoring` table with durable, deletion-surviving snapshot columns so per-workflow and trend usage statistics remain correct after a workflow is deleted. This phase is the pure schema/migration phase: it adds nullable snapshot columns, adds the SCHE-02 composite indexes, and backfills the new columns on existing rows from known data only. Downstream phases (13 write path, 14 stats query, 15 API) build on this schema.

**In scope:** schema column additions, composite indexes, one backfill migration, type regeneration, migration tests.
**Out of scope:** write-path capture (Phase 13), stats query helpers (Phase 14), API endpoints (Phase 15). No new table, no new write path, no new dependencies.
</domain>

<decisions>
## Implementation Decisions

### Snapshot Semantics
- **D-01 (amends SCHE-01):** Add a third nullable snapshot column `workflow_version` alongside the planned `workflow_name` and `galaxy_workflow_id`. This is required so same-name / different-version workflows remain distinguishable after the workflow is deleted. — **Reversibility:** one-way — rationales: (1) adding a column later triggers another additive migration, (2) backfill of version history cannot be reconstructed if the upstream workflow is already gone.
- **D-02:** `workflow_name` = the workflow display name (sourced from `workflows.name`).
- **D-03:** `galaxy_workflow_id` = the Galaxy string identifier (sourced from `workflows.galaxy_id`).
- **D-04:** `workflow_version` is sourced from `workflows.version_key` (the human tag version, e.g. `"2"`, matching the `my-workflow-2` slug convention), **not** `auto_version` (Galaxy's internal counter).
- **D-05:** All three snapshot columns are nullable. An unresolvable `workflow_name` stays NULL, which surfaces as the "unknown" bucket in per-workflow stats (consistent with Phase 14's planned explicit unknown bucket for orphaned ids).

### Backfill Orphan Policy
- **D-06:** Backfill resolves snapshot fields purely from the LOCAL `workflows` table via the `analysis_monitoring.workflow_id → workflows.id` join. No Galaxy API calls during the migration, no guessing of historical outcomes. If the workflow was already deleted (no join match), leave the snapshot fields NULL. — **Reversibility:** reversible.
- **D-07:** Backfill is per-column: fill each of `workflow_name`, `galaxy_workflow_id`, `workflow_version` independently from the matching workflow row; only leave a field NULL where that specific field has no known source. Partial fills are allowed.

### Index & Naming
- **D-08:** Add exactly the two composite indexes SCHE-02 specifies: `(owner_id, workflow_id)` and `(owner_id, started_at)`. Keep all three existing indexes (`idx_analysis_monitoring_owner_outcome`, `idx_analysis_monitoring_outcome`, `idx_analysis_monitoring_galaxy_invocation_id`) untouched. — **Reversibility:** reversible.
- **D-09:** Column lengths match the workflow-table conventions: `workflow_name` = `varchar(256)`, `galaxy_workflow_id` = `varchar(256)`, `workflow_version` = `varchar(255)` (matches `version_key`/`name_key` length).

### Migration Strategy
- **D-10:** One migration, structured DDL-then-backfill: add the three nullable columns + two composite indexes in the schema, generate with drizzle-kit, then append the idempotent backfill `UPDATE` (join to `workflows`) in the same migration SQL. — **Reversibility:** reversible (migration can be re-run / inspected; additive and non-destructive).
- **D-11:** After migration, regenerate Supabase types (`src/runtime/types/database.ts`) so the extended schema compiles (success criterion 4).
- **D-12:** Add schema + backfill migration tests mirroring the existing `analysisMonitoring.test.ts` pattern: assert the migration SQL contains the ADD COLUMN statements for all three snapshot columns and the two composite indexes; assert the backfill `UPDATE` joins to `workflows` and only populates known values; assert the Drizzle schema exposes the three nullable fields.

### the agent's Discretion
None — all four discussed areas were resolved explicitly. Researcher/planner have latitude only on mechanical details (exact index names, precise migration SQL shape, backfill WHERE-clause idempotency guards) that do not change the decisions above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema & Survival requirements
- `.planning/REQUIREMENTS.md` §"Schema & Survival" — SCHE-01, SCHE-02, SCHE-03 (note SCHE-01 is amended by D-01 to add `workflow_version`).

### Roadmap
- `.planning/ROADMAP.md` §"Phase 12: Schema & Survival Columns" — goal, success criteria, depends-on.

### Existing schema & patterns (codebase)
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analysisMonitoring.ts` — the table being extended; existing columns, indexes, and RLS policies.
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/workflows.ts` — source table for backfill (`name`, `galaxy_id` via `galaxyItem`, `version_key`).
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/index.ts` — `galaxyItem` (galaxy_id/name/annotation) and column conventions.
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts` — how `analysis_monitoring.name` currently stores the ANALYSIS name (not workflow name).
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts` — where `analysis_monitoring` rows are created (sets `name: analysis.name`, `workflowId`).
- `packages/nuxt-galaxy/test/server/db/schema/galaxy/analysisMonitoring.test.ts` — existing migration + RLS test pattern to mirror.

### Module conventions
- `packages/nuxt-galaxy/drizzle.config.galaxy.ts` and `drizzle.config.ts` — drizzle-kit migration config.
- `packages/nuxt-galaxy/AGENTS.md` §"Migration Rules" & §"Database Seeding" — drizzle-kit generate, supabase:generate:types, never edit generated migrations directly except as instructed.
- No external specs/docs beyond the above — requirements and conventions are fully captured here and in the referenced files.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `analysisMonitoring` Drizzle table (`schema/galaxy/analysisMonitoring.ts`): the exact table to extend; existing `index()` + RLS `pgPolicy()` patterns are directly reusable for the new columns/indexes.
- `workflows` table (`schema/galaxy/workflows.ts`): provides `name`, `galaxy_id`, `version_key` — the backfill join source.
- Existing migration test (`test/server/db/schema/galaxy/analysisMonitoring.test.ts`): demonstrates how to assert migration SQL and Drizzle schema/policy shape.

### Established Patterns
- drizzle-kit generated migrations under `src/runtime/server/db/migrations/` (one dir per `{timestamp}_{name}/migration.sql`).
- Column length conventions: galaxy string IDs are `varchar(256)` (`galaxy_id`); local key fields are `varchar(255)` (`version_key`, `name_key`).
- Supabase Drizzle helpers (`authenticatedRole`, `authUid`) and RLS policies must be preserved when editing the table.
- `analysis_monitoring.workflow_id` is a plain `integer` (no FK constraint) — the backfill join is logical, not enforced by the DB.

### Integration Points
- Downstream Phase 13 (`WRIT-01`) will populate the same snapshot columns at creation time — this phase's column names/lengths/version source MUST be treated as the contract Phase 13 writes against.
- Downstream Phase 14 (`STAT-02`) groups per-workflow by `workflow_id` using the snapshotted name + version, with an "unknown" bucket for NULL/orphaned rows — D-05's NULL=unknown aligns with this.
- Type regeneration output (`src/runtime/types/database.ts`) is the compilation gate for criterion 4.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly emphasized workflow **version** as first-class: "I want to be able to differentiate between same workflow but different version." This is the driver behind D-01 (adding `workflow_version`).
- The user prioritizes never fabricating historical data (SCHE-03) — rejected Galaxy API fallback and any guessing during backfill.
- The user prefers minimal schema churn: exactly the required composites, keep existing indexes, match existing length conventions.

</specifics>

<deferred>
## Deferred Ideas

- **Galaxy API fallback during backfill** (resolving recently-deleted workflows live): rejected for this phase and not carried forward — migration stays offline and deterministic. If ever needed, revisit as a future phase.
- **Version-aware index / snapshot-column index**: explicitly deferred — not required for the SCHE-02 queries; can be added in Phase 14 if the query layer needs it.

None else — discussion stayed within phase scope.
</deferred>

---

*Phase: 12-Schema & Survival Columns*
*Context gathered: 2026-08-10*
