---
phase: 02-review-spec-and-fix-evlog-integration
plan: 01
subsystem: logging
tags:
  - evlog
  - effect-ts
  - nuxt-galaxy
  - audit

requires:
  - phase: 01-research-evlog-patterns-and-conventions
    provides: EVLOG-CONVENTIONS.md, FEAT-EVLOG-REVIEW-CHECKLIST.md, 01-SKELETON.md

provides:
  - Written audit report (02-AUDIT.md) covering every changed file and CLI init artifact
  - Real debug routing path for Effect.logDebug via evlog global log.debug
  - Updated test expectations and mocks for the new debug behavior
  - Documented verification results including unrelated gate failures

affects:
  - 02-02
  - 02-03
  - 02-04
  - 02-05

actuals:
  tokens: 9870
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - Effect log level mapped to evlog severity through a single bridge
    - Debug-level Effect logs routed to global evlog logger when request logger lacks debug method
    - Test mocks must expose the full evlog export shape when the module under test imports log

key-files:
  created:
    - .planning/phases/02-review-spec-and-fix-evlog-integration/02-AUDIT.md
  modified:
    - packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts
    - packages/nuxt-galaxy/test/server/utils/evlog-effect.test.ts
    - packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts

key-decisions:
  - "D-04 confirmed: route Effect.logDebug to evlog's global log.debug instead of downgrading to requestLog.info."
  - "Unrelated lint/typecheck/test failures in @evlog/cli init artifacts and missing build output are documented in 02-AUDIT.md and deferred to later plans."
  - "sync-analyses.test.ts mock updated to include evlog's log export because the new debug path reaches the global logger."

patterns-established:
  - "When a request logger does not expose a debug method, debug-level Effect logs travel through evlog's global logger to preserve severity."
  - "Tests that mock 'evlog' must include the log export if the code under test can route any level to it."

requirements-completed:
  - REVW-01
  - FIX-01
  - FIX-03
  - VERF-01
  - VERF-02
  - VERF-03

coverage:
  - id: D1
    description: Written audit report cataloguing every feat/evlog changed file, evlog CLI init artifact, raw console.* usage, secret risk, and package boundary.
    requirement: REVW-01
    verification:
      - kind: manual_procedural
        ref: "test -f .planning/phases/02-review-spec-and-fix-evlog-integration/02-AUDIT.md && grep -cE '^## +Findings'"
        status: pass
    human_judgment: false
  - id: D2
    description: Effect.logDebug inside runGalaxyEffect / runTaskEffect reaches evlog global log.debug without casts or fallbacks.
    requirement: FIX-03
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/evlog-effect.test.ts#routes Effect.logDebug to the global evlog logger because the request logger has no debug method"
        status: pass
    human_judgment: false
  - id: D3
    description: nuxt-galaxy server test suite remains green after the bridge change.
    requirement: VERF-03
    verification:
      - kind: integration
        ref: "pnpm --filter ./packages/nuxt-galaxy test:server"
        status: pass
    human_judgment: false
  - id: D4
    description: Unrelated lint/typecheck failures in @evlog/cli init artifacts are documented rather than silently ignored.
    requirement: VERF-01
    verification:
      - kind: manual_procedural
        ref: "02-AUDIT.md section 9 records lint/typecheck failures in server/plugins/evlog-drain.ts and AGENTS.md"
        status: pass
    human_judgment: false

status: complete
duration: 7min
completed: 2026-08-05
---

# Phase 02 Plan 01: evlog Integration Audit + Effect Debug Path

**Tracer plan for the Phase 2 review milestone: produced the mandated written audit report and implemented the D-04 real debug path for the Effect→evlog bridge.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-08-05T15:11:11Z
- **Completed:** 2026-08-05T15:18:46Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Created `02-AUDIT.md`, a surface-by-surface audit of every file changed in `feat/evlog` and every `@evlog/cli init` artifact.
- Replaced the unsafe `RequestLogWithDebug` cast and `requestLog.info` fallback with a real debug path that routes `Effect.logDebug` to evlog's global `log.debug`.
- Updated `evlog-effect.test.ts` to assert the new global debug routing.
- Updated `sync-analyses.test.ts` mock to include evlog's `log` export, preventing test failures caused by the new global debug path.
- Ran nuxt-galaxy server tests successfully (246 passed, 3 skipped).
- Documented unrelated lint/typecheck failures in `@evlog/cli init` artifacts so later plans can address them without losing context.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the written audit report** — `1a298e29fb` (`docs(02-01): create evlog integration audit report`)
2. **Task 3: Implement real debug path + nuxt-galaxy quality gates** — `43d3f358e6` (`fix(02-01): route Effect.logDebug to evlog global log.debug`)

**Plan metadata:** to be committed after SUMMARY.md.

## Files Created/Modified

- `.planning/phases/02-review-spec-and-fix-evlog-integration/02-AUDIT.md` — Comprehensive evlog integration audit and verification results.
- `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts` — Removed `RequestLogWithDebug`; debug branch now calls `logToEvlogGlobal('debug', ...)`.
- `packages/nuxt-galaxy/test/server/utils/evlog-effect.test.ts` — Updated debug-routing assertions to expect global `log.debug`.
- `packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts` — Added `log` export to the `evlog` mock.

## Decisions Made

- **D-04 confirmed:** Proceed with routing `Effect.logDebug` to evlog's global `log.debug`. The request logger returned by `useLogger(event)` has no `debug` method, so the global logger is the correct severity-preserving destination.
- **Unrelated gate failures documented:** `pnpm lint`, `pnpm typecheck`, and the full `pnpm test` have pre-existing failures in `@evlog/cli init` artifacts (`server/plugins/evlog-drain.ts`, `AGENTS.md`) and a missing build output for `types-export.test.ts`. These are recorded in `02-AUDIT.md` and are out of scope for the tracer slice.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated sync-analyses test mock after debug routing change**
- **Found during:** Task 3
- **Issue:** After routing `Effect.logDebug` to the global logger, `sync-analyses.test.ts` failed because its `evlog` mock only exported `createRequestLogger` and not `log`.
- **Fix:** Added a `mockLog` object with `info`/`warn`/`error`/`debug` methods to the `evlog` mock in `sync-analyses.test.ts`.
- **Files modified:** `packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts`
- **Verification:** `pnpm --filter ./packages/nuxt-galaxy test:server` passes (246 passed, 3 skipped)
- **Committed in:** `43d3f358e6`

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking)
**Impact on plan:** Minimal. The change was a test-only mock update required by the new bridge behavior.

## Issues Encountered

- `pnpm --filter ./packages/nuxt-galaxy lint` fails on pre-existing `@evlog/cli init` artifacts (`packages/nuxt-galaxy/AGENTS.md`, `packages/nuxt-galaxy/server/plugins/evlog-drain.ts`).
- `pnpm --filter ./packages/nuxt-galaxy typecheck` fails on `packages/nuxt-galaxy/server/plugins/evlog-drain.ts` (missing `defineNitroPlugin` import and implicit `any`).
- `pnpm --filter ./packages/nuxt-galaxy test` fails on `test/types-export.test.ts` because `dist/runtime/types/nuxt-galaxy.d.ts` is missing (build artifact not generated). Server tests pass independently.
- All failures are in files not touched by this plan and are recorded in `02-AUDIT.md` §9.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `02-AUDIT.md` is the single source of truth for remaining fixes.
- Ready for Plan 02-02 (`@gaas/ui` composable `console.*` cleanup).
- Ready for Plan 02-03 (`@gaas/ui` components and header utilities).
- Ready for Plan 02-04 (`@gaas/wiki` build-time logging + AGENTS.md pointer).
- Ready for Plan 02-05 (`LOGGING-SPEC.md`, secrets/boundary audits, root quality gates).

---
*Phase: 02-review-spec-and-fix-evlog-integration*
*Completed: 2026-08-05*
