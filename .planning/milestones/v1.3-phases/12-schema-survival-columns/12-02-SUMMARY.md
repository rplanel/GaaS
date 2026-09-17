---
phase: 12-schema-survival-columns
plan: 02
subsystem: database
tags: [drizzle, supabase, typegen, postgres, schema-survival]

requires:
  - phase: 12-schema-survival-columns
    provides: 12-01 generated the schema_survival_columns migration (DDL + index + backfill)
provides:
  - Regenerated src/runtime/types/database.ts exposing workflow_name, galaxy_workflow_id, workflow_version as nullable string | null
  - Applied the Plan-12-01 drizzle migration to the running local Supabase (success criterion 4 / D-11 type-sync gate)
affects: [13-write-path, 14-stats-query, 15-api]

actuals:
  tokens: 470        # chars/4 over the realized diff (database.ts, 9 insertions)
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Migration-apply before typegen (RESEARCH Pitfall 1): pnpm drizzle:migrate first, then pnpm supabase:generate:types (--local) reads the live DB"

key-files:
  created: []
  modified:
    - "packages/nuxt-galaxy/src/runtime/types/database.ts"

key-decisions:
  - "Applied the drizzle-managed migration via pnpm drizzle:migrate (NOT supabase:db:reset) — drizzle migrations live under src/runtime/server/db/migrations and db reset would replay a different/destructive set"
  - "Regenerated database.ts exclusively via pnpm supabase:generate:types (--local --schema 'galaxy_rbac,galaxy'); no hand-editing of the protected generated file"

patterns-established:
  - "Strict ordering: apply migration → regenerate types → typecheck, so codegen reads the live extended schema"

requirements-completed:
  - SCHE-01
  - SCHE-02

coverage:
  - id: D1
    description: "src/runtime/types/database.ts regenerated against local Supabase exposing workflow_name, galaxy_workflow_id, workflow_version as nullable string | null on the galaxy.analysis_monitoring type, and the module typechecks against the extended schema"
    requirement: SCHE-01
    verification:
      - kind: other
        ref: "node -e script asserting the three '? : string | null' snapshot columns present in database.ts"
        status: pass
      - kind: other
        ref: "pnpm typecheck (vue-tsc --noEmit module + playground) — exit 0"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-08-10
status: complete
---

# Phase 12 Plan 2: Schema Survival — Type Regeneration Summary

**Applied the Plan-12-01 `schema_survival_columns` drizzle migration to the running local Supabase and regenerated `src/runtime/types/database.ts` to expose the three nullable snapshot columns, closing the D-11 type-sync / compile-schema gate (success criterion 4).**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-08-10T15:25:00Z
- **Completed:** 2026-08-10T15:33:54Z
- **Tasks:** 2 (1 auto + 1 blocking human-verify checkpoint)
- **Files modified:** 1 (`packages/nuxt-galaxy/src/runtime/types/database.ts`)

## Accomplishments

- Applied the `20260810152411_schema_survival_columns` migration via `pnpm drizzle:migrate` to the running local Supabase Postgres (127.0.0.1:54322) — ADD COLUMN ×3 + CREATE INDEX ×2 + idempotent backfill UPDATE. Exit 0.
- Regenerated `src/runtime/types/database.ts` via `pnpm supabase:generate:types` (`--local --schema 'galaxy_rbac,galaxy'`), exit 0.
- Verified the `galaxy.analysis_monitoring` Row/Insert/Update types now include `workflow_name`, `galaxy_workflow_id`, `workflow_version` as `string | null`.
- `pnpm typecheck` (vue-tsc --noEmit on the module and playground) passes — success criterion 4 (types compile against the extended schema) satisfied.

## Task Commits

1. **Task 1: Apply drizzle migration to local Supabase and regenerate Supabase types** - `874463eed0` (chore)
2. **Task 2: Checkpoint: Confirm typecheck passes with regenerated types** - human-verify checkpoint, approved by operator (no code commit)

**Plan metadata:** `pending` — final docs commit below.

## Files Created/Modified

- `packages/nuxt-galaxy/src/runtime/types/database.ts` - Regenerated (protected generated file); adds `workflow_name`, `galaxy_workflow_id`, `workflow_version` as nullable `string | null` snapshot columns on `galaxy.analysis_monitoring` (Row/Insert/Update).

## Decisions Made

- Used `pnpm drizzle:migrate` (drizzle-managed stream) rather than `supabase:db:reset` to apply the Plan-12-01 migration — db reset would replay a different migration set and be destructive to local data (RESEARCH Pitfall 1 / Open Question RESOLVED).
- Regenerated `database.ts` strictly via `pnpm supabase:generate:types`, never hand-edited — honors the protected-files / Migration Rules convention (AGENTS, threat T-12-04).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Local Supabase was already running (`pnpm supabase:status` exit 0), so the Task 1 precondition was met; no operator intervention required to start it.

## User Setup Required

None - the required local Supabase (`user_setup` service in plan frontmatter) was already running; no external service configuration required.

## Next Phase Readiness

- The extended `galaxy.analysis_monitoring` schema now compiles end-to-end (types + typecheck green), so downstream Phase 13+ can write against `workflowName` / `galaxyWorkflowId` / `workflowVersion`.
- Ready for next plan: `12-03` (migration tests, per D-12) or Phase 13 write path.

## Self-Check: PASSED

- FOUND: `.planning/phases/12-schema-survival-columns/12-02-SUMMARY.md`
- FOUND: commit `874463eed0` (Task 1: regenerate Supabase types)
- PASS: `src/runtime/types/database.ts` contains all three nullable `string | null` snapshot columns
- PASS: `pnpm typecheck` exit 0 (module + playground)
- PASS: STATE.md / ROADMAP.md not modified by this executor (STATE.md was pre-modified by orchestrator)

---
*Phase: 12-schema-survival-columns*
*Completed: 2026-08-10*
