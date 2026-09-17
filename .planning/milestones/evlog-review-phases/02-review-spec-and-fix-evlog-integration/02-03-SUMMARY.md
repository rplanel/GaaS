---
phase: 02-review-spec-and-fix-evlog-integration
plan: 03
subsystem: ui
tags: [evlog, logging, components, utilities, meilisearch, mosaic, vue]

requires:
  - phase: 01-research-evlog-patterns-and-conventions
    provides: EVLOG-CONVENTIONS.md and client-composable patterns
  - phase: 02-review-spec-and-fix-evlog-integration
    provides: 02-02-SUMMARY.md composables cleanup pattern

provides:
  - Five remaining @gaas/ui runtime files (components + header utilities) free of raw console.* calls
  - Structured evlog/client warning/error/info/debug logs with action/tag context
  - Mechanical replacement pattern documented for future component cleanup

affects:
  - 02-05-PLAN.md

actuals:
  tokens: 2153
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Client components and utilities use `import { log } from 'evlog/client'` and structured `{ action, tag, ... }` objects"
    - "Lifecycle/development noise (e.g., unmount) is downgraded to `log.info`; invalid states that throw are logged as `log.error`"

key-files:
  created: []
  modified:
    - packages/ui/app/utils/table/columns/header.ts
    - packages/ui/app/components/plot/table/header/Histogram.vue
    - packages/ui/app/components/meili/index/filter/AssistedBuilder.vue
    - packages/ui/app/components/meili/index/filter/form/SetInput.vue
    - packages/ui/app/components/meili/index/filter/plot/CategoryBuilder.vue

key-decisions:
  - "Checkpoint 1 (D-01 scope confirmation) was satisfied by the user's direct execution request; proceeded with the 'proceed' option to clean the listed UI components/utilities"
  - "Used explicit `import { log } from 'evlog/client'` despite auto-import availability to make the dependency visible and consistent with 02-02 composables"
  - "Downgraded Histogram.vue unmount warning to `log.info` because it is lifecycle noise, not a recoverable issue"
  - "Kept the existing `createError` throw in SetInput.vue and added a preceding structured `log.error`"

patterns-established: []

requirements-completed:
  - REVW-01
  - FIX-02
  - VERF-01
  - VERF-02
  - VERF-03

coverage:
  - id: D1
    description: "Replaced raw console.warn in header.ts with structured evlog/client warnings for missing histogram/category parameters"
    requirement: FIX-02
    verification:
      - kind: other
        ref: "grep -rEn \"console\\.(log|warn|error|info|debug)\" --include=\"*.ts\" --include=\"*.vue\" packages/ui/app | grep -v \"// console\\.\""
        status: pass
      - kind: other
        ref: "npx eslint packages/ui/app/utils/table/columns/header.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Replaced Histogram.vue unmount console.warn with structured log.info lifecycle log"
    requirement: FIX-02
    verification:
      - kind: other
        ref: "grep runtime console.* inventory across packages/ui/app"
        status: pass
      - kind: other
        ref: "npx eslint packages/ui/app/components/plot/table/header/Histogram.vue"
        status: pass
    human_judgment: false
  - id: D3
    description: "Replaced AssistedBuilder.vue invalid-filter console.warn with structured log.warn"
    requirement: FIX-02
    verification:
      - kind: other
        ref: "grep runtime console.* inventory across packages/ui/app"
        status: pass
      - kind: other
        ref: "npx eslint packages/ui/app/components/meili/index/filter/AssistedBuilder.vue"
        status: pass
    human_judgment: false
  - id: D4
    description: "Added structured log.error before SetInput.vue invalid-operator throw"
    requirement: FIX-02
    verification:
      - kind: other
        ref: "grep runtime console.* inventory across packages/ui/app"
        status: pass
      - kind: other
        ref: "npx eslint packages/ui/app/components/meili/index/filter/form/SetInput.vue"
        status: pass
    human_judgment: false
  - id: D5
    description: "Replaced CategoryBuilder.vue width debug/missing-facet/missing-column console.warn calls with log.debug/log.warn"
    requirement: FIX-02
    verification:
      - kind: other
        ref: "grep runtime console.* inventory across packages/ui/app"
        status: pass
      - kind: other
        ref: "npx eslint packages/ui/app/components/meili/index/filter/plot/CategoryBuilder.vue"
        status: pass
    human_judgment: false
  - id: D6
    description: "@gaas/ui test suite remains green after component/utility logging migration"
    requirement: VERF-03
    verification:
      - kind: other
        ref: "pnpm --filter ./packages/ui test"
        status: pass
    human_judgment: false

# Metrics
duration: 16min
completed: 2026-08-05
status: complete
---

# Phase 02 Plan 03: Replace raw console.* in @gaas/ui components and header utilities with evlog/client

**Five remaining `@gaas/ui` runtime files now emit structured `evlog/client` logs instead of raw `console.warn`/`console.error`, with explicit imports and no secrets in payloads.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-08-05T18:02:00Z
- **Completed:** 2026-08-05T18:18:00Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments

- Migrated `packages/ui/app/utils/table/columns/header.ts` missing-parameter warnings for histogram and category headers to structured `log.warn`.
- Migrated `Histogram.vue` unmount warning to `log.info` lifecycle log.
- Migrated `AssistedBuilder.vue` invalid-filter warning to structured `log.warn`.
- Added structured `log.error` before `SetInput.vue`'s invalid-operator `createError` throw.
- Migrated `CategoryBuilder.vue` width debug line to `log.debug` and missing-facet/missing-column warnings to `log.warn`.
- Removed leftover commented-out `console.log` debug lines from the modified component files.
- Verified zero active runtime `console.*` calls remain under `packages/ui/app/`.

## Task Commits

Each task was committed atomically:

1. **Task 2: Replace console.* in UI components and table-header utilities with evlog/client calls** - `9dd9fa0` (fix)

**Plan metadata:** _pending_

## Files Created/Modified

- `packages/ui/app/utils/table/columns/header.ts` - Replaced 2 `console.warn` calls in `getHistogramHeader`/`getCategoryHeader` with structured `log.warn`.
- `packages/ui/app/components/plot/table/header/Histogram.vue` - Replaced unmount `console.warn` with structured `log.info`; added explicit `evlog/client` import.
- `packages/ui/app/components/meili/index/filter/AssistedBuilder.vue` - Replaced invalid-filter `console.warn` with structured `log.warn`; removed commented-out debug lines.
- `packages/ui/app/components/meili/index/filter/form/SetInput.vue` - Added structured `log.error` before invalid-operator throw; removed commented-out debug lines.
- `packages/ui/app/components/meili/index/filter/plot/CategoryBuilder.vue` - Replaced width debug and missing-facet/missing-column warnings with structured `log.debug`/`log.warn`; removed commented-out debug line.

## Decisions Made

- Followed the user's direct execution request as approval of the D-01 scope checkpoint and proceeded with the `proceed` option.
- Followed PATTERNS.md §9/§10 client-component pattern: `log.warn({ action, tag, ... })` / `log.error({ action, tag, error, ... })` / `log.info({ action, tag, ... })`.
- Used explicit `import { log } from 'evlog/client'` for visibility, matching 02-02 composable cleanup.
- Downgraded `Histogram.vue` unmount message from `console.warn` to `log.info` because it is lifecycle noise, not a recoverable issue.
- Preserved the existing `createError` throw in `SetInput.vue` while adding a structured error log before it.

## Deviations from Plan

None - plan executed exactly as written for the five scoped components and utilities.

## Issues Encountered

Package-wide `pnpm --filter ./packages/ui lint` and `pnpm --filter ./packages/ui typecheck` do **not** pass because of pre-existing errors in files outside this plan's scope:

- **Lint failures (2):**
  - `packages/ui/nuxt.config.ts:31:17` — `style/comma-dangle`
  - `packages/ui/server/plugins/evlog-drain.ts:10:23` — `antfu/if-newline` (duplicate FS drain `@evlog/cli` init artifact noted in 02-AUDIT.md A-06)

- **Typecheck failures (4):**
  - `app/components/HeroShadersDynamic.vue:3:10` — Cannot find module `~/components/HeroShaders.client.vue`
  - `app/components/plot/Table.vue:16:26` / `84:69` — Mosaic/Table `defineModel` type mismatches
  - `app/pages/index.vue:345:26` — Clipboard value type mismatch

These were already classified as unrelated `@evlog/cli` init artifacts or pre-existing type issues in 02-AUDIT.md and are deferred to Plan 02-05. The five target files are lint-clean (verified with `npx eslint` on each file), contain no runtime `console.*` calls, and `pnpm --filter ./packages/ui test` passes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Components/utilities half of D-01 complete.
- Ready for 02-05-PLAN.md: author `LOGGING-SPEC.md`, run secrets/boundary audits, and root the remaining `@evlog/cli` artifact quality gates.

## Self-Check: PASSED

- [x] `02-03-SUMMARY.md` exists at `.planning/phases/02-review-spec-and-fix-evlog-integration/02-03-SUMMARY.md`
- [x] Code commit `9dd9fa0` exists in git history
- [x] Metadata commit `f854a9b` exists in git history
- [x] Active runtime `console.*` grep under `packages/ui/app/` returns no results
- [x] ESLint passes on all five modified files
- [x] `pnpm --filter ./packages/ui test` passes (12 tests)

---
*Phase: 02-review-spec-and-fix-evlog-integration*
*Completed: 2026-08-05*
