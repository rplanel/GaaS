---
phase: 08-consolidate-and-harden-the-server-driven-sync-path
plan: 04
subsystem: sync
tags: [effect-ts, supabase, galaxy, sync, idempotency, tests]

requires:
  - phase: 08-02
    provides: sync lock TTL, batch size, and retry config wired through ModuleOptions
  - phase: 07-standardize-evlog-traces
    provides: flat six-ID trace schema and Effect.logDebug routing conventions

provides:
- Idempotent output dataset sync that skips redundant download/upload on analysis-level retries
- Test coverage for skip and upload paths in syncOutputDatasetEffect
- Confirmed per-analysis failure isolation and lock finalizer placement

affects:
- 08-03-plan (retry/backoff will wrap syncAnalysisEffect and must not break the finalizer)
- 08-05-plan (legacy cleanup can rely on the canonical output.ts path)

actuals:
  tokens: 927
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - Early return idempotency guard based on existing DB state and Galaxy dataset state
    - Nested datasets select via Supabase inner join for co-located storage_object_id

key-files:
  created: []
  modified:
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts

key-decisions:
  - "datasets table has no state column; the guard compares analysis_outputs.state to the Galaxy dataset state and selects only storage_object_id from the joined datasets row"
  - "Guard is placed after the existing-output query and Galaxy dataset fetch, before any download/upload or DB mutation"
  - "syncAnalysisEffect finalizer is registered immediately after successful lock acquisition, before any fallible Galaxy or DB operation"

patterns-established: []

requirements-completed:
  - REFACTOR-03
  - REFACTOR-04

coverage:
  - id: D1
    description: "syncOutputDatasetEffect skips download/upload when existing output dataset is unchanged (has storage_object_id and state matches Galaxy dataset)"
    requirement: REFACTOR-03
    verification:
      - kind: unit
        ref: "test/server/utils/grizzle/sync/output.test.ts#skips download and upload when existing output dataset is unchanged"
        status: pass
      - kind: unit
        ref: "test/server/utils/grizzle/sync/output.test.ts#updates an existing output dataset when state differs"
        status: pass
    human_judgment: false
  - id: D2
    description: "syncOutputDatasetEffect still runs normal download/upload for new or changed datasets"
    requirement: REFACTOR-03
    verification:
      - kind: unit
        ref: "test/server/utils/grizzle/sync/output.test.ts#streams terminal-ok dataset to storage"
        status: pass
    human_judgment: false
  - id: D3
    description: "Per-analysis failures in galaxy:sync-analyses remain isolated via Effect.match and do not crash the batch"
    requirement: REFACTOR-04
    verification:
      - kind: unit
        ref: "test/server/tasks/galaxy/sync-analyses.test.ts#counts failures when syncAnalysisEffect fails"
        status: pass
    human_judgment: false
  - id: D4
    description: "Lock release finalizer remains registered before fallible operations in syncAnalysisEffect"
    requirement: REFACTOR-04
    verification:
      - kind: other
        ref: "source review of packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts lines 117-141"
        status: pass
    human_judgment: true
    rationale: "Finalizer placement is verified by manual source review; no automated test asserts the exact registration order"

duration: 8 min
completed: 2026-08-08
status: complete
---

# Phase 08 Plan 04: Output Dataset Idempotency Guard and Failure Isolation Summary

**Added an early-return idempotency guard in syncOutputDatasetEffect that skips redundant Galaxy downloads and storage uploads when the existing analysis output dataset already references a storage object and its state matches the Galaxy dataset state.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-08T08:16:48Z
- **Completed:** 2026-08-08T08:25:31Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Extended the existing-output query in `syncOutputDatasetEffect` to select `storage_object_id` from the joined `datasets` row.
- Inserted an idempotency guard that returns early before any download/upload when the existing output is unchanged.
- Verified the normal download/upload path still executes for new datasets and datasets whose state has changed.
- Confirmed `sync-analyses.ts` wraps each `syncAnalysisEffect` in `Effect.match` for per-analysis failure isolation.
- Confirmed `syncAnalysisEffect` registers `Effect.addFinalizer` for lock release immediately after lock acquisition and before fallible operations.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add idempotency guard to syncOutputDatasetEffect** - `7d3cc57584` (test: failing test for guard)
2. **Task 1: Implement guard** - `be7fbe3c82` (feat)
3. **Task 1: Correct select shape** - `c2cd17bc4f` (fix)
4. **Task 2: Refine output tests for idempotency guard** - `dd4085ae8c` (test)

**Plan metadata:** (to be committed)

_Task 3 verified isolation with no code changes._

## Files Created/Modified

- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts` - Added idempotency guard and extended datasets select
- `packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts` - Added skip test and updated existing-dataset upload test

## Decisions Made

- The `datasets` table does not have a `state` column, so the guard compares `analysis_outputs.state` to the Galaxy dataset state and selects only `storage_object_id` from the joined datasets row. This fixes a type error in the initial implementation attempt.
- The guard is placed after the existing-output query and Galaxy dataset fetch, before any storage operations, ensuring the skip decision is based on current DB state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected idempotency guard select shape**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Selecting `state` from the joined `datasets` row failed typecheck because the `datasets` table has no `state` column.
- **Fix:** Removed `state` from the datasets select and rely on `analysis_outputs.state` for the comparison, which matches the intended semantics in the plan's must-have D-03.
- **Files modified:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts`, `packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts`
- **Verification:** `pnpm --filter ./packages/nuxt-galaxy typecheck` passes
- **Committed in:** `c2cd17bc4f`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor implementation correction; no scope creep. The idempotency guard behavior is unchanged.

## Issues Encountered

- Root `pnpm test` fails in `packages/nuxt-galaxy/test/types-export.test.ts` because it imports `../dist/runtime/types/nuxt-galaxy.d.ts?raw`, which does not exist (the generated file is `.ts`). This failure is unrelated to the sync path changes and is documented as a pre-existing issue; it will be addressed in Phase 11 (Verify Quality Gates).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for Plan 08-03 (retry/backoff and sync-attempt tracking). The finalizer placement confirmed here must be preserved when wrapping `syncAnalysisEffect` with `Effect.retry`.
- The idempotency guard prevents orphaned storage objects during retries, so retry logic can safely re-run `syncAnalysisEffect`.

## Self-Check: PASSED

- [x] `08-04-SUMMARY.md` exists on disk.
- [x] Commits `7d3cc57584`, `be7fbe3c82`, `dd4085ae8c`, `c2cd17bc4f`, and `88e8771183` are in git history.
- [x] `packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts` passes.
- [x] `packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts` passes.
- [x] `pnpm --filter ./packages/nuxt-galaxy typecheck` passes.
- [x] Root `pnpm lint` passes.
- [x] Root `pnpm typecheck` passes.

---
*Phase: 08-consolidate-and-harden-the-server-driven-sync-path*
*Completed: 2026-08-08*
