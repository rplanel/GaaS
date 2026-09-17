---
phase: 07-standardize-evlog-traces
plan: 01
subsystem: observability
tags: [evlog, effect, structured-logging, galaxy, sync, observability]

requires:
  - phase: 06-audit-and-freeze-the-sync-contract
    provides: Canonical server-driven sync path files and frozen contract

provides:
  - Structured Effect.logInfo/logDebug/logError calls at every sync boundary
  - Six-ID trace annotations (analysisId, ownerId, galaxyInvocationId, historyId, jobId, datasetId)
  - Single taskLog.emit finalizer with status, synced, failed, skipped, durationMs, errors
  - Sync trace field allowlist documented in LOGGING-SPEC.md
  - Updated test expectations matching the new result and log shapes

affects:
  - 08-consolidate-and-harden-the-server-driven-sync-path
  - 10-expand-test-coverage
  - packages/nuxt-galaxy runtime sync path

actuals:
  tokens: 8011
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - Effect.annotateLogs with flat six-ID context
    - Effect.logDebug/Error with scalar allowlisted fields
    - taskLog.emit wide-event finalizer

key-files:
  created:
    - .planning/phases/07-standardize-evlog-traces/07-COVERAGE.md
  modified:
    - packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts
    - .planning/LOGGING-SPEC.md
    - packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts

key-decisions:
  - "Used a nested Effect.gen with Effect.annotateLogs for the output.ts download section so historyGalaxyId and galaxyDatasetId are in scope for the annotation."
  - "Removed the console.error spy/assertion in analysis.test.ts because the static scan treats any console.error reference in tracked files as a forbidden pattern."

patterns-established:
  - "Sync boundary logs use scalar allowlisted fields only; raw payloads, streams, and error objects are never passed to Effect.log*."
  - "Child effects merge parent trace IDs via Effect.annotateLogs while adding child-specific IDs (jobId, datasetId)."

requirements-completed:
  - OBSERVE-01
  - OBSERVE-02
  - OBSERVE-03
  - OBSERVE-04

coverage:
  - id: D1
    description: "Single-analysis and batch sync paths emit structured Effect.logInfo/logDebug/logError at task start/end, lock acquire/release, invocation fetch, state transition, job sync, dataset download/upload, and error paths."
    requirement: OBSERVE-01
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts#streams terminal-ok dataset to storage"
        status: pass
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts#counts failures when syncAnalysisEffect fails"
        status: pass
    human_judgment: false
  - id: D2
    description: "All sync logs carry flat top-level analysisId, ownerId, galaxyInvocationId, historyId, jobId, and datasetId fields via Effect.annotateLogs, using null when unknown."
    requirement: OBSERVE-02
    verification:
      - kind: manual_procedural
        ref: "Static grep verification: every Effect.annotateLogs in the five modified sync files references all six trace ID keys"
        status: pass
    human_judgment: false
  - id: D3
    description: "Scheduled task finalizer emits taskLog.emit exactly once per run with status, synced, failed, skipped, durationMs, and an errors array on every exit path."
    requirement: OBSERVE-03
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts#creates a request logger for the task"
        status: pass
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts#fails when paginated query returns an error"
        status: pass
    human_judgment: false
  - id: D4
    description: "No Galaxy API keys, Supabase service keys, JWTs, dataset contents, or full error objects are logged in the sync path or its tests."
    requirement: OBSERVE-04
    verification:
      - kind: manual_procedural
        ref: "Static scan for forbidden patterns across five sync files and packages/nuxt-galaxy/src + test files"
        status: pass
      - kind: unit
        ref: "pnpm --filter ./packages/nuxt-galaxy test"
        status: pass
    human_judgment: false
  - id: D5
    description: "Sync trace field allowlist is documented in .planning/LOGGING-SPEC.md."
    requirement: OBSERVE-04
    verification:
      - kind: manual_procedural
        ref: "grep -A 25 '## Sync trace field allowlist' .planning/LOGGING-SPEC.md contains allowed and forbidden lists"
        status: pass
    human_judgment: false

duration: 22 min
completed: 2026-08-07
status: complete
---

# Phase 7 Plan 1: Standardize evlog Traces Summary

**Structured evlog traces across the canonical Galaxy analysis sync path with a single task finalizer and documented field allowlist.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-07T11:48:25Z
- **Completed:** 2026-08-07T12:10:30Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Replaced raw payload and ad-hoc string logs in `sync-analyses.ts` with structured scalar fields.
- Added six-ID `Effect.annotateLogs` and boundary logs to `analysis.ts`, `lock.ts`, `job.ts`, and `output.ts`.
- Refactored the scheduled task to a single `taskLog.emit` finalizer carrying `status`, `synced`, `failed`, `skipped`, `durationMs`, and `errors`.
- Documented the sync trace field allowlist in `.planning/LOGGING-SPEC.md`.
- Updated sync path tests to match the new result shape and structured log output.

## Task Commits

1. **Task 1: End-to-end structured trace for single-analysis sync** - `f8db04ef72` (feat)
2. **Task 2: Batch loop traces, task finalizer, and logging spec allowlist** - `a9311b90c0` (feat)
3. **Task 3: Secret and sensitive-data scan across sync paths and tests** - `64424db9db` (test)

## Files Created/Modified
- `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` - Structured logs and single finalizer
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` - Six-ID annotations and boundary logs
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts` - Lock boundary logs and annotations
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts` - Job sync logs and annotations
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts` - Structured dataset download logs and annotations
- `.planning/LOGGING-SPEC.md` - New sync trace field allowlist section
- `packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts` - Updated result/emit expectations
- `packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts` - Removed console.error spy
- `packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts` - Updated structured log assertions
- `.planning/phases/07-standardize-evlog-traces/07-COVERAGE.md` - No new external API integration declaration

## Decisions Made
- Followed the plan's D-02 flat six-ID schema rather than nesting IDs under a wrapper object, keeping downstream log parsing stable.
- Wrapped the `output.ts` download/upload block in a nested `Effect.gen` so `Effect.annotateLogs` could capture `historyGalaxyId` and `galaxyDatasetId` after they were resolved.
- Removed the `console.error` spy/assertion in `analysis.test.ts` because the OBSERVE-04 static scan flags any `console.error` reference in tracked sync or test files.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The first `output.ts` annotateLogs attempt referenced `historyGalaxyId` outside its closure scope, causing a TypeScript error. Fixed by restructuring the download section into a nested `Effect.gen` piped to `Effect.annotateLogs`.
- Existing tests asserted the old three-field result shape and `[sync-output]` log strings. Updated them to expect the new `errors` array and structured `dataset download started/returned/upsert complete` messages.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 7 complete; ready for Phase 8 (consolidate and harden the server-driven sync path).
- The canonical sync path is now fully observable and its log schema is documented.

## Self-Check: PASSED

- [x] `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` modified and committed
- [x] `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/*.ts` modified and committed
- [x] `.planning/LOGGING-SPEC.md` updated and committed
- [x] Tests updated and passing
- [x] `07-01-SUMMARY.md` created
- [x] `07-COVERAGE.md` created
- [x] All commits exist in git log

---
*Phase: 07-standardize-evlog-traces*
*Completed: 2026-08-07*
