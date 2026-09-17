---
phase: 08-consolidate-and-harden-the-server-driven-sync-path
plan: 01
subsystem: database
tags: [drizzle, postgresql, supabase, rpc, sync-lock, effect-ts]

requires:
  - phase: 06-audit-and-freeze-the-sync-contract
    provides: Canonical sync path contract and legacy helper inventory
  - phase: 07-standardize-evlog-traces
    provides: Structured evlog trace annotations on sync path

provides:
  - analyses table columns for sync attempt tracking
  - Atomic PostgreSQL function galaxy.acquire_sync_lock via Supabase RPC
  - RPC-based acquireSyncLock helper with old read-delete-insert logic removed
  - Unit test verifying RPC contract and integration test compatibility

affects:
  - 08-02-wire-sync-lock-ttl-batch-size-and-retry-config
  - 08-03-add-bounded-retry-and-sync-attempt-tracking-updates
  - 08-04-add-output-dataset-idempotency-guard

actuals:
  tokens: 40423
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Supabase RPC for atomic database operations across trust boundaries"
    - "Drizzle-generated migration augmented with hand-written PostgreSQL function"
    - "Effect-TS tagged error preserved when wrapping RPC result"

key-files:
  created:
    - packages/nuxt-galaxy/src/runtime/server/db/migrations/20260808071319_smart_tyrannus/migration.sql
    - packages/nuxt-galaxy/src/runtime/server/db/migrations/20260808071319_smart_tyrannus/snapshot.json
  modified:
    - packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
    - packages/nuxt-galaxy/src/runtime/types/database.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts
    - packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts
    - eslint.config.mjs

key-decisions:
  - "Used the auto-generated Drizzle migration directory name instead of renaming it, per plan prohibition against manually invented migration names"
  - "Added generated Supabase types file to ESLint ignores because Supabase CLI v2.109.1 now emits double-quoted TypeScript that violates project style rules"

patterns-established:
  - "Atomic lock acquisition is implemented as a PostgreSQL function invoked through supabase.rpc, removing the race window in select/delete/insert"
  - "Generated Supabase Database types should be excluded from lint to avoid formatting churn on every regeneration"

requirements-completed:
  - REFACTOR-02
  - REFACTOR-03

coverage:
  - id: D1
    description: "analyses table exposes sync_attempts, last_sync_error_at, and next_sync_at columns"
    requirement: REFACTOR-03
    verification:
      - kind: other
        ref: "grep migration.sql and grep database.ts for sync_attempts/last_sync_error_at/next_sync_at"
        status: pass
    human_judgment: false
  - id: D2
    description: "PostgreSQL function galaxy.acquire_sync_lock performs atomic upsert with expired-lock reclaim"
    requirement: REFACTOR-02
    verification:
      - kind: other
        ref: "grep migration.sql for CREATE OR REPLACE FUNCTION galaxy.acquire_sync_lock"
        status: pass
    human_judgment: false
  - id: D3
    description: "acquireSyncLock invokes supabase.rpc('acquire_sync_lock', { analysis_id, ttl_seconds }) and returns boolean"
    requirement: REFACTOR-02
    verification:
      - kind: unit
        ref: "test/server/utils/grizzle/sync/lock.test.ts#calls acquire_sync_lock RPC with correct parameters and returns true"
        status: pass
    human_judgment: false
  - id: D4
    description: "Database schema push completes without interactive prompts"
    requirement: REFACTOR-02
    verification:
      - kind: other
        ref: "CI=true pnpm --filter ./packages/nuxt-galaxy exec drizzle-kit push exited 0 with 'No changes detected'"
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-08-08
status: complete
---

# Phase 08 Plan 01: Add sync-attempt columns and atomic lock RPC Summary

**Tracer slice for the hardened server-driven sync path: added sync-attempt tracking columns to the analyses table and replaced the read-delete-insert lock acquisition with an atomic PostgreSQL function invoked via supabase.rpc.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-08-08T07:12:43Z
- **Completed:** 2026-08-08T07:25:44Z
- **Tasks:** 2 (Task 1 checkpoint pre-authorized; Task 2 tracer; Task 3 push verification)
- **Files modified:** 8

## Accomplishments

- Added `sync_attempts`, `last_sync_error_at`, and `next_sync_at` columns to the Drizzle `analyses` schema and generated migration.
- Created the atomic `galaxy.acquire_sync_lock(analysis_id integer, ttl_seconds integer)` PostgreSQL function in the generated migration using `INSERT ... ON CONFLICT ... WHERE expired`.
- Rewrote `acquireSyncLock` in `lock.ts` to call `supabase.rpc('acquire_sync_lock', ...)` and removed all select/delete/insert lock logic.
- Regenerated `packages/nuxt-galaxy/src/runtime/types/database.ts` so the `Database` type includes the new analyses columns.
- Updated the lock unit test to verify the RPC name and exact parameter object `{ analysis_id, ttl_seconds }`.
- Fixed the integration test mock to support the new RPC-based lock acquisition path.
- Verified the schema push with `CI=true pnpm --filter ./packages/nuxt-galaxy exec drizzle-kit push` (exit 0, "No changes detected").

## Task Commits

Each task was committed atomically:

1. **Task 2: Tracer — add sync-attempt columns and atomic lock RPC** - `cf0d29c133` (feat)

**Plan metadata:** *(pending final docs commit)*

## Files Created/Modified

- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts` - Added sync-attempt tracking columns.
- `packages/nuxt-galaxy/src/runtime/server/db/migrations/20260808071319_smart_tyrannus/migration.sql` - Drizzle-generated ALTER TABLE statements plus custom `galaxy.acquire_sync_lock` function.
- `packages/nuxt-galaxy/src/runtime/server/db/migrations/20260808071319_smart_tyrannus/snapshot.json` - Drizzle schema snapshot.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts` - Replaced read-delete-insert lock acquisition with `supabase.rpc('acquire_sync_lock', ...)`.
- `packages/nuxt-galaxy/src/runtime/types/database.ts` - Regenerated Supabase Database types including new columns.
- `packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts` - RPC contract unit tests.
- `packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts` - Updated mock for RPC-based lock acquisition.
- `eslint.config.mjs` - Added `packages/nuxt-galaxy/src/runtime/types/database.ts` to ignores.

## Decisions Made

- Followed the plan prohibition and kept the auto-generated Drizzle migration directory name (`20260808071319_smart_tyrannus`) rather than renaming it to a descriptive slug.
- Excluded the generated Supabase types file from ESLint because the Supabase CLI v2.109.1 now emits double-quoted TypeScript that violates the project's single-quote style rules; ignoring generated files avoids repeated formatting churn.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added generated Supabase types to ESLint ignores**
- **Found during:** Task 2 (type generation)
- **Issue:** `supabase gen types` emitted `database.ts` with double quotes and `type` aliases, causing hundreds of lint errors. Without this, the pre-commit hook would repeatedly reformat generated code on every regeneration.
- **Fix:** Added `packages/nuxt-galaxy/src/runtime/types/database.ts` to the `ignores` array in `eslint.config.mjs`.
- **Files modified:** `eslint.config.mjs`
- **Verification:** `pnpm --filter ./packages/nuxt-galaxy lint` passes.
- **Committed in:** `cf0d29c133` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed integration test mock for RPC-based lock acquisition**
- **Found during:** Task 2 (running server tests)
- **Issue:** The integration test in `sync-flow.test.ts` mocked the old select/insert lock path. After switching `acquireSyncLock` to `supabase.rpc`, the test failed because the mock client lacked an `rpc` method and the response queue expected two lock-related responses instead of one RPC response.
- **Fix:** Added an `rpc` mock to the integration-test mock client, moved the lock-acquisition response into a dedicated `rpcResponses` queue, and removed the obsolete select/insert responses from the query response array.
- **Files modified:** `packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts`
- **Verification:** `pnpm --filter ./packages/nuxt-galaxy test:server -- test/server/tasks/integration/sync-flow.test.ts` passes.
- **Committed in:** `cf0d29c133` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Both fixes were necessary consequences of the RPC migration and type generation. No scope creep.

## Issues Encountered

- The generated `snapshot.json` initially lacked a trailing newline according to ESLint; running `eslint --fix` resolved it.
- `supabase gen types` changed output style (`export type Database =` and double quotes) compared to the previous committed version, which would have broken lint on every future regeneration. Resolved by ignoring the generated file from ESLint.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Database schema now contains the sync-attempt columns and atomic lock function.
- `acquireSyncLock` is RPC-based and ready for the TTL/batch-size configuration work in Plan 02.
- Generated types are stable and lint-clean.

## Self-Check: PASSED

- [x] `packages/nuxt-galaxy/src/runtime/server/db/migrations/20260808071319_smart_tyrannus/migration.sql` exists.
- [x] `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts` contains a single `supabase.rpc('acquire_sync_lock', ...)` call and no select/delete/insert logic in `acquireSyncLock`.
- [x] `packages/nuxt-galaxy/src/runtime/types/database.ts` includes `sync_attempts`, `last_sync_error_at`, and `next_sync_at`.
- [x] `pnpm --filter ./packages/nuxt-galaxy test:server -- test/server/utils/grizzle/sync/lock.test.ts` passes.
- [x] `CI=true pnpm --filter ./packages/nuxt-galaxy exec drizzle-kit push` exits 0.
- [x] Commit `cf0d29c133` exists.

---
*Phase: 08-consolidate-and-harden-the-server-driven-sync-path*
*Completed: 2026-08-08*
