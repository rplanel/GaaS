---
phase: 13-write-path-integrity
plan: 01
subsystem: database
tags: [drizzle, effect, grizzle, analysis-monitoring, workflow-provenance, snapshot, transaction]

requires:
  - phase: 12-schema-survival-columns
    provides: nullable workflow_name/galaxy_workflow_id/workflow_version snapshot columns on analysis_monitoring
provides:
  - Create path snapshots workflow provenance at analysis creation (WRIT-01)
  - Single canonical monitoring-insert helper with atomic same-tx writes + optional tx client
  - WorkflowSnapshot type drained from the local workflows row, never a Galaxy API call
affects: [13-write-path-integrity (13-02 delete finalization shares these files), 14-stats-queries, 15-api-endpoints]

actuals:
  tokens: 4094      # chars/4 over the realized diff (16,378 chars) of the 6 changed files
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Delegate DB inserts to a canonical effect helper that accepts an optional transaction client (tx ?? yield* Drizzle), keeping multi-table writes atomic on one connection"

key-files:
  created: []
  modified:
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts
    - packages/nuxt-galaxy/src/runtime/server/api/db/analyses.post.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/analyses.test.ts
    - packages/nuxt-galaxy/test/server/api/db/analyses.test.ts

key-decisions:
  - "WorkflowSnapshot is typed immutable (string | null per field) and frozen at write (D-10); never re-resolved on later rename/re-version"
  - "insertAnalysisMonitoringEffect accepts an optional tx client; when present it runs on that tx and never yields Drizzle (D-04 interop), keeping the analyses+monitoring insert atomic"
  - "insertAnalysis delegates its monitoring insert to the canonical helper (D-03), removing the duplicated inline write path"
  - "analyses.post.ts resolves the snapshot from the already-loaded local workflows row — no Galaxy API call for provenance (D-02)"
  - "Unresolved snapshot fields persist as NULL, never fabricated (D-05); NULL is the downstream 'unknown' bucket"

requirements-completed: [WRIT-01]

coverage:
  - id: D1
    description: "Create path snapshots workflowName/galaxyWorkflowId/workflowVersion onto the analysis_monitoring row at creation; unresolved fields persist as NULL"
    requirement: WRIT-01
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts#should write workflow snapshot values when provided"
        status: pass
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts#should not fabricate provenance when no snapshot is provided (NULL passthrough, D-05)"
        status: pass
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analyses.test.ts#should write workflow snapshot values to the monitoring row"
        status: pass
    human_judgment: false
  - id: D2
    description: "Single canonical monitoring-insert helper used by insertAnalysis, running on the same DB transaction as the analyses insert (D-03/D-04)"
    requirement: WRIT-01
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts#should run on the supplied tx client instead of the root Drizzle mock (D-04 interop)"
        status: pass
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analyses.test.ts#should insert a monitoring row with pending outcome when inserting an analysis"
        status: pass
    human_judgment: false
  - id: D3
    description: "analyses.post.ts resolves the snapshot from the local workflows row and threads it through runAnalysis (D-02)"
    requirement: WRIT-01
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/api/db/analyses.test.ts#should thread the resolved workflow snapshot into runAnalysis"
        status: pass
    human_judgment: false

# Metrics
duration: 13min
completed: 2026-08-10
status: complete
---

# Phase 13 Plan 1: Write Path Integrity — Create-Path Snapshot Summary

**The analysis create path now snapshots `workflowName`/`galaxyWorkflowId`/`workflowVersion` onto the `analysis_monitoring` row at creation, via a single canonical effect helper that runs on the same DB transaction as the `analyses` insert — so per-workflow usage stats survive workflow deletion (WRIT-01).**

## Performance

- **Duration:** 13 min
- **Started:** 2026-08-10T17:26:28Z
- **Completed:** 2026-08-10T17:39:54Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `insertAnalysisMonitoringEffect` extended with an immutable `WorkflowSnapshot` (readonly `string | null` fields) and an optional `tx` client. When `tx` is supplied it writes on that client and never `yield* Drizzle`, preserving D-04 atomicity.
- Snapshot values map to their Drizzle columns (`workflow_name`, `galaxy_workflow_id`, `workflow_version`); absent/null fields persist as NULL (D-05), never fabricated — the downstream "unknown" bucket stays clean.
- `insertAnalysis`'s duplicated inline monitoring insert removed and delegated to the canonical helper inside the same `useDrizzle.transaction` callback, so both writes commit atomically (D-03/D-04).
- `runAnalysis`/`insertAnalysis` accept an optional trailing `workflowSnapshot`; `analyses.post.ts` resolves it from the already-loaded local `workflows` row (`name`, `galaxyId`, `versionKey`) — no Galaxy API call (D-02) — and threads it through.
- Tests expanded (baseline 49 → 56 tests in the targeted files): snapshot values written, NULL passthrough, per-field independent resolution, distinct-`tx` interop, and controller-level snapshot threading.

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread WorkflowSnapshot through the create path and delegate the monitoring insert to the canonical helper** - `539db7d52b` (feat)
2. **Task 2: Expand create-path tests for snapshot values, NULL passthrough, controller threading, and distinct-tx usage** - `ab0de8bb25` (test)

**Plan metadata:** committed with this SUMMARY + STATE/ROADMAP/REQUIREMENTS updates (docs commit).

## Files Created/Modified

- `src/runtime/server/utils/grizzle/analysisMonitoring.ts` - Added `WorkflowSnapshot` type; extended `insertAnalysisMonitoringEffect` with snapshot + optional `tx`; NULL-passthrough values; `const db = tx ?? (yield* Drizzle)` with typed `DrizzleTransaction`.
- `src/runtime/server/utils/grizzle/analyses.ts` - Added optional `workflowSnapshot` to `runAnalysis` and `insertAnalysis`; delegated the inline monitoring insert to `insertAnalysisMonitoringEffect(..., tx)` via `provideService(Drizzle, ...)`.
- `src/runtime/server/api/db/analyses.post.ts` - Resolves `workflowSnapshot` from the loaded `workflows` row and passes it to `runAnalysis`.
- `test/server/utils/grizzle/analysisMonitoring.test.ts` - Added snapshot-values, NULL-passthrough, independent-field, and distinct-`tx` tests.
- `test/server/utils/grizzle/analyses.test.ts` - Added snapshot-columns and NULL-passthrough tests on the monitoring insert.
- `test/server/api/db/analyses.test.ts` - Extended `mockDbWorkflow` and added controller threading assertion.

## Decisions Made

- Snapshot is frozen at write (D-10) — captured once from the local rows row at creation, never re-resolved on later rename/re-version; documented on the `WorkflowSnapshot` type.
- The helper's `tx` parameter is typed as the transaction-callback client (`Parameters<...['transaction'][0]>[0]`), distinct from the root `Drizzle` service value which carries the connection (`$client`).
- At the `insertAnalysis` call site the helper Effect's `Drizzle` requirement is satisfied by providing the same `tx` client (`Context.Tag.Service<typeof Drizzle>` cast) — inert at runtime because the helper already uses `tx`, but required for typechecking `Effect.runPromise` inside the plain async transaction callback.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `tx` type mismatch: transaction client is not the root Drizzle client type**
- **Found during:** Task 1 (threading the monitoring insert through the create path)
- **Issue:** The plan suggested typing the optional `tx` param as `ReturnType<typeof useDrizzle>` (the root `Drizzle` service value). The actual client passed to `useDrizzle.transaction(cb => ...)` is a `PgAsyncTransaction` (no `$client`), which is **not assignable** to `PostgresJsDatabase<...> & { $client }`, so `pnpm typecheck` failed (`TS2345`).
- **Fix:** Typed `tx` as `DrizzleTransaction = Parameters<Parameters<DrizzleClient['transaction']>[0]>[0]` — the exact transaction-callback client type, derived generically (version-agnostic). The helper's body still uses `const db = tx ?? (yield* Drizzle)` unchanged in intent.
- **Files modified:** `analysisMonitoring.ts`
- **Verification:** `pnpm typecheck` green.
- **Committed in:** `539db7d52b` (Task 1 commit)

**2. [Rule 3 - Blocking] Running the helper Effect required providing the `Drizzle` service**
- **Found during:** Task 1 (delegating the insert inside `insertAnalysis`)
- **Issue:** `insertAnalysisMonitoringEffect(...).pipe(Effect.runPromise)` failed typecheck because the helper's Effect still declares `Drizzle` in its requirement (it yields `Drizzle` on its no-`tx` branch), and `Effect.runPromise` requires `R = never` (`TS2345`: `Type 'Drizzle' is not assignable to type 'never'`).
- **Fix:** Provided the transaction client as the `Drizzle` service at the call site — `.pipe(Effect.provideService(Drizzle, tx as Context.Tag.Service<typeof Drizzle>), Effect.runPromise)`. Semantically correct (D-04): the helper uses `tx` directly and the provided service is inert. A comment explains why.
- **Files modified:** `analyses.ts`
- **Verification:** `pnpm typecheck` green; monitored insert tests pass.
- **Committed in:** `539db7d52b` (Task 1 commit)

**3. [Rule 3 - Blocking] Plan's `pnpm vitest run <server test files>` used the wrong Vitest config**
- **Found during:** Tasks 1 & 2 verification
- **Issue:** The plan's `<verify>` commands ran `pnpm vitest run test/server/...` against the default `vitest.config.ts`, which `exclude: ['test/server/**']` — Vitest reported "No test files found". The server suite uses `vitest.config.server.ts`.
- **Fix:** Ran the server tests with `pnpm vitest run --config vitest.config.server.ts <files>` (matches the project's own `test:server` script). Same tests, same assertions — only the config flag changed.
- **Files modified:** none (verification invocation only)
- **Verification:** Targeted server tests 47 → 56 passing; full `pnpm test` green.
- **Committed in:** n/a (verification command correction)

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking).
**Impact on plan:** All fixes were mechanical/type-level corrections required to compile and run the intended work. No scope creep; behavior matches the plan's WRIT-01 intent exactly.

## Issues Encountered

- The plan's `type="tracer"` verification ran cleanly on the first implementation pass after the two type fixes above — no further issues. `pnpm typecheck` (both root and `playground`) green.

## User Setup Required

None - no external service configuration required. No new packages were added (T-13-01-SC accepted).

## Next Phase Readiness

- Create path fully snapshots all three provenance columns (WRIT-01 satisfied); NULL-passthrough preserved; single canonical insert helper (D-03) running atomically on the passed `tx` (D-04).
- Ready for **13-02** (delete-time finalization: finalize a stranded `pending` monitoring row to `cancelled` inside `deleteAnalysis` — WRIT-02) which shares these same grizzle files.
- Downstream **Phase 14** (stats queries) can now read non-null provenance for created-after-this-analysis rows; pre-existing rows remain NULL (unknown bucket) until a backfill is run.

---

*Phase: 13-write-path-integrity*
*Completed: 2026-08-10*

## Self-Check: PASSED

- All 6 modified/created files verified present (`[ -f ]`).
- Task commits verified in git: `539db7d52b`, `ab0de8bb25`.
- Full package verification: `pnpm test` (64 client + 256 server, 3 skipped) green; `pnpm typecheck` green.
