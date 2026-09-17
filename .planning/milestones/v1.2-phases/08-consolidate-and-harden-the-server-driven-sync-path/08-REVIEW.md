---
phase: 08-consolidate-and-harden-the-server-driven-sync-path
reviewed: 2026-08-08T15:55:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - packages/nuxt-galaxy/src/module.ts
  - packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts
  - packages/nuxt-galaxy/src/runtime/server/db/migrations/20260808071319_smart_tyrannus/migration.sql
  - packages/nuxt-galaxy/src/runtime/server/db/migrations/20260808071319_smart_tyrannus/snapshot.json
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/histories.ts
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/input.ts
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts
  - packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
  - packages/nuxt-galaxy/src/runtime/types/database.ts
  - packages/nuxt-galaxy/test/server/setup.ts
  - packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts
  - packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts
  - packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts
  - packages/nuxt-galaxy/test/server/utils/grizzle/analyses.test.ts
  - packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts
  - packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts
  - packages/nuxt-galaxy/test/types-export.test.ts
  - eslint.config.mjs
findings:
  critical: 0
  warning: 7
  info: 4
  total: 11
status: fixed
---

# Phase 08: Code Review Report

**Reviewed:** 2026-08-08T15:55:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Phase 08 replaces the legacy Drizzle-driven sync helpers with a Supabase-RPC atomic lock, adds sync-attempt tracking columns, wires sync tunables through `ModuleOptions`, and adds bounded retry/backoff plus output-dataset idempotency. The implementation compiles (`pnpm --filter ./packages/nuxt-galaxy typecheck` passes) and the server test suite passes (224 passed, 3 skipped). However, several logic, security, and maintainability gaps remain: the scheduler does not respect the `next_sync_at` backoff it writes, lock errors leak raw database details, legacy cleanup left dead code behind, and the retry/backoff math is inconsistent with the documented configuration.

## Warnings

### WR-01: Scheduled task ignores `next_sync_at`, defeating the backoff schedule

**File:** `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts:68-76`
**Issue:** The batch query selects pending analyses with `.or('is_sync.eq.false,state.in.(new,requires_materialization,ready,scheduled,cancelling)')` but never filters on `next_sync_at`. The `syncAnalysisEffect` writes `next_sync_at` after exhausted retries (analysis.ts:338-347), yet the task will re-select that analysis on the next 30-second tick regardless of whether the backoff time has passed. This turns the exponential backoff into a tight 30-second retry loop and can hammer Galaxy/Supabase for permanently failing analyses.
**Fix:** Add a `next_sync_at` predicate to the batch query, e.g.:
```typescript
.or('is_sync.eq.false,state.in.(new,requires_materialization,ready,scheduled,cancelling)')
.or('next_sync_at.is.null,next_sync_at.lte.' + new Date().toISOString())
.order('next_sync_at', { ascending: true })
```
Also apply the same guard in the single-analysis path if on-demand calls should respect the backoff.

### WR-02: `acquireSyncLock` leaks raw RPC error messages to callers

**File:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts:25-32`
**Issue:** Both the `catch` branch and the RPC-error branch construct `SyncLockError` with the original Supabase/Postgres message (`error.message`). Phase 08's threat model T-08-01-02 explicitly requires returning a generic `SyncLockError` to Effect callers while logging the original detail server-side only. The current code violates that contract and can expose internal database errors to upstream consumers.
**Fix:** Return a constant, generic message; log the detail instead:
```typescript
catch: error =>
  new SyncLockError({ message: 'Failed to acquire sync lock' }),
// ...
if (error) {
  return yield* Effect.fail(
    new SyncLockError({ message: 'Failed to acquire sync lock' }),
  )
}
```
Use `Effect.logError('acquire sync lock failed', { message: error.message })` before failing to preserve server-side observability.

### WR-03: Legacy cleanup migrated functions that are now dead code

**Files:**
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts:194-246,289-316`
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/histories.ts:213-232`
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/input.ts:221-226`
**Issue:** 08-05 moved `updateAnalysisTerminalState`, `getAnalysisStderrEffect`, `isHistorySyncEffect`, and `isInputDatasetSyncEffect` into consumers to avoid deleting files that still had non-sync callers. None of these functions are referenced anywhere in `packages/nuxt-galaxy/src` or `packages/nuxt-galaxy/test` (verified with `grep`). They increase maintenance surface and can mislead future reviewers into thinking they are part of the canonical sync path.
**Fix:** Remove the unused functions, or if they are intentionally retained for a future phase, add `// TODO(phase-X): wire ...` comments and tests. Re-run `grep` after deletion to confirm zero references.

### WR-04: Duplicate monitoring-update logic with divergent backends

**Files:**
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts:82-121`
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts:147-190`
**Issue:** `updateAnalysisMonitoringOutcome` (Supabase-based, in analysis.ts) and `updateAnalysisMonitoringEffect` (Drizzle-based, in analysisMonitoring.ts) both update `analysis_monitoring` with the same outcome semantics. The sync path uses the Supabase version while the rest of the codebase uses the Drizzle version. This duplication risks drift (e.g., timestamp formats, error-message handling) and makes it unclear which implementation is canonical.
**Fix:** Consolidate on one implementation. The sync path should call the existing Drizzle-based `updateAnalysisMonitoringEffect` (or a shared wrapper) instead of re-implementing the update in Supabase.

### WR-05: Post-failure backoff uses a hardcoded 30 s base instead of runtime config

**File:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts:337`
**Issue:** After retries are exhausted, the catchAll computes the next scheduled attempt as `Math.min(30000 * 2 ** analysis.sync_attempts, 3600000)`. This hardcoded 30-second base is unrelated to `syncConfig.retryBaseDelayMs` (default 200 ms) used for in-process retries. Users who tune `syncRetryBaseDelayMs` will be surprised that scheduled backoff still starts at 30 seconds.
**Fix:** Derive the scheduled backoff from config, e.g.:
```typescript
const baseDelayMs = syncConfig.retryBaseDelayMs
const delayMs = Math.min(baseDelayMs * 2 ** analysis.sync_attempts, syncConfig.retryMaxDelayMs)
```
Then apply the WR-01 filter so the scheduler actually honors the computed time.

### WR-06: No validation of `ModuleOptions` sync tunables

**File:** `packages/nuxt-galaxy/src/module.ts:159-172`
**Issue:** The five new sync options accept any number, including zero or negative values. `batchSize: 0` causes `sync-analyses.ts:76` to call `.range(offset, offset - 1)`, which is either an error or an empty result from Supabase. `maxRetries: -1` would break `Effect.retry` expectations. `lockTtlSeconds: 0` produces locks that expire immediately.
**Fix:** Add validation in the module `setup` (or with a helper) to ensure:
```typescript
if (!(moduleOptions.syncBatchSize > 0)) throw new Error('syncBatchSize must be positive')
if (!(moduleOptions.syncMaxRetries >= 0)) throw new Error('syncMaxRetries must be non-negative')
if (!(moduleOptions.syncLockTtlSeconds > 0)) throw new Error('syncLockTtlSeconds must be positive')
if (!(moduleOptions.syncRetryBaseDelayMs >= 0)) throw new Error('syncRetryBaseDelayMs must be non-negative')
if (!(moduleOptions.syncRetryMaxDelayMs >= moduleOptions.syncRetryBaseDelayMs)) throw new Error('syncRetryMaxDelayMs must be >= syncRetryBaseDelayMs')
```

### WR-07: Permanent errors still increment `sync_attempts` and schedule `next_sync_at`

**File:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts:331-359`
**Issue:** The post-retry `catchAll` updates `sync_attempts`/`last_sync_error_at`/`next_sync_at` for every error after `currentAnalysis` is set, including permanent failures such as `Ownership mismatch` (analysis.ts:165-167). This schedules retries for conditions that will never resolve on their own.
**Fix:** Only update sync-attempt metadata when `isTransientError(originalError)` is true. Permanent errors should fail fast without incrementing the retry counter or scheduling a future attempt:
```typescript
Effect.catchAll((originalError) => {
  if (!currentAnalysis || !isTransientError(originalError)) {
    return Effect.fail(originalError)
  }
  // ... increment and schedule ...
})
```

## Info

### IN-01: `releaseSyncLock` catch interpolates unknown error directly

**File:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts:56`
**Issue:** The catch clause builds the message with `${e}` where `e` is `unknown`. While template-literal coercion works, it is inconsistent with the rest of the codebase (which extracts `error.message` or uses `String(error)`) and can produce unhelpful messages for non-Error throwables.
**Fix:** Use the same helper pattern as `acquireSyncLock`:
```typescript
catch: error =>
  new SyncLockError({ message: `Failed to release sync lock: ${error instanceof Error ? error.message : String(error)}` }),
```

### IN-02: `getAnalysisStderr` does not follow the `*Effect` naming convention

**File:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts:45`
**Issue:** The helper returns an `Effect.Effect<...>` but is named `getAnalysisStderr` without the conventional `Effect` suffix used throughout the project (e.g., `syncJobEffect`, `syncOutputDatasetEffect`).
**Fix:** Rename to `getAnalysisStderrEffect` for consistency.

### IN-03: Test fixture includes an unselected `state` field in the datasets object

**File:** `packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts:184`
**Issue:** The idempotency skip fixture contains `datasets: { ..., state: 'ok' }`, but the production select in output.ts:53 is `datasets!inner(id, galaxy_id, storage_object_id)` and does not include `state`. The test still passes because the guard reads `existing.state` (from `analysis_outputs`), but the fixture is misleading.
**Fix:** Remove the `state` field from the `datasets` object in the fixture, or add a comment explaining it is intentionally extraneous.

### IN-04: Migration function parameter shadows the table column

**File:** `packages/nuxt-galaxy/src/runtime/server/db/migrations/20260808071319_smart_tyrannus/migration.sql:9-11,20`
**Issue:** The function parameter `analysis_id` has the same name as the `sync_locks.analysis_id` column. PL/pgSQL resolves it correctly here, but the shadowing makes the migration harder to read and slightly increases the risk of a future edit introducing ambiguity.
**Fix:** Rename the parameter to `p_analysis_id` (and `p_ttl_seconds`) and update the `VALUES` clause accordingly.

---

_Reviewed: 2026-08-08T15:55:00Z_
_Reviewer: gsd-code-reviewer_
_Depth: standard_
