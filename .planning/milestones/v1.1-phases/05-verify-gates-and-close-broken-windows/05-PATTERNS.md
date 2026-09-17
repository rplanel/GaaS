# Phase 05: Verify Gates and Close Broken Windows - Pattern Map

**Mapped:** 2026-08-06
**Files analyzed:** 2
**Analogs found:** 2 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.planning/WINDOWS.md` | config | batch / transform | `.planning/WINDOWS.md` (same file) | exact |
| `.planning/phases/05-verify-gates-and-close-broken-windows/05-01-SUMMARY.md` | config | batch / transform | `.planning/phases/04-fix-root-test-runner-failure/04-01-SUMMARY.md` | exact |

## Pattern Assignments

### `.planning/WINDOWS.md` (config, batch / transform)

**Analog:** `.planning/WINDOWS.md` (lines 1-48)

**Current frontmatter pattern** (lines 1-8):
```yaml
---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 0
total_count: 2
last_updated: 2026-08-05T18:58:37.534Z
---
```

**Current ledger table pattern** (lines 16-19):
```markdown
| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 02 | unrun-verify | package.json |  | Root pnpm typecheck fails on 4 pre-existing @gaas/ui TypeScript errors unrelated to logging work | open |  | 2026-08-05T18:58:25.041Z |  |
| 2 | 02 | unrun-verify | package.json |  | Root pnpm test fails with vitest forks-pool environment error Unknown system error -122 write; package tests pass with --pool=threads | open |  | 2026-08-05T18:58:37.534Z |  |
```

**Current JSON block pattern** (lines 22-47):
```json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "package.json",
    "line": null,
    "description": "Root pnpm typecheck fails on 4 pre-existing @gaas/ui TypeScript errors unrelated to logging work",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-05T18:58:25.041Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "package.json",
    "line": null,
    "description": "Root pnpm test fails with vitest forks-pool environment error Unknown system error -122 write; package tests pass with --pool=threads",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-05T18:58:37.534Z",
    "resolved_at": null
  }
]
```

**Transformation to apply** (per CONTEXT.md D-02):
- Update frontmatter: `open_count: 0`, `fixed_count: 2`, `last_updated` to current ISO timestamp.
- Update table rows: `status` from `open` to `fixed`, `resolved_at` to current ISO timestamp.
- Update JSON entries: `status` from `"open"` to `"fixed"`, `resolved_at` from `null` to current ISO timestamp.
- Keep `schema_version`, `waived_count`, `total_count`, `recorded_at`, `reason` unchanged.

---

### `.planning/phases/05-verify-gates-and-close-broken-windows/05-01-SUMMARY.md` (config, batch / transform)

**Analog:** `.planning/phases/04-fix-root-test-runner-failure/04-01-SUMMARY.md`

**Frontmatter pattern** (from 04-01-SUMMARY.md, lines 1-72):
```yaml
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
```

**Body section pattern** (from 04-01-SUMMARY.md, lines 74-150):
```markdown
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
```

**Pattern to apply for Phase 05:**
- Frontmatter:
  - `phase: 05-verify-gates-and-close-broken-windows`
  - `plan: 01`
  - `subsystem: verification` (or `quality-gates`)
  - `tags: [lint, typecheck, test, quality-gates, broken-windows]`
  - `requires:` reference Phase 03 and Phase 04
  - `provides:` list green root `pnpm lint`, `pnpm typecheck`, `pnpm test`, and closed broken windows
  - `affects:` leave empty or list downstream ship/audit phases
  - `key-files.created:` empty; `key-files.modified:` `.planning/WINDOWS.md`
  - `requirements-completed:` `[VERIFY-01, VERIFY-02, VERIFY-03]`
  - `coverage:` one entry per gate plus one for broken-window closure, each `status: pass`
- Body sections to mirror: `# Phase 05 Plan 01: Verify Gates and Close Broken Windows Summary`, `## Performance`, `## Accomplishments`, `## Task Commits`, `## Files Created/Modified`, `## Decisions Made`, `## Deviations from Plan`, `## Issues Encountered`, `## User Setup Required`, `## Next Phase Readiness`, `## Self-Check: PASSED`.

---

## Shared Patterns

### Planning Artifact YAML Frontmatter
**Source:** `.planning/phases/04-fix-root-test-runner-failure/04-01-SUMMARY.md` (lines 1-72) and `.planning/WINDOWS.md` (lines 1-8)
**Apply to:** Both new/modified planning artifacts
```yaml
---
schema_version: 1          # WINDOWS.md only
phase: <kebab-case-name>
plan: 01
subsystem: <domain>
tags: [<relevant>, <tags>]
# ...
---
```

### ISO 8601 Timestamp Updates
**Source:** `.planning/WINDOWS.md` (line 7) and `04-01-SUMMARY.md` (lines 81-82)
**Apply to:** `.planning/WINDOWS.md` when marking windows fixed
Use `new Date().toISOString()` format (e.g., `2026-08-06T12:34:56.789Z`) for `last_updated`, `resolved_at`, `started`, and `completed` fields.

### Coverage Verification Entry
**Source:** `.planning/phases/04-fix-root-test-runner-failure/04-01-SUMMARY.md` (lines 45-62)
**Apply to:** `05-01-SUMMARY.md` coverage block
```yaml
coverage:
  - id: D1
    description: Root `pnpm lint` exits 0 with no errors.
    requirement: VERIFY-01
    verification:
      - kind: other
        ref: "pnpm lint (root)"
        status: pass
    human_judgment: false
```

## No Analog Found

None — both identified files have exact or strong analogs in the existing planning artifacts.

## Metadata

**Analog search scope:** `.planning/**/*.md`, `.planning/phases/03-fix-gaas-ui-typescript-errors/`, `.planning/phases/04-fix-root-test-runner-failure/`
**Files scanned:** 3 planning artifacts (`WINDOWS.md`, `03-01-SUMMARY.md`, `04-01-SUMMARY.md`)
**Pattern extraction date:** 2026-08-06
