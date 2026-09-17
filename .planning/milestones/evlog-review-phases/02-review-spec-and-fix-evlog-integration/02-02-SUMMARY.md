---
phase: 02-review-spec-and-fix-evlog-integration
plan: 02
subsystem: ui
tags: [evlog, logging, composables, meilisearch, mosaic, vue]

requires:
  - phase: 01-research-evlog-patterns-and-conventions
    provides: EVLOG-CONVENTIONS.md and client-composable patterns

provides:
 - Five @gaas/ui composables free of raw console.* runtime calls
 - Structured evlog/client error/warning logs with action/tag/error fields
 - Verified lint-clean state for the five target files

affects:
  - 02-03-PLAN.md
  - 02-05-PLAN.md

actuals:
  tokens: 2173
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Client composables use `import { log } from 'evlog/client'` and structured `{ action, tag, error }` objects"
    - "Raw Error objects are serialized with `String(e)` or `getErrorMessage(e)` before logging"

key-files:
  created: []
  modified:
    - packages/ui/app/composables/meili/useLoadMore.ts
    - packages/ui/app/composables/meili/useMeiliSearch.ts
    - packages/ui/app/composables/useMosaicData.ts
    - packages/ui/app/composables/plot/table/useHistogramHeader.ts
    - packages/ui/app/composables/plot/table/useCategoryHeader.ts

key-decisions:
  - "Proceeded with the D-01 scoped composables cleanup after the decision checkpoint"
  - "Used `action` + `tag` fields for client composables, matching the §9 analog pattern from PATTERNS.md"
  - "Serialized caught errors as strings to avoid leaking raw Error objects or stack traces into client logs"

patterns-established:
  - "Client composables: `log.warn({ action: 'domain:issue', tag: 'ComposableName', ... })`"
  - "Client composables: `log.error({ action: 'domain: failure', tag: 'ComposableName', error: String(e), ... })`"

requirements-completed:
  - REVW-01
  - FIX-02
  - VERF-01
  - VERF-02
  - VERF-03

coverage:
  - id: D1
    description: "Replaced raw console.error in useLoadMore.ts with structured evlog/client error log"
    requirement: FIX-02
    verification:
      - kind: other
        ref: "grep -rEn \"console\\.(log|warn|error|info|debug)\" --include=\"*.ts\" packages/ui/app/composables"
        status: pass
      - kind: other
        ref: "npx eslint packages/ui/app/composables/meili/useLoadMore.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Replaced raw console.error in useMeiliSearch.ts with structured evlog/client error log including index context"
    requirement: FIX-02
    verification:
      - kind: other
        ref: "grep runtime console.* inventory across packages/ui/app/composables"
        status: pass
      - kind: other
        ref: "npx eslint packages/ui/app/composables/meili/useMeiliSearch.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Replaced all console.warn and console.error calls in useMosaicData.ts with structured evlog/client logs"
    requirement: FIX-02
    verification:
      - kind: other
        ref: "grep runtime console.* inventory across packages/ui/app/composables"
        status: pass
      - kind: other
        ref: "npx eslint packages/ui/app/composables/useMosaicData.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Replaced raw console.warn in useHistogramHeader.ts with structured evlog/client warning log and removed commented debug lines"
    requirement: FIX-02
    verification:
      - kind: other
        ref: "grep runtime console.* inventory across packages/ui/app/composables"
        status: pass
      - kind: other
        ref: "npx eslint packages/ui/app/composables/plot/table/useHistogramHeader.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Replaced raw console.warn in useCategoryHeader.ts with structured evlog/client warning log"
    requirement: FIX-02
    verification:
      - kind: other
        ref: "grep runtime console.* inventory across packages/ui/app/composables"
        status: pass
      - kind: other
        ref: "npx eslint packages/ui/app/composables/plot/table/useCategoryHeader.ts"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-08-05
status: complete
---

# Phase 02 Plan 02: Replace raw console.* in @gaas/ui composables with evlog/client

**Five `@gaas/ui` client composables now emit structured evlog/client logs instead of raw `console.error`/`console.warn`, with errors serialized as strings and no secrets in payloads.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-08-05T15:35:00Z
- **Completed:** 2026-08-05T15:50:00Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments

- Migrated `useLoadMore.ts` MeiliSearch failure logging to `log.error({ action, tag, error })`.
- Migrated `useMeiliSearch.ts` index search failure logging with `index` context.
- Migrated `useMosaicData.ts` missing-dependency warnings and query/prepare/result errors to structured evlog calls.
- Migrated `useHistogramHeader.ts` and `useCategoryHeader.ts` missing-parameter warnings to structured evlog calls.
- Removed non-TODO commented-out `console.*` lines from `useMosaicData.ts` and `useHistogramHeader.ts`.
- Verified the five target files contain no runtime `console.*` calls and pass ESLint when checked individually.

## Task Commits

Each task was committed atomically:

1. **Task 2: Replace console.* in UI composables with evlog/client calls** - `d7b0445` (fix)

**Plan metadata:** _pending_

## Files Created/Modified

- `packages/ui/app/composables/meili/useLoadMore.ts` - Replaced `console.error('MeiliSearch Error:', e)` with structured `log.error`.
- `packages/ui/app/composables/meili/useMeiliSearch.ts` - Replaced `console.error('MeiliSearch Error:', e)` with structured `log.error` including `index`.
- `packages/ui/app/composables/useMosaicData.ts` - Replaced 6 `console.warn` and 3 `console.error` calls with structured `log.warn`/`log.error`; removed commented debug lines.
- `packages/ui/app/composables/plot/table/useHistogramHeader.ts` - Replaced missing-parameter `console.warn` with structured `log.warn`; removed commented debug lines.
- `packages/ui/app/composables/plot/table/useCategoryHeader.ts` - Replaced missing-parameter `console.warn` with structured `log.warn`.

## Decisions Made

- Followed PATTERNS.md §9/§10 client-composable pattern: `log.warn({ action, tag, ... })` / `log.error({ action, tag, error, ... })`.
- Proceeded with the D-01 scoped cleanup for the five composables after the decision checkpoint; remaining UI components/utilities and cross-layer hits are left to 02-03 and 02-05 as planned.

## Deviations from Plan

None - plan executed exactly as written for the five scoped composables.

## Issues Encountered

Package-wide `pnpm --filter ./packages/ui lint` and `pnpm --filter ./packages/ui typecheck` do **not** pass because of pre-existing errors in files outside this plan's scope:

- **Lint failures (3):**
  - `packages/ui/AGENTS.md:247:31` — `style/no-multi-spaces` (evlog CLI generated docs)
  - `packages/ui/nuxt.config.ts:31:17` — `style/comma-dangle`
  - `packages/ui/server/plugins/evlog-drain.ts:10:23` — `antfu/if-newline` (evlog CLI init artifact, duplicate FS drain noted in 02-AUDIT.md A-06)

- **Typecheck failures (4):**
  - `app/components/HeroShadersDynamic.vue:3:10` — Cannot find module `~/components/HeroShaders.client.vue`
  - `app/components/plot/Table.vue:16:26` / `84:69` — Mosaic/Table type mismatches
  - `app/pages/index.vue:345:26` — Clipboard value type mismatch

These were already classified as unrelated `@evlog/cli` init artifacts or pre-existing type issues in 02-AUDIT.md and are deferred to Plans 02-04 and 02-05. The five target composables are lint-clean (verified with `npx eslint` on each file) and contain no runtime `console.*` calls.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Composables half of D-01 complete.
- Ready for 02-03-PLAN.md: replace raw `console.*` in remaining `@gaas/ui` components and header utilities.

---
*Phase: 02-review-spec-and-fix-evlog-integration*
*Completed: 2026-08-05*
