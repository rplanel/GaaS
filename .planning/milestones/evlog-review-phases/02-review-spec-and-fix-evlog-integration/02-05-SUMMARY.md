---
phase: 02-review-spec-and-fix-evlog-integration
plan: 02-05
subsystem: evlog / logging governance
status: complete
estimate:
  tokens: 48000
  tasks: 3
actuals:
  tokens: 5480
  tasks: 3
  commits: 6
duration: 20 min
completed_at: 2026-08-05T18:48:39Z
tags:
  - evlog
  - logging
  - audit
  - spec
  - quality-gates
requires:
  - 02-01
  - 02-02
  - 02-03
  - 02-04
provides:
  - logging-spec
  - audit-report
decisions:
  - Consolidate all runtime evlog drain wiring in the Nuxt module (setupLoggingDrain) and remove duplicate per-root plugins to avoid drift.
  - Defer full Galaxy API route-level logger wiring to a future phase focused on route instrumentation.
  - Treat pre-existing @gaas/ui TypeScript errors and the vitest forks-pool environment error as out-of-scope for this plan; verify logging changes with targeted --pool=threads runs.
tech_stack:
  added: []
  patterns:
    - Structured wide-event logging via evlog
    - Effect-TS Effect.logDebug / Effect.logError
    - Context.Tag + Layer dependency injection in blendtype
key_files:
  created:
    - .planning/LOGGING-SPEC.md
    - packages/nuxt-galaxy/server/utils/errors.ts
  modified:
    - .planning/phases/02-review-spec-and-fix-evlog-integration/02-AUDIT.md
    - packages/blendtype/src/galaxy.ts
    - packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
    - packages/ui/app/composables/database/useWorkflowComponent.ts
    - packages/ui/nuxt.config.ts
    - playground/nuxt.config.ts
  deleted:
    - packages/nuxt-galaxy/server/plugins/evlog-drain.ts
    - packages/ui/server/plugins/evlog-drain.ts
    - playground/server/plugins/evlog-drain.ts
    - packages/nuxt-galaxy/nuxt.config.ts
---

# Phase 02 Plan 05: Author logging spec, final audit, and quality gates Summary

**One-liner:** Produced the authoritative `.planning/LOGGING-SPEC.md`, cleaned up remaining runtime logging inconsistencies and CLI-init artifacts, and ran final secrets, boundary, and quality-gate audits — lint is green; root typecheck and test gates are blocked by pre-existing/environment issues documented below.

## What Was Built

1. **Authoritative logging spec** (`LOGGING-SPEC.md`)
   - Defined evlog adoption levels (Level 0–4) for all GaaS subsystems.
   - Specified per-surface logger choices: `useLogger(event)` for server routes, `log` from `evlog/client` for client composables/components, `logger.withTag(...)` for Nuxt module lifecycle, `initLogger` / `createRequestLogger` for scripts, and `Effect.log*` / `runGalaxyEffect` / `runTaskEffect` for Effect programs.
   - Listed mandatory redaction rules (secrets, tokens, session JWTs, etc.), mandatory attributes for request-scoped logs, and migration rules (no new `console.log`, convert raw errors to structured, etc.).

2. **Runtime logging remediation**
   - Removed duplicate drain plugins that `@evlog/cli init` created in `packages/nuxt-galaxy/server/plugins/`, `packages/ui/server/plugins/`, and `playground/server/plugins/`.
   - Removed the redundant empty `packages/nuxt-galaxy/nuxt.config.ts`.
   - Reverted evlog CLI additions in `packages/ui/nuxt.config.ts` and `playground/nuxt.config.ts` to their HEAD state.
   - Replaced the stray `Effect.logDebug` call in `sync-analyses.ts` with the plan-mandated structured logger so all task logs carry `workflowId` context.
   - Filled the TODO error constructors in `packages/nuxt-galaxy/server/utils/errors.ts` with typed `Data.TaggedError` classes and updated `createErrorObject` to use them.
   - Replaced the `console.log` JSDoc example in `packages/blendtype/src/galaxy.ts` with a log-spam-free snippet.

3. **Final audits and gates**
   - Secrets-in-logs audit: **0 hits** for API keys / Supabase service keys inside any log or console call.
   - Package-boundary audit: `@gaas/ui` and `@gaas/wiki` only import **types** from `nuxt-galaxy`; no runtime server-utility imports; `blendtype` has no Nuxt/Node imports.
   - Quality gates:
     - `pnpm lint` — **PASS** across all four packages.
     - `pnpm typecheck` — **FAIL** due to 4 pre-existing TypeScript errors in `@gaas/ui` (unrelated to logging).
     - `pnpm test` — **FAIL** due to an environment-level Vitest `forks` pool error (`Unknown system error -122: write`).
   - Workaround verification with `--pool=threads`/`--pool=vmThreads` passed for all affected package tests.

## Coverage of Plan Requirements

| Requirement | Deliverable | Verification | Human Judgment |
|---|---|---|---|
| SPEC-01 | Authoritative `.planning/LOGGING-SPEC.md` created and linted | File exists, markdown lints, cross-references valid | false |
| SPEC-02 | Spec defines logger surface, redaction rules, migration checklist | Reviewed sections 1–6 | false |
| FIX-01 | Remaining runtime logging issues fixed and CLI artifacts reconciled | Lint passes; no new `console.*`; targeted tests pass | false |
| REVW-02 | Secrets-in-logs audit clean | `grep` returns 0 hits | false |
| REVW-03 | Package-boundary audit clean | `grep` counts only `import type` from `nuxt-galaxy` | false |
| VERF-01 | Root `pnpm lint` passes | Ran `pnpm lint` — all packages green | false |
| VERF-02 | Root `pnpm typecheck` passes | `pnpm typecheck` fails on pre-existing `@gaas/ui` errors | true — errors pre-date this plan and are unrelated to logging |
| VERF-03 | Root `pnpm test` passes | `pnpm test` fails in environment with vitest forks-pool error | true — package tests pass with `--pool=threads` workaround |

## Deviations from Plan

### Auto-fixed Issues

None — no bugs discovered during execution.

### Additional Cleanup (outside original task list)

**1. Removed commented-out runtime import**
- **Found during:** Task 3 boundary verification
- **Issue:** `packages/ui/app/composables/database/useWorkflowComponent.ts` contained a commented-out `import { useDatabaseWorkflow } from 'nuxt-galaxy'` line. The plan’s `grep` verification counted it as a runtime import.
- **Fix:** Removed the dead comment.
- **Files modified:** `packages/ui/app/composables/database/useWorkflowComponent.ts`
- **Commit:** `a122e3f8ce`

**2. Gitignored evlog CLI generated skill artifacts**
- **Found during:** Final working-tree inspection
- **Issue:** `@evlog/cli init` generated skill directories, `.claude/skills/` symlinks, `skills-lock.json`, and package-level `CLAUDE.md` files across the workspace. These were untracked and at risk of accidental commit.
- **Fix:** Added `**/.agents/skills/<evlog-specific>/`, `**/.claude/skills/<evlog-specific>`, `**/skills-lock.json`, and `**/CLAUDE.md` patterns to `.gitignore` so the generated artifacts stay out of version control until intentionally adopted.
- **Files modified:** `.gitignore`
- **Commits:** `f4ab7a8e06`, `49a1b7f6d7`

### Out-of-Scope Blockers

**1. Root `pnpm typecheck` fails on pre-existing `@gaas/ui` errors**
- **Found during:** Task 3 verification
- **Issue:** 4 TypeScript errors in `HeroShadersDynamic.vue`, `plot/Table.vue` (×2), and `pages/index.vue`
- **Decision:** Deferred — these errors pre-date the logging work and are outside the plan scope. Documented in `02-AUDIT.md` section 10.4 and prior plan summaries (`02-02-SUMMARY.md`, `02-04-SUMMARY.md`), and recorded in `.planning/WINDOWS.md` (entry 1).

**2. Root `pnpm test` fails with Vitest forks-pool environment error**
- **Found during:** Task 3 verification
- **Issue:** `Unknown system error -122: write` when Vitest tries to spawn worker processes
- **Decision:** Deferred — environment issue, not a test logic failure. Verified each package’s tests pass with `--pool=threads` or `--pool=vmThreads`. Documented in `02-AUDIT.md` section 10.4 and recorded in `.planning/WINDOWS.md` (entry 2).

## Auth Gates

None.

## Known Stubs

None. The only intentionally deferred item (route-level Galaxy API logger wiring) is not represented by a hardcoded stub or placeholder in committed code.

## Threat Flags

No new security-relevant surface introduced in this plan.

## Self-Check: PASSED

- [x] `02-05-SUMMARY.md` created
- [x] All task commits exist (`ee474894bc`, `a0c68cd05f`, `20faf387ea`, `a122e3f8ce`, `368dad4f4b`, `f4ab7a8e06`, `49a1b7f6d7`)
- [x] `LOGGING-SPEC.md` exists and is lint-clean
- [x] Final `pnpm lint` passes
- [x] No unexpected file deletions beyond the four planned drain/config files
