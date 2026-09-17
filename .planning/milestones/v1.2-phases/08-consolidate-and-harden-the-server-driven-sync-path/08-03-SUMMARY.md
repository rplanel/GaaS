---
phase: 08-consolidate-and-harden-the-server-driven-sync-path
plan: 03
subsystem: sync
tags:
  - effect-ts
  - supabase
  - retry
  - backoff
  - sync-attempts
  - evlog

requires:
  - phase: 08-02
    provides: syncConfig object with lockTtlSeconds, batchSize, maxRetries, retryBaseDelayMs, retryMaxDelayMs

provides:
 - Bounded Effect.retry around syncAnalysisEffect for transient Galaxy/Supabase/network errors
 - isTransientError predicate distinguishing transient 503/429/network failures from permanent 4xx/ownership/missing-analysis failures
 - Sync-attempt tracking columns updated on success (reset) and final failure (increment + next_sync_at scheduling)
 - Tests covering retry success, retry exhaustion, permanent-error no-retry, and sync-attempt metadata updates

affects:
 - 08-05-remove-legacy-drizzle-sync-helpers
 - 08-06-add-lock-contention-and-batch-summary-tests
 - 10-expand-test-coverage
 - 11-verify-quality-gates

actuals:
  tokens: 3816
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - Effect.retry with Schedule.exponential + Schedule.delayed cap for bounded backoff
    - Transient-error predicate checked before retry and after exhaustion for targeted logging
    - Mutable closure capture to keep analysis row in scope for a post-retry catchAll
    - Success update resets sync_attempts/last_sync_error_at/next_sync_at in a single Supabase call

key-files:
  created: []
  modified:
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts

key-decisions:
  - "Use Schedule.delayed + Duration.toMillis to cap exponential backoff because Effect 3.22 does not expose Schedule.capDelay"
  - "Keep Effect.scoped inside the retry boundary so each attempt acquires/releases the sync lock independently"
  - "Capture the analysis row in a mutable closure variable so the post-retry catchAll can update sync_attempts without refetching"
  - "Log (but do not throw) sync-attempt update failures so the original sync error is not swallowed"

patterns-established:
  - "Transient vs permanent error classification via a pure isTransientError(message) helper"
  - "Retry exhaustion logging only for transient errors to avoid misleading permanent-error logs"
  - "Sync metadata reset bundled with the terminal state update to reduce Supabase round-trips"

requirements-completed:
  - REFACTOR-02
  - REFACTOR-03

# Coverage metadata — see coverage_guidance in summary template
coverage:
  - id: D1
    description: syncAnalysisEffect retries transient Galaxy/Supabase/network errors with bounded exponential backoff
    requirement: REFACTOR-03
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts#retries on transient Galaxy error and succeeds when the next attempt recovers"
        status: pass
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts#fails after maxRetries + 1 attempts when Galaxy keeps returning transient errors"
        status: pass
    human_judgment: false
  - id: D2
    description: Permanent failures (missing analysis, ownership mismatch, generic 4xx) do not retry
    requirement: REFACTOR-03
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts#does not retry when the analysis row is missing and does not update sync_attempts"
        status: pass
    human_judgment: false
  - id: D3
    description: Successful sync resets sync_attempts, last_sync_error_at, and next_sync_at
    requirement: REFACTOR-03
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts#resets sync_attempts columns on a successful sync"
        status: pass
    human_judgment: false
  - id: D4
    description: Final failure increments sync_attempts and schedules next_sync_at with exponential backoff capped at 1 hour
    requirement: REFACTOR-03
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts#increments sync_attempts and schedules next_sync_at after retries are exhausted"
        status: pass
    human_judgment: false
  - id: D5
    description: Lock not acquired is a no-op that leaves sync_attempts unchanged
    requirement: REFACTOR-03
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts#does not update sync_attempts when the lock cannot be acquired"
        status: pass
    human_judgment: false

# Metrics
duration: 9 min
completed: 2026-08-08
status: complete
---

# Phase 08 Plan 03: Add Bounded Retry/Backoff and Sync-Attempt Tracking

**syncAnalysisEffect now retries transient Galaxy/Supabase/network failures with capped exponential backoff and persists sync-attempt metadata so the scheduler can avoid immediate re-selection.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-08-08T08:47:32Z
- **Completed:** 2026-08-08T08:56:12Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Wrapped `syncAnalysisEffect` in `Effect.retry` using `Schedule.exponential` capped via `Schedule.delayed` and bounded by `syncConfig.maxRetries`.
- Added `isTransientError` predicate that flags 503/429/network indicators while excluding permanent errors (missing analysis, ownership mismatch, generic 4xx).
- Ensured `Effect.scoped` stays inside the retry boundary so the lock finalizer runs for every attempt.
- Extended the initial analyses select to include `sync_attempts` and reset the tracking columns on a successful terminal update.
- Added a post-retry `Effect.catchAll` that increments `sync_attempts`, records `last_sync_error_at`, and schedules `next_sync_at` without swallowing the original error.
- Covered retry success, retry exhaustion, permanent-error no-retry, success reset, failure increment, and lock-skip behavior in `analysis.test.ts`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Effect.retry with transient-error predicate to syncAnalysisEffect** - `bb2eced119` (feat)
2. **Task 2: Add sync-attempt tracking updates on success and failure** - `101a95550d` (feat)
3. **Task 3: Update analysis tests to cover retry and sync-attempt behavior** - `89529a012b` (test)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` - Retry schedule, transient predicate, sync-attempt reset/increment, post-retry catchAll
- `packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts` - Retry and sync-attempt coverage helpers and assertions

## Decisions Made

- Used a mutable closure variable (`currentAnalysis`) to keep the analysis row in scope for the post-retry `catchAll`. The variable is scoped to a single `syncAnalysisEffect` call, so concurrent executions remain isolated.
- Chose `Effect.logError` (not `Effect.fail`) for sync-attempt update failures so the original Galaxy/Supabase error remains visible to operators.
- Logged retry exhaustion only when the final error is transient, avoiding misleading "exhausted" messages for permanent failures.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced `Schedule.capDelay` with `Schedule.delayed` + `Duration.toMillis`**
- **Found during:** Task 1
- **Issue:** Effect-TS 3.22 does not export `Schedule.capDelay`, causing a runtime `TypeError: Schedule.capDelay is not a function`.
- **Fix:** Capped exponential backoff using `Schedule.delayed(duration => Math.min(Duration.toMillis(duration), syncConfig.retryMaxDelayMs))`.
- **Files modified:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts`
- **Verification:** All analysis tests pass; `pnpm --filter ./packages/nuxt-galaxy typecheck` passes.
- **Committed in:** `bb2eced119` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Prevented sync-attempt update failure from swallowing the original error**
- **Found during:** Task 2
- **Issue:** The plan's catchAll example threw a new `SyncAnalysisError` inside `Effect.tryPromise.catch`, which would have replaced the original sync error with a DB write error.
- **Fix:** Wrapped the sync-attempt update in `Effect.catchAll` to log the DB error and then re-fail with `originalError`.
- **Files modified:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts`
- **Verification:** Exhaustion test asserts the original `Galaxy service is unavailable` error is preserved.
- **Committed in:** `101a95550d` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both fixes were necessary for correctness. No scope creep.

## Issues Encountered

- The `GalaxyServiceUnavailable` error maps to the message "Galaxy service is unavailable" (with "is"), so the `isTransientError` indicator list was widened to include "service is unavailable" in addition to "service unavailable".
- `pnpm --filter ./packages/nuxt-galaxy test` (non-server) fails on a pre-existing `types-export.test.ts` import error (`../dist/runtime/types/nuxt-galaxy.d.ts?raw` missing). The plan-targeted `test:server` suite and `typecheck` both pass; this failure is out of scope for 08-03.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 08-03 is complete. The retry/sync-attempt behavior is verified and type-safe.
- Ready for 08-05 (legacy Drizzle sync helper removal) and 08-06 (lock contention + batch summary tests).
- No blockers.

## Self-Check: PASSED

- [x] SUMMARY.md exists at `.planning/phases/08-consolidate-and-harden-the-server-driven-sync-path/08-03-SUMMARY.md`
- [x] Task commits found: `bb2eced119`, `101a95550d`, `89529a012b`
- [x] Metadata commit found: `b010dfe016`
- [x] `pnpm --filter ./packages/nuxt-galaxy test:server` passes (253 passed, 3 skipped)
- [x] `pnpm --filter ./packages/nuxt-galaxy typecheck` passes

---
*Phase: 08-consolidate-and-harden-the-server-driven-sync-path*
*Completed: 2026-08-08*
