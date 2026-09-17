---
phase: 08-consolidate-and-harden-the-server-driven-sync-path
fixed_at: 2026-08-08T16:19:00Z
review_path: .planning/phases/08-consolidate-and-harden-the-server-driven-sync-path/08-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 11
skipped: 0
status: all_fixed
---

# Phase 08: Code Review Fix Report

**Fixed at:** 2026-08-08T16:19:00Z
**Source review:** `.planning/phases/08-consolidate-and-harden-the-server-driven-sync-path/08-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 11
- Fixed: 11
- Skipped: 0

## Fixed Issues

### WR-01: Scheduled task ignores `next_sync_at`, defeating the backoff schedule

**Files modified:** `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts`, `packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts`
**Commit:** `f4f012d02e`
**Applied fix:** Added a `next_sync_at` filter and ordered the scheduled batch query by `next_sync_at` so the scheduler only picks up analyses whose backoff has expired. On-demand single-analysis calls remain unfiltered so admins can force a sync.

### WR-02: `acquireSyncLock` leaks raw RPC error messages to callers

**Files modified:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts`, `packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts`
**Commit:** `9957fa6569`
**Applied fix:** Replaced thrown and RPC-error `SyncLockError` messages with a constant generic message. Original Supabase/Postgres details are logged server-side via `Effect.logError` before the generic error is returned to callers. Updated the lock tests to expect the sanitized message.

### WR-03: Legacy cleanup migrated functions that are now dead code

**Files modified:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts`, `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/histories.ts`, `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/input.ts`
**Commit:** `0ef40443b5`
**Applied fix:** Removed the unused exported helpers (`updateAnalysisTerminalState`, `getAnalysisStderrEffect`, `isHistorySyncEffect`, `isInputDatasetSyncEffect`) plus their now-unreferenced private helpers and stale imports. Re-ran `grep` to confirm zero remaining references in `src` or `test`.

### WR-04: Duplicate monitoring-update logic with divergent backends

**Files modified:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts`, `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts`
**Commit:** `011cbdfd8f`
**Applied fix:** Introduced a shared pure helper `buildMonitoringUpdatePayload` in `analysisMonitoring.ts` that computes the outcome, timestamp, and error message for both the Drizzle-based and Supabase-based monitoring update paths, eliminating semantic drift between the two implementations.

### WR-05: Post-failure backoff uses a hardcoded 30 s base instead of runtime config

**Files modified:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts`, `packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts`
**Commit:** `011cbdfd8f`
**Applied fix:** Changed the scheduled backoff calculation to use `syncConfig.retryBaseDelayMs` and `syncConfig.retryMaxDelayMs` instead of hardcoded `30000`/`3600000`. Updated the corresponding test expectation.

### WR-06: No validation of `ModuleOptions` sync tunables

**Files modified:** `packages/nuxt-galaxy/src/module.ts`, `packages/nuxt-galaxy/test/module/tasks.test.ts`
**Commit:** `4d9238eaee`, `b99dc2384c`
**Applied fix:** Added validation in the module `setup` to ensure `syncBatchSize` and `syncLockTtlSeconds` are positive, `syncMaxRetries`/`syncRetryBaseDelayMs` are non-negative, and `syncRetryMaxDelayMs` is at least `syncRetryBaseDelayMs`. Added module-level tests for each invalid case and resolved the TypeScript `possibly undefined` warnings by applying defaults before validating.

### WR-07: Permanent errors still increment `sync_attempts` and schedule `next_sync_at`

**Files modified:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts`, `packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts`
**Commit:** `011cbdfd8f`
**Applied fix:** Updated the post-retry `catchAll` to only record `sync_attempts`/`last_sync_error_at`/`next_sync_at` when the original error is transient. Permanent errors such as ownership mismatch now fail fast without scheduling a retry. Added an assertion in the existing ownership-mismatch test.

### IN-01: `releaseSyncLock` catch interpolates unknown error directly

**Files modified:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts`
**Commit:** `9957fa6569`
**Applied fix:** Changed the `releaseSyncLock` catch clause to format the unknown error using the same `error instanceof Error ? error.message : String(error)` pattern used elsewhere.

### IN-02: `getAnalysisStderr` does not follow the `*Effect` naming convention

**Files modified:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts`
**Commit:** `011cbdfd8f`
**Applied fix:** Renamed `getAnalysisStderr` to `getAnalysisStderrEffect` and updated its single call site.

### IN-03: Test fixture includes an unselected `state` field in the datasets object

**Files modified:** `packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts`
**Commit:** `0787230284`
**Applied fix:** Removed the extraneous `state: 'ok'` field from the idempotency-skip fixture's `datasets` object.

### IN-04: Migration function parameter shadows the table column

**Files modified:** `packages/nuxt-galaxy/src/runtime/server/db/migrations/20260808071319_smart_tyrannus/migration.sql`
**Commit:** `502bb00e69`
**Applied fix:** Renamed the `acquire_sync_lock` parameters to `p_analysis_id` and `p_ttl_seconds` and updated the `VALUES` clause to use the prefixed parameter names, removing column shadowing.

## Skipped Issues

None — all findings were applied cleanly.

## Verification

All gates were run in the **main checkout** after fast-forwarding the review-fix branch; the isolated worktree could not execute tests/typechecks because the runtime environment raised `EDQUOT` write errors when generating caches/build artifacts (`pnpm install` succeeded, but `pnpm dev:prepare` and `vitest` failed with errno -122).

- `pnpm --filter ./packages/nuxt-galaxy test:server` — 35 files, 224 passed, 3 skipped
- `pnpm --filter ./packages/nuxt-galaxy test` — client 64 passed + server 224 passed / 3 skipped
- `pnpm --filter ./packages/nuxt-galaxy typecheck` — clean
- `pnpm --filter ./packages/nuxt-galaxy lint` — clean
- `pnpm test` (root) — blendtype, nuxt-galaxy, ui, wiki all green
- `pnpm lint` (root) — clean
- `pnpm typecheck` (root) — clean

---

_Fixed: 2026-08-08T16:19:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
