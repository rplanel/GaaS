---
phase: 08-consolidate-and-harden-the-server-driven-sync-path
plan: 05
subsystem: refactor
tags: [effect-ts, drizzle, supabase, legacy-cleanup, sync]

requires:
  - phase: 08-consolidate-and-harden-the-server-driven-sync-path
    provides: Canonical Supabase-based sync path and atomic lock RPC from prior 08 plans.

provides:
  - Legacy Drizzle sync helpers removed from analyses.ts, histories.ts, and datasets/input.ts.
  - Dedicated legacy files jobs.ts and datasets/output.ts deleted.
  - Non-sync callers migrated into the files that need them (analyses.ts, histories.ts).
  - Tests cleaned up so no source or test file references any synchronize*Effect helper.

affects:
  - 08-06 (next plan in phase)
  - Phase 09 (client-side sync trigger removal)

actuals:
  tokens: 13559
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Migrate still-needed helpers into their consumers before deleting a dedicated file."
    - "Keep non-sync utilities intact while removing legacy sync orchestration."

key-files:
  created: []
  modified:
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/histories.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/input.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/analyses.test.ts
  deleted:
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/jobs.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/output.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/jobs.test.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/datasets-output.test.ts

key-decisions:
  - "Migrated getAnalysisStderrEffect into analyses.ts because updateAnalysisTerminalState still needs it after jobs.ts deletion."
  - "Migrated getAnalysisJobs, isJobSyncEffect, and the output-dataset state helpers into histories.ts so isSynchronizedAnalysisJobs continues to compile after jobs.ts and output.ts are deleted."
  - "Deleted jobs.test.ts and datasets-output.test.ts entirely; only the tested functions that remained in production code were moved, and their tests were not preserved to avoid scope creep."

patterns-established: []

requirements-completed:
  - REFACTOR-01

coverage:
  - id: D1
    description: Legacy sync helpers removed from mixed utility files (analyses.ts, histories.ts, datasets/input.ts) with no orphaned imports.
    requirement: REFACTOR-01
    verification:
      - kind: other
        ref: "pnpm --filter ./packages/nuxt-galaxy lint"
        status: pass
      - kind: other
        ref: "grep -R 'synchronize\\w*Effect' packages/nuxt-galaxy/src"
        status: pass
    human_judgment: false
  - id: D2
    description: Dedicated legacy sync helper files (jobs.ts, datasets/output.ts) deleted and canonical path still compiles and passes server tests.
    requirement: REFACTOR-01
    verification:
      - kind: other
        ref: "pnpm --filter ./packages/nuxt-galaxy typecheck"
        status: pass
      - kind: unit
        ref: "pnpm --filter ./packages/nuxt-galaxy test:server (222 passed, 3 skipped)"
        status: pass
      - kind: other
        ref: "grep -R 'synchronize\\w*Effect' packages/nuxt-galaxy"
        status: pass
    human_judgment: false

duration: 16 min
completed: 2026-08-08T13:16:43Z
status: complete
---

# Phase 08 Plan 05: Delete Legacy Drizzle Sync Helpers Summary

**Legacy `synchronize*Effect` helpers removed and dedicated helper files deleted, leaving the canonical Supabase-based server-driven sync path as the single source of truth.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-08-08T13:00:22Z
- **Completed:** 2026-08-08T13:16:43Z
- **Tasks:** 3
- **Files changed:** 8

## Accomplishments

- Removed `synchronizeJobsEffect`, `synchronizeAnalysisEffect`, and `synchronizeAnalysesEffect` from `analyses.ts`.
- Removed `synchronizeHistoryEffect` from `histories.ts`.
- Removed `synchronizeInputDatasetEffect` from `datasets/input.ts`.
- Deleted `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/jobs.ts`.
- Deleted `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/output.ts`.
- Migrated still-needed non-sync helpers (`getAnalysisStderrEffect`, `getAnalysisJobs`, `isJobSyncEffect`, output-dataset state helpers) into their consumers before deletion.
- Removed legacy sync tests and obsolete test files; verified zero source/test references to `synchronize*Effect` helpers.

## Task Commits

Each task was committed atomically:

1. **Task 2: Remove legacy sync helpers from mixed utility files** - `377962bd6b` (refactor)
2. **Task 3: Delete dedicated legacy files after non-sync caller verification** - `520ed00de9` (refactor)

**Plan metadata:** `105acddb19` (docs: complete delete-legacy-sync-helpers plan)

## Files Created/Modified

- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts` - Removed legacy sync functions; added `getAnalysisStderrEffect` migrated from `jobs.ts`.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/histories.ts` - Removed `synchronizeHistoryEffect`; added migrated job/output-state helpers needed by `isSynchronizedAnalysisJobs`.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/input.ts` - Removed `synchronizeInputDatasetEffect`.
- `packages/nuxt-galaxy/test/server/utils/grizzle/analyses.test.ts` - Removed legacy `synchronizeAnalysisEffect` tests and mocks.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/jobs.ts` - Deleted.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/output.ts` - Deleted.
- `packages/nuxt-galaxy/test/server/utils/grizzle/jobs.test.ts` - Deleted.
- `packages/nuxt-galaxy/test/server/utils/grizzle/datasets-output.test.ts` - Deleted.

## Decisions Made

- Followed the plan's migration instruction: when a file slated for deletion still had non-sync callers, move those callers' dependencies into the consuming file rather than keeping the dead file.
- Preserved `updateAnalysisTerminalState` and `isSynchronizedAnalysisJobs` by moving their dependencies instead of deleting the utilities.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Non-sync callers found in files scheduled for deletion**
- **Found during:** Task 3 (Delete dedicated legacy files)
- **Issue:** The plan assumed `jobs.ts` and `datasets/output.ts` had no non-sync callers, but `analyses.ts` still called `getAnalysisStderrEffect` and `histories.ts` still called `getAnalysisJobs`/`isJobSyncEffect` (which in turn depended on output-dataset state helpers in `output.ts`).
- **Fix:** Migrated `getAnalysisStderrEffect` into `analyses.ts` and moved `getAnalysisJobs`, `isJobSyncEffect`, `isJobOutputDatasetsSyncEffect`, `getAnalysisOutputState`, and `isOutputDatasetSyncEffect` into `histories.ts` before deleting `jobs.ts` and `output.ts`.
- **Files modified:** `analyses.ts`, `histories.ts`
- **Verification:** `pnpm --filter ./packages/nuxt-galaxy typecheck` and `test:server` pass after deletion.
- **Committed in:** `520ed00de9` (Task 3 commit)

**2. [Rule 1 - Bug] Missing `Effect` import after cleaning analyses.test.ts imports**
- **Found during:** Task 3 verification (`test:server`)
- **Issue:** Removing the legacy test imports accidentally removed the `Effect` import that the remaining tests still use.
- **Fix:** Restored `import { Effect } from 'effect'`.
- **Files modified:** `test/server/utils/grizzle/analyses.test.ts`
- **Verification:** `pnpm --filter ./packages/nuxt-galaxy test:server` passes.
- **Committed in:** `520ed00de9` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking migration, 1 import bug)
**Impact on plan:** Both fixes were necessary to satisfy the plan's deletion goal while keeping non-sync utilities usable. No scope creep.

## Issues Encountered

- The project's assumption that `jobs.ts` and `datasets/output.ts` were entirely legacy sync code was incorrect; they contained helper functions still used by non-sync utilities. This was resolved by migration rather than retention.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 08 Plan 05 is complete.
- Phase 08 Plan 06 (add lock contention and batch summary tests; run root quality gates) is ready to start.
- The canonical Supabase-based sync path is the only remaining server-driven sync implementation.

## Self-Check: PASSED

- [x] `08-05-SUMMARY.md` created.
- [x] Commits `377962bd6b` and `520ed00de9` exist.
- [x] Deleted files no longer exist on disk.
- [x] `pnpm --filter ./packages/nuxt-galaxy lint` passes.
- [x] `pnpm --filter ./packages/nuxt-galaxy typecheck` passes.
- [x] `pnpm --filter ./packages/nuxt-galaxy test:server` passes (222 passed, 3 skipped).
- [x] Grep for `synchronize\w*Effect` returns zero matches in `packages/nuxt-galaxy`.

---
*Phase: 08-consolidate-and-harden-the-server-driven-sync-path*
*Completed: 2026-08-08*
