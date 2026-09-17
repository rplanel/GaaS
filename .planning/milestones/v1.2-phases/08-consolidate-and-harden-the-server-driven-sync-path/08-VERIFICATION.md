---
phase: 08-consolidate-and-harden-the-server-driven-sync-path
verified: 2026-08-08T16:32:00Z
status: passed
score: 19/19 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: null
  previous_score: null
  gaps_closed: []
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
behavior_unverified_items: []
human_verification: []
---

# Phase 08: Consolidate and Harden the Server-Driven Sync Path — Verification Report

**Phase Goal:** Replace legacy Drizzle sync helpers with a Supabase-RPC atomic lock, add sync-attempt tracking columns, wire sync tunables through the Nuxt module, and add bounded retry/backoff plus output-dataset idempotency so the server-driven sync path is the single source of truth.

**Verified:** 2026-08-08T16:32:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | `analyses` table exposes `sync_attempts`, `last_sync_error_at`, and `next_sync_at` columns. | VERIFIED | `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts` lines 38–40; migration.sql lines 3–6; `database.ts` lines 21–29, 40–48, 58–67. |
| 2   | PostgreSQL function `galaxy.acquire_sync_lock` exists and performs atomic upsert with expired-lock reclaim. | VERIFIED | `migration.sql` lines 9–29 uses `INSERT ... ON CONFLICT ... WHERE expires_at <= now`. |
| 3   | `acquireSyncLock` invokes `supabase.rpc('acquire_sync_lock', { analysis_id, ttl_seconds })` and returns the boolean result. | VERIFIED | `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts` lines 23–27, 40; `lock.test.ts` lines 37–46 asserts exact RPC name and parameter object. |
| 4   | Generated Drizzle migration is present and aligns with the schema. | VERIFIED | Directory `packages/nuxt-galaxy/src/runtime/server/db/migrations/20260808071319_smart_tyrannus/` exists; `migration.sql` contains matching `ALTER TABLE` and function; generated `database.ts` types include the new columns and function schema. |
| 5   | `ModuleOptions` exposes `syncLockTtlSeconds`, `syncBatchSize`, `syncMaxRetries`, `syncRetryBaseDelayMs`, and `syncRetryMaxDelayMs` with documented defaults. | VERIFIED | `packages/nuxt-galaxy/src/module.ts` lines 86–120; defaults at lines 167–171; validation at lines 190–205. |
| 6   | `runtimeConfig.galaxy.sync` carries the five sync values in private config, not public config. | VERIFIED | `packages/nuxt-galaxy/src/module.ts` lines 246–253 populate private `runtimeConfig.galaxy.sync`; `PublicRuntimeConfig` augmentation (lines 413–417) contains only `url` and `useBlobUpload`. |
| 7   | `galaxy:sync-analyses` reads `batchSize` and `lockTtlSeconds` from `useRuntimeConfig().galaxy.sync` instead of hardcoded `PAGE_SIZE = 20` or `900`. | VERIFIED | `sync-analyses.ts` lines 32–33, 75–77; grep for `PAGE_SIZE` and `acquireSyncLock(..., 900)` in the task returns no matches; `sync-analyses.test.ts` lines 185–189 asserts range `[0, 19]` from `batchSize: 20`. |
| 8   | `syncAnalysisEffect` accepts a `SyncConfig` object and forwards `lockTtlSeconds` to `acquireSyncLock`. | VERIFIED | `sync/analysis.ts` lines 124–129, 134; `analysis.test.ts` passes `defaultSyncConfig` to every invocation. |
| 9   | `syncAnalysisEffect` retries transient Galaxy/Supabase/network errors with bounded exponential backoff up to `maxRetries`. | VERIFIED | `sync/analysis.ts` lines 318–326; `analysis.test.ts` lines 484–512 verifies retry success after transient error and exhaustion after `maxRetries + 1` attempts. |
| 10  | Permanent failures (4xx, missing analysis, ownership mismatch) are not retried. | VERIFIED | `sync/analysis.ts` lines 333–334; `analysis.test.ts` lines 528–541 verifies missing-analysis path does not retry and `getCount()` is 0. |
| 11  | On success the `analyses` row resets `sync_attempts` to 0 and clears `last_sync_error_at` and `next_sync_at`. | VERIFIED | `sync/analysis.ts` lines 225–227; `analysis.test.ts` lines 543–563 asserts the exact update payload. |
| 12  | On transient failure after retry exhaustion, the row increments `sync_attempts` and schedules `next_sync_at` using exponential backoff. | VERIFIED | `sync/analysis.ts` lines 332–360; `analysis.test.ts` lines 565–590 asserts the payload and verifies the delay calculation uses `syncConfig.retryBaseDelayMs * 2 ** sync_attempts` capped by `syncConfig.retryMaxDelayMs`. |
| 13  | `syncOutputDatasetEffect` skips download/upload when the existing output dataset already has a `storage_object_id` and its state equals the Galaxy dataset state. | VERIFIED | `sync/output.ts` lines 111–113; `output.test.ts` lines 174–200 asserts `mockStorageUpload` is not called and no insert/update occurs. |
| 14  | Normal upload path still runs for new or changed output datasets. | VERIFIED | `output.test.ts` lines 202–255 (new dataset stream) and lines 257–306 (state differs) both exercise upload/update. |
| 15  | Per-analysis failures in `galaxy:sync-analyses` are caught via `Effect.match` and do not abort the batch. | VERIFIED | `sync-analyses.ts` lines 89–96; `sync-analyses.test.ts` lines 194–211 and 213–244 verify mixed-failure and all-failure batch counts. |
| 16  | Lock release finalizer remains registered before fallible operations in `syncAnalysisEffect`. | VERIFIED | `sync/analysis.ts` lines 139–145 registers `Effect.addFinalizer` immediately after successful lock acquisition and before analysis fetch; `Effect.scoped` is inside the retry boundary at line 312. |
| 17  | Legacy `synchronize*Effect` helpers are removed from all source and test files. | VERIFIED | `grep -R 'synchronize\w*Effect' packages/nuxt-galaxy/src packages/nuxt-galaxy/test` returns no matches. |
| 18  | `jobs.ts` and `datasets/output.ts` are deleted and non-sync utilities remain intact. | VERIFIED | Both files are absent; `analyses.ts`, `histories.ts`, and `datasets/input.ts` still export non-sync utilities; package typecheck and test:server pass. |
| 19  | Lock contention and batch summary behavior are covered by tests, and root quality gates pass. | VERIFIED | `lock.test.ts` lines 69–87; `sync-analyses.test.ts` lines 213–244; root `pnpm lint`, `pnpm typecheck`, and `pnpm test` all exit 0. |

**Score:** 19/19 truths verified (0 present-but-behavior-unverified)

### Accepted Deviations from Original Plan Must-Haves

The following deviations were identified during code review (`08-REVIEW.md`) and applied in `08-REVIEW-FIX.md`; they do not block goal achievement:

1. **Scheduled backoff formula:** The original `08-03-PLAN.md` specified `next_sync_at = now() + min(30s * 2^sync_attempts, 1h)`. Review finding WR-05 changed the implementation to use `syncConfig.retryBaseDelayMs * 2^sync_attempts` capped by `syncConfig.retryMaxDelayMs` so scheduled backoff is consistent with in-process retry configuration. The test expectation was updated accordingly.
2. **Permanent-error sync-attempt updates:** The original `08-03-PLAN.md` stated that failures after retry exhaustion increment `sync_attempts`. Review finding WR-07 narrowed this so only transient errors increment the counter and schedule a retry; permanent errors (e.g., ownership mismatch) fail fast without scheduling a futile retry.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts` | Schema includes sync-attempt columns. | VERIFIED | `syncAttempts`, `lastSyncErrorAt`, `nextSyncAt` defined. |
| `packages/nuxt-galaxy/src/runtime/server/db/migrations/20260808071319_smart_tyrannus/migration.sql` | Adds columns and atomic lock function. | VERIFIED | `ALTER TABLE` and `CREATE OR REPLACE FUNCTION galaxy.acquire_sync_lock` present. |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts` | RPC-based lock helper with sanitized errors. | VERIFIED | Uses `supabase.schema('galaxy').rpc('acquire_sync_lock', ...)`, generic `SyncLockError` messages, server-side error logging. |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` | Retry, transient predicate, sync-attempt tracking. | VERIFIED | `isTransientError`, `Effect.retry`, `SyncConfig`, success/failure column updates all present. |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts` | Idempotency guard before upload. | VERIFIED | Guard at lines 111–113; selects `storage_object_id` from joined datasets. |
| `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` | Config-driven batch query with `next_sync_at` filter and per-analysis isolation. | VERIFIED | Reads `useRuntimeConfig().galaxy.sync`, filters `next_sync_at`, wraps each effect in `Effect.match`. |
| `packages/nuxt-galaxy/src/module.ts` | Sync tunables, validation, private runtime config. | VERIFIED | All five options, defaults, validation, and `RuntimeConfig` augmentation present. |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts` | Non-sync utilities retained, legacy helpers removed. | VERIFIED | Exports `runAnalysis`, `deleteAnalysis`, `insertAnalysis`, `getAnalysis`, `updateAnalysisState`, etc.; no `synchronize*Effect`. |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/histories.ts` | Non-sync utilities retained, legacy helpers removed. | VERIFIED | Exports `getHistoryDb`, `addHistoryEffect`, etc.; no `synchronizeHistoryEffect`. |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/input.ts` | Non-sync utilities retained, legacy helper removed. | VERIFIED | Exports input-dataset helpers; no `synchronizeInputDatasetEffect`. |
| `packages/nuxt-galaxy/src/runtime/types/database.ts` | Generated types include new columns/function. | VERIFIED | `sync_attempts`, `last_sync_error_at`, `next_sync_at`, and `acquire_sync_lock` function present. |
| `packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts` | RPC contract + contention tests. | VERIFIED | 6 tests covering RPC parameters, true/false/null returns, error handling, and acquire/release/re-acquire. |
| `packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts` | Retry, permanent-error, sync-attempt update tests. | VERIFIED | 12 tests covering all specified behaviors. |
| `packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts` | Idempotency skip/upload tests. | VERIFIED | Tests for unchanged skip, state-differ update, terminal-ok stream, and error paths. |
| `packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts` | Batch summary count tests. | VERIFIED | Tests for mixed-failure, all-failure, and `next_sync_at` query assertions. |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/jobs.ts` | Deleted. | VERIFIED | File absent. |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/output.ts` | Deleted. | VERIFIED | File absent. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `migration.sql` function definition | `lock.ts` RPC call | `supabase.schema('galaxy').rpc('acquire_sync_lock', { analysis_id, ttl_seconds })` | WIRED | Function params `p_analysis_id`, `p_ttl_seconds` mapped from call object. |
| `analyses.ts` Drizzle schema | `migration.sql` | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` | WIRED | Column names and types match (`sync_attempts` integer default 0 not null, `last_sync_error_at`/`next_sync_at` timestamp tz). |
| `module.ts` `ModuleOptions` defaults | `runtimeConfig.galaxy.sync` | `defu` merge in `setup` | WIRED | `syncLockTtlSeconds` etc. mapped to `lockTtlSeconds` etc. at lines 246–253. |
| `runtimeConfig.galaxy.sync` | `sync-analyses.ts` batch query | `useRuntimeConfig().galaxy.sync` | WIRED | Lines 32–33 read `syncConfig.batchSize` and `syncConfig.lockTtlSeconds`. |
| `sync-analyses.ts` | `syncAnalysisEffect` | Passes `syncConfig` as fifth argument | WIRED | Lines 45, 90. |
| `syncAnalysisEffect` | `acquireSyncLock` | Forwards `syncConfig.lockTtlSeconds` | WIRED | Line 134. |
| `transient-error predicate` | `Effect.retry` schedule | `while: isTransientError` | WIRED | Lines 318–326. |
| `Effect.retry` | `sync_attempts` update | Post-retry `catchAll` updates columns on transient errors | WIRED | Lines 332–360. |
| `lock.ts` `Effect.addFinalizer` | Lock release on success/failure/retry | Registered immediately after acquisition, before fallible ops | WIRED | Lines 139–145; `Effect.scoped` inside retry boundary at line 312. |
| `syncOutputDatasetEffect` | skip decision | Guard compares `existing.datasets.storage_object_id` and `existing.state === galaxyDataset.state` | WIRED | Lines 111–113. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `sync-analyses.ts` | `page` / `page.data` | Supabase query on `galaxy.analyses` with `next_sync_at` filter | DB query + filter | FLOWING |
| `syncAnalysisEffect` | `analysis` | Supabase select from `galaxy.analyses` including `sync_attempts` | DB query | FLOWING |
| `syncAnalysisEffect` | `acquired` | `supabase.rpc('acquire_sync_lock', ...)` | RPC boolean result | FLOWING |
| `syncOutputDatasetEffect` | `existing` | Supabase select from `galaxy.analysis_outputs` joined with `datasets` | DB query | FLOWING |
| `syncOutputDatasetEffect` | `galaxyDataset` | `blendtype.getDatasetEffect(...)` | Galaxy API | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Root lint gate | `pnpm lint` | 4 packages lint clean, exit 0 | PASS |
| Root typecheck gate | `pnpm typecheck` | 4 packages typecheck clean, exit 0 | PASS |
| Root test gate | `pnpm test` | blendtype 144 passed; nuxt-galaxy 64 + 224 passed / 3 skipped; ui 12 passed; wiki 5 passed; exit 0 | PASS |
| No legacy helper references | `grep -R 'synchronize\w*Effect' packages/nuxt-galaxy/src packages/nuxt-galaxy/test` | No matches | PASS |
| Deleted files absent | `test -f packages/nuxt-galaxy/src/runtime/server/utils/grizzle/jobs.ts` and `.../datasets/output.ts` | Both DELETED | PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
| ----------- | -------------- | ----------- | ------ | -------- |
| REFACTOR-01 | 08-05 | Remove legacy Drizzle sync helpers and migrate callers. | SATISFIED | Zero `synchronize*Effect` references; `jobs.ts`/`datasets/output.ts` deleted; non-sync utilities retained and tests pass. |
| REFACTOR-02 | 08-01, 08-02, 08-06 | Atomic `sync_locks` acquisition; configurable TTL and batch size. | SATISFIED | `galaxy.acquire_sync_lock` RPC function; `ModuleOptions` sync tunables; `runtimeConfig.galaxy.sync` wired through to `acquireSyncLock` and batch query; lock contention tests pass. |
| REFACTOR-03 | 08-01, 08-03, 08-04 | Retry/backoff for transient failures; `sync_attempts`/`last_sync_error_at`/`next_sync_at` tracking; output idempotency. | SATISFIED | `isTransientError` + `Effect.retry`; column reset on success and increment/schedule on transient failure; idempotency guard in `syncOutputDatasetEffect`; tests pass. |
| REFACTOR-04 | 08-04, 08-06 | Per-analysis failures do not crash batch; locks released via `Effect.addFinalizer` even on failure. | SATISFIED | `Effect.match` in `sync-analyses.ts`; finalizer registered before fallible ops; batch summary tests pass. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| None | — | — | — | No `TBD`/`FIXME`/`XXX`/`TODO` markers, no placeholder returns, no `console.log` only implementations, and no hardcoded empty stubs found in modified source files. |

### Human Verification Required

None. All Phase 08 must-haves are verified by automated checks and tests.

### Gaps Summary

No gaps found. Phase 08 goal is achieved in the codebase.

---

_Verified: 2026-08-08T16:32:00Z_
_Verifier: the agent (gsd-verifier)_
