---
phase: 10-expand-test-coverage
plan: "10"
subsystem: testing
tags: [vitest, effect, galaxy-api, supabase, retry, lock, sync]

requires:
  - phase: 09-remove-client-side-sync-triggers-and-add-on-demand-path
    provides: server-driven sync path and on-demand sync trigger that this phase tests

provides:
  - Enhanced `isTransientError` classifier using HTTP status codes (503/429) alongside message heuristics
  - Unit and end-to-end test coverage for Galaxy 503 retry and exhaustion paths
  - Lock-helper and scheduled-task tests for held and expired lock contention
  - Partial output-sync failure tests covering DB insert failures and lock release
  - Batch summary count assertions for all-success, all-failure, and mixed outcomes

affects:
  - 11-verify-quality-gates
  - future-galaxy-sync-hardening

actuals:
  tokens: 5150
  tasks: 4
  commits: 4

tech-stack:
  added: []
  patterns:
    - Mock Galaxy fetch layers via Effect Layer for transient HTTP status testing
    - Reusable `create503GalaxyLayer` factory in server test fixtures
    - Effect finalizer assertions to verify lock release after DB write failures

key-files:
  created: []
  modified:
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
    - packages/nuxt-galaxy/test/server/fixtures.ts
    - packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts
    - packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts

key-decisions:
  - Preserved the existing `skipped: 0` task contract; tests assert it explicitly rather than changing implementation.
  - Added `extractStatusCode` from blendtype to `isTransientError` so transient HTTP status codes are recognized without losing the message heuristic.

patterns-established:
  - "Use Effect Layer factories for deterministic Galaxy HTTP status mocking in server tests"
  - "Assert lock-release RPC calls via Supabase spy to verify finalizer behavior on partial failures"

requirements-completed:
  - TEST-01
  - TEST-02
  - TEST-03
  - TEST-04

coverage:
  - id: D1
    description: "503/429 transient error classifier enhancement in analysis.ts"
    requirement: TEST-02
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts#isTransientError treats GalaxyApiError statusCode 503/429 as transient"
        status: pass
    human_judgment: false
  - id: D2
    description: "End-to-end 503 retry path: first invocation 503 then success"
    requirement: TEST-02
    verification:
      - kind: integration
        ref: "packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts#retries transient Galaxy 503 and succeeds on next attempt"
        status: pass
    human_judgment: false
  - id: D3
    description: "Repeated 503 responses exhaust retries and mark analysis failed"
    requirement: TEST-02
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts#fails after exhausting retries on repeated Galaxy 503"
        status: pass
    human_judgment: false
  - id: D4
    description: "Held lock skips an analysis without aborting the batch"
    requirement: TEST-01
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts#continues batch when an analysis lock is already held"
        status: pass
    human_judgment: false
  - id: D5
    description: "Expired lock can be reclaimed by a new worker"
    requirement: TEST-01
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts#reclaims an expired lock after release"
        status: pass
    human_judgment: false
  - id: D6
    description: "Partial output-sync DB failure raises SyncOutputError without orphan rows"
    requirement: TEST-03
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts#fails with SyncOutputError when analysis_outputs insert fails"
        status: pass
    human_judgment: false
  - id: D7
    description: "Output-sync failure releases lock and continues batch"
    requirement: TEST-03
    verification:
      - kind: integration
        ref: "packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts#releases lock and continues batch when output sync DB write fails"
        status: pass
    human_judgment: false
  - id: D8
    description: "Batch summary returns correct synced/failed/skipped counts for mixed outcomes"
    requirement: TEST-04
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts#returns correct counts for all-success, all-failure, and mixed batches"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-08-09
status: complete
---

# Phase 10: expand-test-coverage Summary

**Enhanced the Galaxy sync transient-error classifier to honor HTTP 503/429 status codes and expanded test coverage across retry, lock contention, partial output-sync failure, and batch-summary paths.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-08-09T20:01:09Z
- **Completed:** 2026-08-09T20:15:29Z
- **Tasks:** 4
- **Files modified:** 7

## Accomplishments

- `isTransientError` now uses `extractStatusCode(error)` from blendtype to treat HTTP 503/429 as transient while keeping the existing message heuristic.
- Added a reusable `create503GalaxyLayer` fixture helper and end-to-end test for 503 retry success.
- Added unit tests proving repeated 503s exhaust retries, mark the analysis failed, and increment `sync_attempts`.
- Covered lock contention: held lock does not abort the batch, and expired locks can be reclaimed.
- Covered partial output-sync DB failures: `SyncOutputError` with no orphaned rows and lock release via the existing finalizer.
- Extended batch summary tests to assert `{ synced, failed, skipped: 0 }` for all-success, all-failure, and mixed outcomes.

## Task Commits

Each task was committed atomically:

1. **Task 10-01: 503 retry end-to-end tracer** - `e1a7fd2ff3` (feat)
2. **Task 10-02: Lock contention tests** - `5f0d9dc214` (test)
3. **Task 10-03: Partial output-sync failure tests** - `bc36c39530` (test)
4. **Task 10-04: Batch summary count coverage** - `3f650819cc` (test)

## Files Created/Modified

- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` - `isTransientError` classifier enhancement
- `packages/nuxt-galaxy/test/server/fixtures.ts` - `create503GalaxyLayer` helper and related fixture updates
- `packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts` - 503 retry and partial output-sync failure integration tests
- `packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts` - 503 transient/retry unit tests
- `packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts` - expired-lock reclaim test
- `packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts` - partial `analysis_outputs` failure test
- `packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts` - held-lock batch behavior and mixed-outcome summary tests

## Decisions Made

- Followed the plan's constraint to keep the `skipped: 0` contract unchanged; tests assert the existing shape rather than modifying the task implementation.
- Used `extractStatusCode` from blendtype to avoid duplicating status-code extraction logic.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All Phase 10 requirements are tested and passing.
- Ready for Phase 11 "Verify Quality Gates".

---
*Phase: 10-expand-test-coverage*
*Completed: 2026-08-09*
