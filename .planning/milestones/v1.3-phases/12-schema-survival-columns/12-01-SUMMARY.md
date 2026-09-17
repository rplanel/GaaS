---
phase: 12-schema-survival-columns
plan: 01
subsystem: database
tags: [drizzle, drizzle-kit, postgresql, supabase, migration, schema, vitest]

# Dependency graph
requires:
  - phase: 08-analysis-monitoring
    provides: the `galaxy.analysis_monitoring` table, `workflows` table, and existing migration/test conventions
provides:
  - Three nullable snapshot columns (`workflow_name` 256, `galaxy_workflow_id` 256, `workflow_version` 255) on `galaxy.analysis_monitoring`
  - Two named composite indexes (`idx_analysis_monitoring_owner_workflow`, `idx_analysis_monitoring_owner_started_at`)
  - One drizzle-kit generated migration with DDL + appended idempotent backfill UPDATE joining `galaxy.workflows`
  - An extended `analysisMonitoring.test.ts` locking the migration DDL, backfill, and nullable-schema contract
affects: [phase-13-write-path, phase-14-stats-query, phase-15-api]

# Actuals (#2632) — chars/4 over the realized diff (incl. generated snapshot.json)
actuals:
  tokens: 26754
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent multi-column backfill `UPDATE ... FROM galaxy.workflows WHERE ... IS NULL` with COALESCE never-clobber"
    - "Named composite `index('idx_analysis_monitoring_*')` in the table config array to prevent drizzle index-name drift"
    - "File-based migration + schema regex tests (no live DB required)"

key-files:
  created:
    - src/runtime/server/db/migrations/20260810152411_schema_survival_columns/migration.sql
    - src/runtime/server/db/migrations/20260810152411_schema_survival_columns/snapshot.json
  modified:
    - src/runtime/server/db/schema/galaxy/analysisMonitoring.ts
    - test/server/db/schema/galaxy/analysisMonitoring.test.ts

key-decisions:
  - "Generated the migration with the full `drizzle.config.ts` (galaxy_rbac + galaxy) instead of the plan's galaxy-only `drizzle.config.galaxy.ts`, because the galaxy-only config made drizzle-kit emit destructive galaxy_rbac DROP/Schema statements; the full config produced exactly the three ADD COLUMN + two CREATE INDEX."

patterns-established:
  - "Additive schema-extension migrations are generated via drizzle-kit then receive an appended idempotent DML backfill"

requirements-completed: [SCHE-01, SCHE-02, SCHE-03]

coverage:
  - id: D1
    description: "galaxy.analysis_monitoring exposes three nullable snapshot varchars (workflow_name 256, galaxy_workflow_id 256, workflow_version 255) and two named composite indexes, with all existing columns, indexes, and RLS policies unchanged"
    requirement: SCHE-01
    verification:
      - kind: unit
        ref: "test/server/db/schema/galaxy/analysisMonitoring.test.ts#should ADD COLUMN all three nullable snapshot columns and the two composite indexes"
        status: pass
      - kind: unit
        ref: "test/server/db/schema/galaxy/analysisMonitoring.test.ts#should expose the three nullable snapshot fields on the Drizzle schema"
        status: pass
    human_judgment: false
  - id: D2
    description: "One drizzle-kit generated migration adds the three columns + two indexed composites and appends an idempotent backfill UPDATE joining galaxy.workflows with COALESCE + IS NULL guard, offline and free of galaxy.api/invocation references"
    requirement: SCHE-03
    verification:
      - kind: unit
        ref: "test/server/db/schema/galaxy/analysisMonitoring.test.ts#should backfill via an UPDATE joining galaxy.workflows with known values only (idempotent, offline)"
        status: pass
      - kind: other
        ref: "node migration-content check (three ADD COLUMN + two CREATE INDEX + backfill + no api/invocation)"
        status: pass
    human_judgment: false
  - id: D3
    description: "analysisMonitoring.test.ts extended with three survival-column test blocks; the targeted vitest run passes all 6 tests (3 new + 3 pre-existing RLS/migration)"
    requirement: SCHE-02
    verification:
      - kind: unit
        ref: "pnpm exec vitest run server/db/schema/galaxy/analysisMonitoring.test.ts --config vitest.config.server.ts (6 passed)"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-08-10
status: complete
---

# Phase 12 Plan 1: Schema & Survival Columns Summary

**Extended `galaxy.analysis_monitoring` with three nullable deletion-surviving snapshot columns (workflow_name/galaxy_workflow_id/workflow_version), two named composite indexes, a drizzle-kit generated migration with an idempotent local `workflows`-backfill, and a migration/schema test contract — fully offline/file-based.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-10T15:02:30Z
- **Completed:** 2026-08-10T15:27:18Z
- **Tasks:** 2 (completed)
- **Files modified:** 4

## Accomplishments
- Added three nullable snapshot varchars to `analysis_monitoring` (`workflow_name` 256, `galaxy_workflow_id` 256, `workflow_version` 255 — D-01..D-05), preserving all existing columns, the three existing indexes, the uniqueIndex, and the four RLS `pgPolicy` entries unchanged (D-08).
- Added the two SCHE-02 composite indexes (`idx_analysis_monitoring_owner_workflow` on owner_id+workflow_id, `idx_analysis_monitoring_owner_started_at` on owner_id+started_at) with explicit names to prevent drizzle index-name drift (Pitfall 3).
- Generated the `20260810152411_schema_survival_columns` migration via drizzle-kit (exactly three ADD COLUMN + two CREATE INDEX) and appended the idempotent backfill `UPDATE ... FROM galaxy.workflows` with COALESCE + IS NULL guard (D-06/D-07/D-10, SCHE-03) — offline, deterministic, no Galaxy API, no guessing.
- Extended `analysisMonitoring.test.ts` with three survival-column blocks (migration DDL regex, backfill regex with negative api/invocation guard, nullable schema exposure); targeted vitest run passes all 6 tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend analysis_monitoring schema, generate migration, append idempotent backfill** - `60b6f4c712` (feat)
2. **Task 2: Extend analysisMonitoring.test.ts with migration DDL, backfill, and nullable-schema assertions** - `e1d5a77663` (test)

**Plan metadata:** committed by orchestrator (STATE.md owned centrally).

## Files Created/Modified
- `src/runtime/server/db/schema/galaxy/analysisMonitoring.ts` - Added three nullable snapshot varchars + two named composite indexes; nothing else changed.
- `src/runtime/server/db/migrations/20260810152411_schema_survival_columns/migration.sql` - Generated DDL (3 ADD COLUMN + 2 CREATE INDEX) + appended idempotent backfill UPDATE.
- `src/runtime/server/db/migrations/20260810152411_schema_survival_columns/snapshot.json` - Drizzle-kit generated snapshot.
- `test/server/db/schema/galaxy/analysisMonitoring.test.ts` - Added `analysisMonitoring survival columns` describe block with 3 tests.

## Decisions Made
- Generated the migration with the full `drizzle.config.ts` (both `galaxy_rbac` and `galaxy` schemas) instead of the plan's galaxy-only `drizzle.config.galaxy.ts`. The galaxy-only config caused drizzle-kit to emit destructive `galaxy_rbac` DROP statements (DROP TABLE roles/user_roles/role_permissions, DROP TYPE, DROP SCHEMA `galaxy_rbac`) because the latest snapshot contains `galaxy_rbac` objects but the galaxy-only schema glob omits them. The full config produced exactly the required analysis_monitoring DDL with zero drops. See deviation D-A.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical / Correctness] Regenerated migration with the full drizzle config to prevent destructive galaxy_rbac drops**
- **Found during:** Task 1
- **Issue:** Running `drizzle-kit generate --config drizzle.config.galaxy.ts` (galaxy-only `schemaFilter`, as specified by the plan) emitted a migration containing three ADD COLUMN / two CREATE INDEX **plus** destructive `galaxy_rbac` statements: DROP TABLE `roles`/`user_roles`/`role_permissions`, DROP TYPE, DROP CONSTRAINT, and `DROP SCHEMA "galaxy_rbac"`. If applied, this would silently destroy the RBAC schema that backs `galaxy_rbac.is_admin()` and the RLS policies this phase is meant to preserve.
- **Fix:** Removed the wrongly-generated folder and regenerated with `drizzle.config.ts` (schemaFilter `['galaxy_rbac', 'galaxy']`, both globs). The regenerated migration contains exactly the required analysis_monitoring DDL — no rbac drops. Same `drizzle-kit generate` workflow, alternative config.
- **Files modified:** `src/runtime/server/db/migrations/20260810152411_schema_survival_columns/migration.sql`, `snapshot.json`
- **Verification:** migration-content node check passes; `grep -c "DROP SCHEMA\|DROP TABLE\|DROP TYPE\|DROP POLICY\|DROP CONSTRAINT"` = 0.
- **Committed in:** `60b6f4c712`

**2. [Rule 1 - Bug] Fixed backfill test regexes to match multi-line `SET` list**
- **Found during:** Task 2
- **Issue:** The RESEARCH Code Example 5 regexes `/set\s+galaxy_workflow_id\s*=.../` and `/set\s+workflow_version\s*=.../` required the literal `SET` keyword immediately before each column, but only the first line of the SQL `SET` list carries `SET`; subsequent lines start with the column name after newline/indent. The backfill test failed (1 of 6).
- **Fix:** Relaxed the three field regexes to match the COALESCE assignment (`workflow_name = COALESCE(am.workflow_name, w.name)` etc.) without requiring per-line `SET`, consistent with the plan's test-B spec ("SET coalesce(...) / coalesce(...) / coalesce(...)").
- **Files modified:** `test/server/db/schema/galaxy/analysisMonitoring.test.ts`
- **Verification:** targeted vitest run passes (6/6).
- **Committed in:** `e1d5a77663`

**3. [Rule 1 - Bug] Made negative-guard regex non-capturing to satisfy eslint**
- **Found during:** Task 2 (pre-commit hook)
- **Issue:** The `regexp/no-unused-capturing-group` rule flagged `/galaxy\.(api|invocation)/` because the capturing group is never referenced (used only for negation).
- **Fix:** Changed to non-capturing `/galaxy\.(?:api|invocation)/`.
- **Files modified:** `test/server/db/schema/galaxy/analysisMonitoring.test.ts`
- **Verification:** pre-commit lint-staged hook passes.
- **Committed in:** `e1d5a77663`

---

**Total deviations:** 3 auto-fixed (1 missing-critical/correctness, 2 bugs).
**Impact on plan:** All fixes were necessary for correctness and to avoid a destructive migration artifact or failing/lint-blocked tests. No scope creep — the deliverable matches the plan's intended DDL + backfill exactly.

## Issues Encountered
- **`/tmp` tmpfs write failures (EDQUOT, errno -122) during `drizzle-kit generate`.** The sandbox `/tmp` is a tmpfs reporting `Disk quota exceeded` on writes even with free space. drizzle-kit's config-compilation temp writes failed with "Unknown system error -122 ... write". Resolved by redirecting `TMPDIR` to `.tmp-dkr/` on the main disk for the generate command. (The repo's `vitest.config.server.ts` already documents the same errno class of failure and uses the threads pool to avoid it.)
- No other issues — the file-based schema/migration/test work completed as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The schema and migration contract are locked and verified offline (vitest 6/6 + migration-content check).
- **Plan 12-02** (env-sensitive) must apply this migration to a running local Supabase (`pnpm drizzle:migrate`) and regenerate `src/runtime/types/database.ts` (`pnpm supabase:generate:types`) so the extended schema compiles — this plan's `pnpm typecheck`/root gates are intentionally deferred to 12-02 per the plan's `<verification>`.
- Downstream Phase 13 writes these snapshot columns at creation time; Phase 14 queries them; Phase 15 exposes them via API.

## Known Stubs
None - the migration is fully generated plus an idempotent backfill; no placeholder values or unwired components.

## Self-Check: PASSED

- FOUND: `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analysisMonitoring.ts`
- FOUND: `packages/nuxt-galaxy/src/runtime/server/db/migrations/20260810152411_schema_survival_columns/migration.sql`
- FOUND: `packages/nuxt-galaxy/src/runtime/server/db/migrations/20260810152411_schema_survival_columns/snapshot.json`
- FOUND: `packages/nuxt-galaxy/test/server/db/schema/galaxy/analysisMonitoring.test.ts`
- FOUND: `.planning/phases/12-schema-survival-columns/12-01-SUMMARY.md`
- FOUND commit: `60b6f4c712` (Task 1)
- FOUND commit: `e1d5a77663` (Task 2)

---
*Phase: 12-schema-survival-columns*
*Completed: 2026-08-10*
