# Phase 8: consolidate-and-harden-the-server-driven-sync-path - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-07
**Phase:** 08-consolidate-and-harden-the-server-driven-sync-path
**Areas discussed:** Lock atomicity strategy, Retry/backoff policy, Sync attempt tracking semantics, Module options shape, Legacy cleanup scope

---

## Lock atomicity strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Supabase RPC calling a Postgres function | Add a `galaxy.acquire_sync_lock(analysis_id, ttl_seconds)` RPC that does `INSERT ... ON CONFLICT DO UPDATE ... WHERE expired` and returns a boolean. Cleanest race handling, requires a migration. | ✓ |
| Client-side upsert with conflict check | Use `supabase.from('sync_locks').upsert(...)` with a conflict resolution that re-queries and decides winner. Simpler migration-wise but still has edge cases. | |
| Raw SQL through a Drizzle RPC | Use the existing postgres/Drizzle connection to run the atomic upsert in one query. Keeps SQL visible in TypeScript but mixes Drizzle back into the canonical Supabase path. | |

**User's choice:** Supabase RPC calling a Postgres function
**Notes:** User asked for advice and accepted the recommendation. They also asked for a brief explanation of RPC/Postgres; confirmed it means creating a PostgreSQL function and calling it via `supabase.rpc()`.

---

## Retry/backoff policy

| Option | Description | Selected |
|--------|-------------|----------|
| Wrap the whole syncAnalysisEffect | Apply `Effect.retry` with exponential backoff around each analysis sync. Simple, catches Galaxy and DB failures in one place, but retries the whole analysis even if only one dataset upload failed. | ✓ |
| Retry Galaxy GET calls inside blendtype | Extend the existing `withRetry` policy in blendtype to cover the Galaxy calls used by sync. DB writes don't retry. More granular but requires blendtype changes. | |
| Layered: Galaxy retries in blendtype + analysis-level retry for DB | blendtype handles transient Galaxy HTTP errors; the sync path adds a small number of analysis-level retries for Supabase/DB transient failures. Most precise but slightly more code. | |
| You decide | Let the implementer choose the simplest approach that satisfies TEST-02. | |

**User's choice:** Wrap the whole syncAnalysisEffect, with the refinement of adding an idempotency guard in `sync/output.ts` to skip re-download/upload when the existing dataset row already has a `storage_object_id` and the Galaxy dataset state is unchanged.
**Notes:** User asked how retry would interact with Galaxy entity creation and object IDs. Clarified that `syncAnalysisEffect` only polls existing Galaxy entities by stable IDs and that DB writes are idempotent by Galaxy ID. The remaining concern was orphaned Supabase Storage objects on retry, addressed by the idempotency guard.

---

## Sync attempt tracking semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Lifetime attempts with exponential next_sync_at | `sync_attempts` increments on every failure and never resets. `next_sync_at = last_sync_error_at + min(maxBackoff, base * 2^attempts)`. On success, only `is_sync`/`state` are updated; attempts persist for future failure backoff. | |
| Reset on success with capped backoff | `sync_attempts` increments on failure and resets to 0 on success. `next_sync_at` is only set on failure using exponential backoff capped at a max. `last_sync_error_at` is null after success. | ✓ |
| Per-run counter only, no next_sync_at scheduling | `sync_attempts` increments each time the task attempts the analysis in a run and resets at task start. `next_sync_at` is set to now + fixed interval. Simpler but less informative for operators. | |
| You decide | Let the implementer choose reasonable semantics as long as TEST-02 can verify `sync_attempts` increments on repeated 503 failures. | |

**User's choice:** Reset on success with capped backoff
**Notes:** Agent decided this option because it gives operators a clean "currently failing" signal (`sync_attempts > 0`) and prevents unbounded backoff growth. User accepted via "You decide".

---

## Module options shape

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: lock TTL and batch size | Expose only `syncLockTtlSeconds` and `syncBatchSize`. Keeps the module surface small and matches the two hardcoded values today (900s, 20). | |
| Standard: TTL, batch size, retries, backoff | Expose `syncLockTtlSeconds`, `syncBatchSize`, `syncMaxRetries`, `syncRetryBaseDelayMs`, `syncRetryMaxDelayMs`. Covers REFACTOR-02 and REFACTOR-03 configuration needs. | ✓ |
| Nested sync object | Group all sync settings under a nested `galaxy.sync` object. Cleaner namespacing but a slightly larger config change. | |
| You decide | Let the implementer pick sensible defaults and expose only what is needed to satisfy the phase success criteria. | |

**User's choice:** Standard flat options
**Notes:** Agent decided on flat option names to match the existing `ModuleOptions` style (url, apiKey, runMigrations, useBlobUpload, logs). Defaults: `syncLockTtlSeconds` 900, `syncBatchSize` 20, `syncMaxRetries` 3, `syncRetryBaseDelayMs` 200, `syncRetryMaxDelayMs` 2000.

---

## Legacy cleanup scope

| Option | Description | Selected |
|--------|-------------|----------|
| Delete only the synchronize* functions | Remove the named legacy helpers but leave the rest of the files because they contain non-sync utilities still used elsewhere. | |
| Delete entire files where possible | After removing sync functions, check which files become entirely unused. `jobs.ts` and `datasets/output.ts` appear to be used only by legacy sync and can likely be deleted. | ✓ |
| You decide | Let the implementer remove dead code during refactoring; the success criterion only requires no remaining call sites or tests for the named legacy helpers. | |

**User's choice:** Delete entire files where possible
**Notes:** Agent noted that `analyses.ts`, `histories.ts`, and `datasets/input.ts` must stay because they contain non-sync utilities still used by API handlers. `jobs.ts` and `datasets/output.ts` are candidates for full deletion but must be verified during implementation.

---

## the agent's Discretion

- Retry schedule exact constructor and predicate details left to implementer.
- Postgres function return type and migration naming convention left to implementer.
- Whether `sync_attempts` columns are updated in the same Supabase call as the analysis state update or separately left to implementer, provided semantics in D-04 are preserved.

## Deferred Ideas

None — discussion stayed within Phase 8 scope.
