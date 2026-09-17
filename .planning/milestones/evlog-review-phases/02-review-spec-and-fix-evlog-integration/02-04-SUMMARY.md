---
phase: 02-review-spec-and-fix-evlog-integration
plan: 04
subsystem: logging
tags: [evlog, logging, @nuxt/kit, AGENTS.md, wiki, build-time]

requires:
  - phase: 02-review-spec-and-fix-evlog-integration
    provides: Audit findings A-05 (wiki console.log) and D-02 convention authority from 02-01

provides:
  - packages/wiki/nuxt.config.ts free of raw console.* build-time logging
  - All five AGENTS.md files pointing to .planning/LOGGING-SPEC.md with secrets rule retained

affects:
  - 02-05-PLAN.md

actuals:
  tokens: 2714
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Build-time module lifecycle diagnostics use @nuxt/kit logger.withTag(...)"
    - "AGENTS.md keeps only high-level logging pointer + secrets rule; detailed spec lives in .planning/LOGGING-SPEC.md"

key-files:
  created: []
  modified:
    - packages/wiki/nuxt.config.ts
    - AGENTS.md
    - packages/nuxt-galaxy/AGENTS.md
    - packages/ui/AGENTS.md
    - packages/wiki/AGENTS.md
    - playground/AGENTS.md

key-decisions:
  - "Removed the duplicate @evlog/cli init artifact packages/wiki/server/plugins/evlog-drain.ts because it duplicated the hand-written src/runtime/server/plugins/evlog.server.ts wiring and its lint error blocked the wiki package lint gate."

patterns-established: []

requirements-completed:
  - REVW-01
  - FIX-02

status: complete
duration: 12min
completed: 2026-08-05
---

# Phase 02 Plan 04: Fix @gaas/wiki build-time logging and update AGENTS.md pointers

**`packages/wiki/nuxt.config.ts` now uses `@nuxt/kit`'s `logger.withTag('@gaas/wiki')` for build-time diagnostics, and every project/package `AGENTS.md` defers logging conventions to `.planning/LOGGING-SPEC.md` while keeping the secrets rule.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-05T17:47:32Z
- **Completed:** 2026-08-05T18:00:02Z
- **Tasks:** 2/2
- **Files modified:** 6

## Accomplishments

- Replaced the raw `console.log('Parsed content:', ctx.file.id)` in `packages/wiki/nuxt.config.ts` with `log.info(`Parsed content: ${ctx.file.id}`)` using `logger.withTag('@gaas/wiki')` from `@nuxt/kit`.
- Removed the duplicate `@evlog/cli` init artifact `packages/wiki/server/plugins/evlog-drain.ts` that duplicated the existing `src/runtime/server/plugins/evlog.server.ts` wiring.
- Rewrote the logging section in all five `AGENTS.md` files (root, nuxt-galaxy, ui, wiki, playground) to point to `.planning/LOGGING-SPEC.md` for authoritative conventions.
- Retained the "Never log secrets" permission boundary in every `AGENTS.md`.
- Included a short orientation covering server routes, client code, module lifecycle, standalone scripts/tasks, and Effect programs.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace wiki build-time console.log with @nuxt/kit logger** - `b87c2de` (fix)
2. **Task 2: Reduce all AGENTS.md logging sections to spec pointers** - `bc36471` (docs)

## Files Created/Modified

- `packages/wiki/nuxt.config.ts` - Uses `@nuxt/kit` `logger.withTag('@gaas/wiki')` for the `content:file:afterParse` hook; added local `body` type assertion to satisfy `vue-tsc` without changing hook logic.
- `AGENTS.md` - Replaced detailed `## Logging` bullets with pointer to `.planning/LOGGING-SPEC.md` and wrapped in `<!-- evlog:start -->...<!-- evlog:end -->`.
- `packages/nuxt-galaxy/AGENTS.md` - Replaced injected evlog block with spec pointer.
- `packages/ui/AGENTS.md` - Replaced injected evlog block with spec pointer.
- `packages/wiki/AGENTS.md` - Replaced injected evlog block with spec pointer.
- `playground/AGENTS.md` - Replaced injected evlog block with spec pointer.
- `packages/wiki/server/plugins/evlog-drain.ts` - Deleted duplicate `@evlog/cli` init artifact.

## Decisions Made

- Followed the module-lifecycle convention from `02-PATTERNS.md` §11: build-time hooks use `@nuxt/kit` logger, not `evlog/client` or raw `console.*`.
- Removed the duplicate FS drain plugin in `@gaas/wiki` rather than fixing its lint error, because `02-AUDIT.md` A-06 already classified it as a duplicate of the hand-written runtime wiring.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed duplicate `packages/wiki/server/plugins/evlog-drain.ts`**
- **Found during:** Task 1 verification (`pnpm --filter ./packages/wiki lint`)
- **Issue:** The `@evlog/cli init` artifact `packages/wiki/server/plugins/evlog-drain.ts` had an `antfu/if-newline` lint error and duplicated the existing `src/runtime/server/plugins/evlog.server.ts` + `src/runtime/server/utils/evlog-drain.ts` wiring noted in `02-AUDIT.md` A-06.
- **Fix:** Deleted the duplicate file.
- **Files modified:** `packages/wiki/server/plugins/evlog-drain.ts` (deleted)
- **Verification:** `pnpm --filter ./packages/wiki lint` passes after deletion.
- **Committed in:** `b87c2de` (Task 1 commit)

**2. [Rule 3 - Blocking] Added type assertion for `ctx.content.body` in `packages/wiki/nuxt.config.ts`**
- **Found during:** Task 1 verification (`pnpm --filter ./packages/wiki typecheck`)
- **Issue:** `vue-tsc` reported `ctx.content.body` as `unknown` on lines accessing `.value` and `.toc.links`.
- **Fix:** Introduced a local `body` constant with an explicit type assertion; hook logic remains unchanged.
- **Files modified:** `packages/wiki/nuxt.config.ts`
- **Verification:** Wiki-specific type errors in `nuxt.config.ts` no longer appear; remaining typecheck failures are in `@gaas/ui` files (see Issues Encountered).
- **Committed in:** `b87c2de` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both deviations were required to clear the package-level lint gate and the file-specific type errors introduced by strict `vue-tsc`. No scope creep beyond the immediate verification blockers.

## Issues Encountered

Package-wide `pnpm --filter ./packages/wiki typecheck` and root `pnpm lint` do **not** pass because of pre-existing errors in files outside this plan's scope:

- **`pnpm --filter ./packages/wiki typecheck` failures (4):**
  - `../ui/app/components/HeroShadersDynamic.vue:3:10` — Cannot find module `~/components/HeroShadersDynamic.client.vue`
  - `../ui/app/components/plot/Table.vue:16:26` and `84:69` — Mosaic/Table `defineModel`/`VisibilityState` type mismatches
  - `../ui/app/pages/index.vue:345:26` — Clipboard value `string | undefined` mismatch

  These are all in `@gaas/ui` and were already classified as pre-existing type issues in `02-AUDIT.md` and `02-02-SUMMARY.md`. The `@gaas/wiki`-specific `nuxt.config.ts` type errors were fixed in this plan.

- **Root `pnpm lint` failures (2 in `@gaas/ui`):**
  - `packages/ui/nuxt.config.ts:31:17` — `style/comma-dangle`
  - `packages/ui/server/plugins/evlog-drain.ts:10:23` — `antfu/if-newline` (duplicate `@evlog/cli` init artifact, see `02-AUDIT.md` A-06)

  These were also documented in `02-02-SUMMARY.md` as pre-existing `@evlog/cli` init artifacts / generated files.

- **False-positive `console.*` grep in root `AGENTS.md`:**
  - The root `AGENTS.md` context-mode routing rules (line 208) legitimately mention `console.log()` as an example of output to avoid when using context-mode tools. This is not logging guidance and was not modified.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `@gaas/wiki` build-time logging now follows the module-lifecycle convention.
- Project and package-level logging guidance defers to `.planning/LOGGING-SPEC.md` without duplication.
- Ready for `02-05-PLAN.md`: author `LOGGING-SPEC.md`, run secrets/boundary audits, and clear remaining `@evlog/cli` init artifacts / root quality gates.

---
*Phase: 02-review-spec-and-fix-evlog-integration*
*Completed: 2026-08-05*
