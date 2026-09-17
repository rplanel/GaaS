---
phase: 08-consolidate-and-harden-the-server-driven-sync-path
plan: 02
subsystem: config
 tags:
  - nuxt
  - module-options
  - runtime-config
  - sync
  - effect-ts
  - supabase

requires:
  - phase: 08-01
    provides: Atomic acquire_sync_lock RPC, sync_attempts/last_sync_error_at/next_sync_at columns, and Drizzle migration.

provides:
  - Flat ModuleOptions sync configuration keys (syncLockTtlSeconds, syncBatchSize, syncMaxRetries, syncRetryBaseDelayMs, syncRetryMaxDelayMs) with documented defaults.
  - Private runtimeConfig.galaxy.sync object carrying the five config values.
  - galaxy:sync-analyses scheduled task reads batchSize from runtimeConfig and passes the full syncConfig to syncAnalysisEffect.
  - syncAnalysisEffect accepts a SyncConfig parameter and forwards lockTtlSeconds to acquireSyncLock; retry fields are accepted for Plan 03 wiring.

affects:
  - 08-03
  - 08-04
  - 08-05
  - 08-06

actuals:
  tokens: 5000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Flat ModuleOptions -> private runtimeConfig.galaxy.sync -> useRuntimeConfig() in Nitro tasks/Effects"
    - "Explicit #imports import for auto-imported Nitro composables so server Vitest tests can mock them"

key-files:
  created: []
  modified:
    - packages/nuxt-galaxy/src/module.ts
    - packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
    - packages/nuxt-galaxy/src/runtime/types/database.ts
    - packages/nuxt-galaxy/test/server/setup.ts
    - packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts
    - packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts

key-decisions:
  - "Qualified acquireSyncLock RPC as supabase.schema('galaxy').rpc('acquire_sync_lock') to match the generated Supabase Database types and the galaxy schema migration."
  - "Explicitly import useRuntimeConfig from '#imports' in sync-analyses.ts so the server Vitest suite can mock it via the shared setup file."

patterns-established:
  - "Keep operational sync tunables as flat ModuleOptions and map them into a nested runtimeConfig.galaxy.sync object for runtime consumption."
  - "Pass a SyncConfig object through the canonical sync effect boundary instead of threading individual scalar arguments."

requirements-completed:
  - REFACTOR-02

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "ModuleOptions exposes the five sync options with documented defaults and runtimeConfig.galaxy.sync carries them in private config."
    requirement: REFACTOR-02
    verification:
      - kind: other
        ref: "pnpm --filter ./packages/nuxt-galaxy typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "galaxy:sync-analyses uses the configured batchSize and no longer contains hardcoded PAGE_SIZE = 20 or lock TTL literals."
    requirement: REFACTOR-02
    verification:
      - kind: integration
        ref: "pnpm --filter ./packages/nuxt-galaxy test:server"
        status: pass
      - kind: other
        ref: "grep -E 'PAGE_SIZE|acquireSyncLock\\(.*900\\)' packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts (no matches)"
        status: pass
    human_judgment: false
  - id: D3
    description: "syncAnalysisEffect accepts syncConfig and forwards syncConfig.lockTtlSeconds to acquireSyncLock."
    requirement: REFACTOR-02
    verification:
      - kind: integration
        ref: "pnpm --filter ./packages/nuxt-galaxy test:server"
        status: pass
    human_judgment: false
  - id: D4
    description: "Acquire-sync-lock RPC is schema-qualified and generated Supabase types include the new function and columns."
    requirement: REFACTOR-02
    verification:
      - kind: integration
        ref: "pnpm --filter ./packages/nuxt-galaxy test:server"
        status: pass
      - kind: other
        ref: "pnpm --filter ./packages/nuxt-galaxy typecheck"
        status: pass
    human_judgment: false

# Metrics
duration: 35min
completed: 2026-08-08
status: complete
---

# Phase 08 Plan 02: Wire sync lock TTL, batch size, and retry config through ModuleOptions

**Exposed five flat sync tunables on the nuxt-galaxy ModuleOptions, flowed them through private runtimeConfig.galaxy.sync, and wired the scheduled task and syncAnalysisEffect to consume them.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-08-08T07:32:31Z
- **Completed:** 2026-08-08T08:07:29Z
- **Tasks:** 3/3
- **Files modified:** 10

## Accomplishments

- Added `syncLockTtlSeconds`, `syncBatchSize`, `syncMaxRetries`, `syncRetryBaseDelayMs`, and `syncRetryMaxDelayMs` to `ModuleOptions` with JSDoc defaults.
- Mapped those options into `runtimeConfig.galaxy.sync` (private config only) and extended the `RuntimeConfig` augmentation.
- Updated `galaxy:sync-analyses` to read `batchSize` and the full `syncConfig` from `useRuntimeConfig().galaxy.sync`, removing the hardcoded `PAGE_SIZE = 20` literal.
- Updated `syncAnalysisEffect` to accept a `SyncConfig` parameter and forward `syncConfig.lockTtlSeconds` to `acquireSyncLock`; retry/backoff fields are accepted for Plan 03 wiring.
- Regenerated `src/runtime/types/database.ts` from the local Supabase DB so the new columns and `acquire_sync_lock` function are reflected in types.
- Qualified the `acquire_sync_lock` RPC call with `supabase.schema('galaxy')` to align with the generated schema types.
- Updated server tests and mocks to pass the `syncConfig` object and assert the schema-qualified RPC.

## Task Commits

1. **Task 1 (checkpoint): confirm D-05 public module API changes** — human approved `proceed`
2. **Task 2: Add sync configuration options to ModuleOptions and runtimeConfig** — `647d3b318e`
3. **Task 3: Wire scheduled task and syncAnalysisEffect to consume sync config** — `4833384fb9`

**Deviation fix (pre-task):** `a8c80be870` — qualified `acquire_sync_lock` RPC with `galaxy` schema and regenerated Supabase types so the package typecheck would pass.

**Plan metadata:** to be committed after SUMMARY creation.

## Files Created/Modified

- `packages/nuxt-galaxy/src/module.ts` — Added five flat sync options, defaults, private `runtimeConfig.galaxy.sync`, and RuntimeConfig augmentation.
- `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` — Reads `batchSize`/`syncConfig` from runtime config; passes `syncConfig` to `syncAnalysisEffect`; removed `PAGE_SIZE` literal.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` — Added `SyncConfig` interface; updated `syncAnalysisEffect` signature and lock acquisition call.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts` — Qualified `acquire_sync_lock` RPC with `supabase.schema('galaxy')`.
- `packages/nuxt-galaxy/src/runtime/types/database.ts` — Regenerated types including `acquire_sync_lock`, `sync_attempts`, `last_sync_error_at`, `next_sync_at`.
- `packages/nuxt-galaxy/test/server/setup.ts` — Added `sync` object to the mocked `useRuntimeConfig` return value.
- `packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts` — Updated `mockSyncAnalysisEffect` expectations to include `syncConfig`.
- `packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts` — Added `rpc` to the chained schema mock to support the schema-qualified lock RPC.
- `packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts` — Added `defaultSyncConfig` and passed it to every `syncAnalysisEffect` invocation.
- `packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts` — Updated mocks and assertions for schema-qualified RPC.

## Decisions Made

- Followed D-05 by exposing flat sync options on `ModuleOptions` and mapping them to the nested `runtimeConfig.galaxy.sync` runtime shape.
- Qualified `acquire_sync_lock` RPC with `supabase.schema('galaxy')` because the generated Supabase types place the function under the `galaxy` schema.
- Imported `useRuntimeConfig` explicitly from `#imports` in `sync-analyses.ts` so the shared server test setup can mock it; this keeps the server Vitest suite green without relying on Nuxt auto-import transforms in tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Qualified acquire_sync_lock RPC with galaxy schema and regenerated Supabase types**
- **Found during:** Task 2 verification (`pnpm --filter ./packages/nuxt-galaxy typecheck`)
- **Issue:** `src/runtime/server/utils/grizzle/sync/lock.ts` called `supabase.rpc('acquire_sync_lock')`, which the regenerated `Database` types did not accept (function lives under the `galaxy` schema), and the package typecheck failed. The generated `database.ts` also lacked the new function and columns.
- **Fix:** Ran `drizzle:migrate` to apply the pending migration to the local Supabase DB, regenerated types with `supabase:generate:types`, and changed the RPC call to `supabase.schema('galaxy').rpc('acquire_sync_lock')`. Updated `lock.test.ts` and the integration test mock to assert the schema-qualified call.
- **Files modified:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts`, `packages/nuxt-galaxy/src/runtime/types/database.ts`, `packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts`, `packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts`
- **Verification:** `pnpm --filter ./packages/nuxt-galaxy typecheck` and `pnpm --filter ./packages/nuxt-galaxy test:server` both pass.
- **Committed in:** `a8c80be870`

**2. [Rule 3 - Blocking] Explicitly imported useRuntimeConfig from #imports for testability**
- **Found during:** Task 3 verification (`pnpm --filter ./packages/nuxt-galaxy test:server`)
- **Issue:** `galaxy:sync-analyses` relied on the Nitro auto-import for `useRuntimeConfig`, which is not available in the server Vitest environment, causing `ReferenceError: useRuntimeConfig is not defined`.
- **Fix:** Added `import { useRuntimeConfig } from '#imports'` to `sync-analyses.ts`; the shared server setup already mocks `#imports`.
- **Files modified:** `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts`
- **Verification:** `pnpm --filter ./packages/nuxt-galaxy test:server` passes.
- **Committed in:** `4833384fb9`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were necessary for the plan's verification gates to pass. No scope creep; one fixes a pre-existing type/runtime mismatch from the preceding tracer plan, and the other enables the required test coverage.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None — no new external services or credentials.

## Next Phase Readiness

- `runtimeConfig.galaxy.sync` is available and typed.
- `syncAnalysisEffect` receives the full `syncConfig`; Plan 03 can now wire retry/backoff using `maxRetries`, `retryBaseDelayMs`, and `retryMaxDelayMs`.
- `galaxy:sync-analyses` already reads `batchSize` and `lockTtlSeconds` from config, so Plan 04/05 can safely tune them in `nuxt.config.ts` or environment defaults.

---
*Phase: 08-consolidate-and-harden-the-server-driven-sync-path*
*Completed: 2026-08-08*

## Self-Check: PASSED

- [x] `08-02-SUMMARY.md` exists at `.planning/phases/08-consolidate-and-harden-the-server-driven-sync-path/08-02-SUMMARY.md`
- [x] Commits `a8c80be870`, `647d3b318e`, `4833384fb9` are present in git history
- [x] `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` contains no `PAGE_SIZE` or `acquireSyncLock(..., 900)` literals
- [x] `pnpm --filter ./packages/nuxt-galaxy typecheck` passes
- [x] `pnpm --filter ./packages/nuxt-galaxy test:server` passes (246 passed, 3 skipped)
