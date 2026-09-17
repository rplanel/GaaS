---
phase: 04-fix-root-test-runner-failure
plan: 01
subsystem: testing
tags: [vitest, threads, forks, EDQUOT, monorepo, pnpm]

requires:
  - phase: 03-fix-gaas-ui-typescript-errors
    provides: Green root typecheck baseline so test runner fixes can be verified independently.

provides:
  - Root `pnpm test` executes all package suites without the forks-pool `Unknown system error -122 write` failure.
  - All five Vitest configuration files declare `pool: 'threads'` with an explanatory comment.
  - Verified package-level results: blendtype 144 tests, nuxt-galaxy client 59 tests, nuxt-galaxy server 246 passed/3 skipped, @gaas/ui 12 tests, @gaas/wiki 5 tests.

affects:
  - 05-verify-gates-and-close-broken-windows

tech-stack:
  added: []
  patterns:
    - Configure Vitest `pool: 'threads'` at the package level (and per project for multi-project configs) to avoid forks-pool IPC write failures in constrained runtime environments.

key-files:
  created: []
  modified:
    - vitest.config.ts
    - packages/ui/vitest.config.ts
    - packages/wiki/vitest.config.ts
    - packages/nuxt-galaxy/vitest.config.ts
    - packages/nuxt-galaxy/vitest.config.server.ts

key-decisions:
  - "Use Vitest's threads pool instead of forks pool to avoid environment-specific IPC write failures (errno -122 / EDQUOT) without disabling tests or reducing coverage."
  - "Apply pool: 'threads' inside each project block in packages/wiki/vitest.config.ts because Vitest does not inherit pool from the top-level test config into project configs."

patterns-established:
  - "When a Vitest config uses projects, runner-level settings such as pool must be set per project, not only at the top level."
  - "Document environment-specific runner workarounds with inline comments so future contributors understand why the default pool is overridden."

requirements-completed:
  - TEST-01
  - TEST-02

coverage:
  - id: D1
    description: Root `pnpm test` passes across all workspace packages without the forks-pool `Unknown system error -122 write` failure.
    requirement: TEST-02
    verification:
      - kind: other
        ref: "pnpm test (root) — all package suites pass"
        status: pass
    human_judgment: false

  - id: D2
    description: The forks-pool failure is reproduced and root-caused as an environment-specific IPC write error that does not occur with `pool: 'threads'`.
    requirement: TEST-01
    verification:
      - kind: other
        ref: "pnpm test before fix reproduced Unknown system error -122 in blendtype; pnpm vitest run --pool=threads confirmed green in every package"
        status: pass
    human_judgment: false

actuals:
  tokens: 782
  tasks: 3
  commits: 2

duration: 7min
completed: 2026-08-05
status: complete
---

# Phase 04 Plan 01: Fix Root Test Runner Failure Summary

**Switched all Vitest configurations to the `threads` pool to eliminate the forks-pool IPC write failure (`Unknown system error -122`) and restored a green root `pnpm test` run.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-08-05T22:46:00Z
- **Completed:** 2026-08-05T22:53:20Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Reproduced the root `pnpm test` failure and confirmed it is the forks-pool `Unknown system error -122` write error.
- Verified every affected package passes when run with `--pool=threads`.
- Updated all five Vitest configuration files to use `pool: 'threads'`.
- Restored root `pnpm test` so all package suites pass.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — Reproduce and root-cause the forks-pool failure** — investigation only, no code changes.
2. **Task 2: Configure threads pool in all Vitest configs** — `c89a8ad694` (fix)
3. **Task 2 follow-up: Apply threads pool to each wiki vitest project** — `00b09c293c` (fix)

**Plan metadata:** `6319eeec82` (docs: complete fix root test runner failure plan); `c905b7d98f` (docs: add plan file)

## Files Created/Modified

- `vitest.config.ts` — Added `pool: 'threads'` to the root test defaults so packages without their own config inherit it.
- `packages/ui/vitest.config.ts` — Added `pool: 'threads'` inside the test object.
- `packages/wiki/vitest.config.ts` — Added `pool: 'threads'` inside each Vitest project (`unit` and `nuxt`) after discovering the top-level setting did not propagate.
- `packages/nuxt-galaxy/vitest.config.ts` — Added `pool: 'threads'` inside the client test config.
- `packages/nuxt-galaxy/vitest.config.server.ts` — Added `pool: 'threads'` inside the server test config.

## Decisions Made

- Followed the plan's assumption that `threads` is the correct runner configuration for this environment because it avoids the IPC write failure without disabling tests or coverage.
- Kept package `test` scripts unchanged; the fix is purely in Vitest configuration files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wiki top-level `pool: 'threads'` did not propagate to per-project configs**
- **Found during:** Task 2 verification (root `pnpm test`)
- **Issue:** After adding `pool: 'threads'` at the top level of `packages/wiki/vitest.config.ts`, the wiki `unit` project still failed with `Unknown system error -122`. Vitest does not inherit the `pool` option from the top-level `test` object into individual project configs.
- **Fix:** Moved `pool: 'threads'` into both the `unit` and `nuxt` project blocks inside `packages/wiki/vitest.config.ts`.
- **Files modified:** `packages/wiki/vitest.config.ts`
- **Verification:** `pnpm vitest run` in `packages/wiki` passed, followed by a full green root `pnpm test`.
- **Committed in:** `00b09c293c`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor correction to the planned config shape. No scope creep; tests, scripts, and coverage settings were left untouched.

## Issues Encountered

- None beyond the auto-fixed Wiki project-config propagation issue.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 04 is complete.
- Ready for Phase 05: `Verify Gates and Close Broken Windows`, which will run root `pnpm lint`, `pnpm typecheck`, and `pnpm test` end-to-end and update `.planning/WINDOWS.md` to mark the broken windows fixed.

---
*Phase: 04-fix-root-test-runner-failure*
*Completed: 2026-08-05*

## Self-Check: PASSED

- [x] SUMMARY.md exists at `.planning/phases/04-fix-root-test-runner-failure/04-01-SUMMARY.md`
- [x] Commit `c89a8ad694` exists in git history
- [x] Commit `00b09c293c` exists in git history
