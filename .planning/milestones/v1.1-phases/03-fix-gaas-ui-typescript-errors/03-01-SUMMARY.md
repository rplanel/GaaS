---
phase: 03-fix-gaas-ui-typescript-errors
plan: 01
subsystem: ui
tags: [vue, typescript, nuxt, typecheck]

requires:
  - phase: 02-review-spec-and-fix-evlog-integration
    provides: Clean @gaas/ui logging integration and documented quality-gate blockers

provides:
  - packages/ui/app/components/HeroShadersDynamic.vue resolves its shader component via a relative dynamic import
  - packages/ui/app/components/plot/Table.vue declares columnVisibility with a typed generic defineModel
  - packages/ui/app/pages/index.vue only renders the copy button when page.cta.command is defined
  - Green pnpm --filter @gaas/ui typecheck and root pnpm typecheck for the four previously failing errors

affects:
  - 04-fix-root-test-runner-failure
  - 05-verify-gates-and-close-broken-windows

actuals:
  tokens: 377
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - Generic defineModel<T>(name, { default: () => ({}) }) for typed v-model state
    - Relative dynamic imports for .client.vue wrappers consumed by vue-tsc
    - v-if guards on UButton to narrow TypeScript union types before handler invocation

key-files:
  created: []
  modified:
    - packages/ui/app/components/HeroShadersDynamic.vue
    - packages/ui/app/components/plot/Table.vue
    - packages/ui/app/pages/index.vue

key-decisions: []

patterns-established: []

requirements-completed:
  - TYPE-01
  - TYPE-02
  - TYPE-03
  - TYPE-04

coverage:
  - id: D1
    description: HeroShadersDynamic.vue dynamically imports HeroShaders.client.vue via a relative path so vue-tsc resolves the module
    requirement: TYPE-01
    verification:
      - kind: other
        ref: "pnpm --filter @gaas/ui typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: plot/Table.vue declares columnVisibility with defineModel<Record<string, boolean>> and a default factory
    requirement: TYPE-02
    verification:
      - kind: other
        ref: "pnpm --filter @gaas/ui typecheck"
        status: pass
    human_judgment: false
  - id: D3
    description: plot/Table.vue preserves typed optional-chained tableApi access for pagination state
    requirement: TYPE-03
    verification:
      - kind: other
        ref: "pnpm --filter @gaas/ui typecheck"
        status: pass
    human_judgment: false
  - id: D4
    description: pages/index.vue only renders the copy UButton and calls copy() when page.cta.command is a defined string
    requirement: TYPE-04
    verification:
      - kind: other
        ref: "pnpm --filter @gaas/ui typecheck"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-08-05
status: complete
---

# Phase 03 Plan 01: Fix `@gaas/ui` TypeScript Errors Summary

**Resolved the four pre-existing TypeScript errors in `@gaas/ui` by switching the HeroShaders dynamic import to a relative path, typing the plot Table's columnVisibility model generically, and guarding the landing-page copy button on a defined command string.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-08-05T22:14:04Z
- **Completed:** 2026-08-05T22:17:19Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Eliminated `TS2307` for `HeroShadersDynamic.vue` by importing `./HeroShaders.client.vue` instead of the Nuxt `~/components` alias.
- Eliminated `TS2769`/`TS2322` in `plot/Table.vue` by declaring `columnVisibility` as `defineModel<Record<string, boolean>>('columnVisibility', { default: () => ({}) })`.
- Preserved the existing typed `useTemplateRef<{ tableApi: Table<T> }>('tableElem')` and optional-chained `tableElem?.tableApi?.getState()` / `getFilteredRowModel()` / `setPageIndex()` pagination access.
- Eliminated `TS2345` in `pages/index.vue` by wrapping the copy `<UButton>` in `v-if="page.cta.command"`.
- Verified `pnpm --filter @gaas/ui typecheck` exits 0, root `pnpm typecheck` passes, and `@gaas/ui` lint is clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — Fix HeroShadersDynamic.vue dynamic import resolution** - `2b469a79f2` (fix)
2. **Task 2: Fix plot/Table.vue defineModel and tableApi type errors** - `e3d6f3e378` (fix)
3. **Task 3: Fix pages/index.vue copy() undefined handling** - `144672066c` (fix)

**Plan metadata:** `2da8a9254e` (docs: complete plan)

## Files Created/Modified

- `packages/ui/app/components/HeroShadersDynamic.vue` - Changed dynamic import path from `~/components/HeroShaders.client.vue` to `./HeroShaders.client.vue`.
- `packages/ui/app/components/plot/Table.vue` - Replaced legacy `defineModel` options object with generic `defineModel<Record<string, boolean>>('columnVisibility', { default: () => ({}) })`.
- `packages/ui/app/pages/index.vue` - Added `v-if="page.cta.command"` guard to the copy `<UButton>` so `copy()` only receives a defined string.

## Decisions Made

None - followed plan as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The pre-commit hooks and verification commands completed without errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `@gaas/ui` typecheck is green.
- Root `pnpm typecheck` is green for the UI package.
- The next phase can proceed to the Vitest forks-pool root test failure (`04-fix-root-test-runner-failure`).
- The final verification phase (`05-verify-gates-and-close-broken-windows`) will need to confirm root `pnpm test` and update `.planning/WINDOWS.md`.

## Self-Check: PASSED

- All modified source files exist on disk.
- All task commit hashes exist in git history.
- `pnpm --filter @gaas/ui typecheck` exits 0.
- Root `pnpm typecheck` exits 0 with no original `@gaas/ui` errors.
- `pnpm --filter @gaas/ui lint` exits 0.

---
*Phase: 03-fix-gaas-ui-typescript-errors*
*Completed: 2026-08-05*
