# Phase 8: consolidate-and-harden-the-server-driven-sync-path - Context

**Gathered:** 2026-08-07
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase removes the legacy Drizzle-based sync helpers and hardens the canonical Supabase-based server-driven sync path. It makes the sync path the single source of truth by deleting dead code, replacing the read-delete-insert lock with an atomic upsert, adding retry/backoff for transient failures, tracking sync attempts in the `analyses` table, and ensuring per-analysis failures do not crash the batch scheduled task.

</domain>

<decisions>
## Implementation Decisions

### Lock atomicity

- **D-01:** Implement `acquireSyncLock` as a Supabase RPC call to a new PostgreSQL function `galaxy.acquire_sync_lock(analysis_id integer, ttl_seconds integer)` that performs an atomic `INSERT ... ON CONFLICT (analysis_id) DO UPDATE SET locked_at = EXCLUDED.locked_at, expires_at = EXCLUDED.expires_at WHERE sync_locks.expires_at <= now()` and returns a boolean. The TypeScript side calls `supabase.rpc('acquire_sync_lock', { analysis_id, ttl_seconds })`. — **Reversibility:** one-way — requires a Drizzle migration to create and later drop the function.

### Retry/backoff policy

- **D-02:** Apply `Effect.retry` around the whole `syncAnalysisEffect` for transient failures. Retry schedule: exponential backoff, base delay 200ms, doubling each attempt, max delay 2s, max 3 retries (4 attempts total). Retry only on transient errors: Galaxy HTTP 503/429, Supabase 429, and network/connection errors. Do not retry permanent errors such as 4xx client errors, ownership mismatch, or missing analysis. — **Reversibility:** costly — changes the sync flow and test expectations.
- **D-03:** Add an idempotency guard in `sync/output.ts` before dataset download/upload: if the existing local dataset row already has a `storage_object_id` and the Galaxy dataset state has not changed, reuse the existing storage reference and skip the download/upload. This prevents orphaned storage objects when the analysis-level retry re-runs. — **Reversibility:** reversible — logic change only.

### Sync attempt tracking

- **D-04:** Add `sync_attempts`, `last_sync_error_at`, and `next_sync_at` columns to the `analyses` table via a Drizzle migration. On sync failure: increment `sync_attempts`, set `last_sync_error_at = now()`, and set `next_sync_at = now() + min(30s * 2^sync_attempts, 1h)`. On sync success: reset `sync_attempts = 0`, clear `last_sync_error_at`, and set `next_sync_at = null`. These updates are written alongside the existing analysis state update in the same Supabase call when possible. — **Reversibility:** one-way — requires a migration to add and later remove columns.

### Module options

- **D-05:** Expose sync configuration as flat options on `ModuleOptions` (matching the existing flat style): `syncLockTtlSeconds` (default 900), `syncBatchSize` (default 20), `syncMaxRetries` (default 3), `syncRetryBaseDelayMs` (default 200), `syncRetryMaxDelayMs` (default 2000). Pass them through `runtimeConfig.galaxy.sync` so the scheduled task and sync helpers can read them. — **Reversibility:** costly — changes the public module API.

### Legacy cleanup

- **D-06:** Remove the named legacy sync helpers (`synchronizeAnalysisEffect`, `synchronizeJobEffect`, `synchronizeHistoryEffect`, `synchronizeInputDatasetEffect`, `synchronizeOutputDatasetEffect`, and `synchronizeOutputDatasetsEffect`). After removal, delete entire files that become entirely unused; based on the Phase 6/7 inventory `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/jobs.ts` and `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/output.ts` are candidates for full deletion. Verify no remaining callers or tests reference the deleted code. Keep `analyses.ts`, `histories.ts`, and `datasets/input.ts` because they contain non-sync utilities still used by API handlers. — **Reversibility:** costly — deleting code is easy to undo with git but affects file structure and imports.

### Per-analysis failure isolation

- **D-07:** Keep the existing pattern in `sync-analyses.ts` where each `syncAnalysisEffect` is run through `Effect.match` so a single failure increments the batch `failed` count and appends to `errors` without crashing the batch. Ensure `syncAnalysisEffect` continues to register `Effect.addFinalizer` for lock release even when retries are exhausted and the effect fails. — **Reversibility:** reversible — behavior-preserving hardening.

### the agent's Discretion

- The implementer chooses the exact `Effect.retry` schedule constructor, the Postgres function return shape, and the migration naming convention, as long as the decisions above are satisfied.
- The implementer decides whether to update `sync_attempts` in a separate Supabase call or within the existing analysis update, provided the values remain consistent with D-04.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning and requirements

- `.planning/ROADMAP.md` — Phase 8 scope, success criteria, and v1.2 milestone plan.
- `.planning/REQUIREMENTS.md` — REFACTOR-01, REFACTOR-02, REFACTOR-03, REFACTOR-04 and traceability to later phases.
- `.planning/PROJECT.md` — v1.1 green baseline, evlog conventions, and current milestone goals.
- `.planning/LOGGING-SPEC.md` — Authority on which surface uses which logger, wide-event shape, severity usage, and secret-redaction rules.
- `.planning/phases/06-audit-and-freeze-the-sync-contract/06-CONTEXT.md` — Locked Phase 6 decisions: canonical sync path, legacy helper deferral, freeze/sign-off rules.
- `.planning/phases/07-standardize-evlog-traces/07-CONTEXT.md` — Locked Phase 7 decisions: log severity policy, flat six-ID trace schema, task finalizer wide event, sensitive-data guardrails.

### Canonical sync path

- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` — `syncAnalysisEffect`: lock, invocation fetch, state transition, job/output iteration.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts` — `syncJobEffect`: job upsert against Supabase.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts` — `syncOutputDatasetEffect`: dataset fetch, stream download, storage upload, output link; add idempotency guard here.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts` — `acquireSyncLock` / `releaseSyncLock`: replace with atomic RPC.
- `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` — `galaxy:sync-analyses` Nitro scheduled task, paging, single-analysis payload path.

### Data model and module wiring

- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts` — `analyses` table; add `sync_attempts`, `last_sync_error_at`, `next_sync_at` columns here and generate a migration.
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/syncLocks.ts` — `sync_locks` table schema; the new RPC operates on this table.
- `packages/nuxt-galaxy/src/module.ts` — add sync options to `ModuleOptions` and `runtimeConfig.galaxy.sync`.
- `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts` — `runTaskEffect` / `runGalaxyEffect` bridge; retry logs remain routed to evlog.

### Legacy sync helpers (to be removed)

- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts` — remove `synchronizeJobsEffect`, `synchronizeAnalysisEffect`, `synchronizeAnalysesEffect`; keep non-sync utilities.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/histories.ts` — remove `synchronizeHistoryEffect`; keep non-sync utilities.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/jobs.ts` — candidate for full deletion; verify no non-sync callers remain.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/input.ts` — remove `synchronizeInputDatasetEffect`; keep non-sync utilities.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/output.ts` — candidate for full deletion; verify no non-sync callers remain.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets

- The canonical Supabase-based sync path in `grizzle/sync/` is already the scheduled task's implementation; harden it in place.
- `runTaskEffect` in `evlog-effect.ts` remains the execution bridge for the scheduled task.
- The flat six-ID trace schema from Phase 7 is already wired into the sync helpers; keep it when adding new log points.

### Established patterns

- The scheduled task currently pages analyses with a hardcoded `PAGE_SIZE = 20` and calls `syncAnalysisEffect` per row wrapped in `Effect.match` for batch isolation.
- `syncAnalysisEffect` already registers `Effect.addFinalizer` for lock release; this must remain compatible with the new outer retry.
- The module uses flat `ModuleOptions` (url, apiKey, email, databaseUrl, runMigrations, useBlobUpload, logs); new sync options should follow the same flat style.

### Integration points

- `packages/nuxt-galaxy/src/module.ts` registers the scheduled task and exposes runtime config; sync options must flow through to `runtimeConfig.galaxy.sync`.
- The Drizzle migration for `analyses` columns and the Postgres function must be generated with `drizzle-kit generate` and applied via `supabase:migration:up` / `drizzle:migrate`.
- Supabase type generation (`supabase:generate:types`) must be re-run after schema changes so `Database` types include the new columns.

</code_context>

<specifics>
## Specific Ideas

- The Postgres function can return `boolean` directly; TypeScript sees the RPC result as `{ data: boolean, error: ... }`.
- When deleting `jobs.ts`, check whether `isJobTerminalState` or `getAnalysisStderrEffect` are referenced outside legacy sync. If they are, migrate them to the canonical path or to a shared helper before deletion.
- When deleting `datasets/output.ts`, confirm that `insertAnalysisOutputEffect`/`insertAnalysisOutputTags` are not used by the canonical `sync/output.ts` path; the canonical path currently has its own inline inserts.
- Consider adding a composite index on `analyses(next_sync_at, is_sync)` if the scheduled task is later changed to respect `next_sync_at`; this phase only adds the columns and writes them.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 8 scope.

</deferred>

---

*Phase: 08-consolidate-and-harden-the-server-driven-sync-path*
*Context gathered: 2026-08-07*
