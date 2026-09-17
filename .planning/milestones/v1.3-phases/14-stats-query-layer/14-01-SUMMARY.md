---
phase: 14-stats-query-layer
plan: 01
subsystem: api
tags: [drizzle, effect, group-by, aggregation, success-rate, per-workflow, postgres]

requires:
  - phase: 12-schema-survival-columns
    provides: snapshot columns (workflow_name/workflow_version) with NULL=unknown (D-05) and version first-class (D-01)
  - phase: 13-write-path-integrity
    provides: snapshot frozen at write (D-10), outcome value semantics (pending/success/error/cancelled)
provides:
  - computeSuccessRate(success, error): single source-of-truth success-rate helper (STAT-04, D-01..D-03)
  - per-workflow usage query with grouped outcome breakdown and per-entry successRate (STAT-02, D-08)
  - getWorkflowUsage(ownerId) self variant + getAllWorkflowUsage() admin variant (D-12)
  - orphaned-workflow collapse into a single explicit 'unknown' bucket (D-09)
affects: [14-02-trend, 14-03-composite, 15-api-endpoints, 16-testing-quality-gates]

# Actuals (#2632) — pairs with the plan's estimate to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 2893        # chars/4 over the realized diff (11,570 added chars across 3 files)
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Drizzle GROUP BY workflow_id + count(*) filter (where outcome = ...) aggregation"
    - "JS-side orphan collapse (D-09): never send workflowId: null to the integer NOT NULL column"
    - "Self/admin parity via optional ownerId SELECT builder (mirrors selectCounts)"
    - "Single computeSuccessRate helper reused by every query path (D-03)"

key-files:
  created:
    - packages/nuxt-galaxy/src/runtime/types/nuxt-galaxy.ts (AnalysisMonitoringWorkflowUsage added)
  modified:
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts

key-decisions:
  - "computeSuccessRate is the only place the ratio is computed in the file (D-03), returning 0 on zero denominator (D-02)"
  - "selectWorkflowUsage takes an optional ownerId so the self variant WHERE owner_id is structural, never client-controlled (D-12, T-14-02 mitigation)"
  - "orphan collapse is pure JS shaping appended after non-orphan entries, producing exactly one explicit unknown bucket (D-09)"
  - "getWorkflowUsage/getAllWorkflowUsage pass an explicit onRejected handler to the Drizzle thenable so the underlying rejection reason reaches GetWorkflowUsageError.message"

patterns-established:
  - "Pattern 1: Per-dimension Effect read helpers = selectX(ownerId?) builder + shapeX(rows) JS shaping + getX(ownerId)/getAllX() self+admin exports with Data.TaggedError"

requirements-completed: [STAT-02, STAT-04]

# Coverage metadata (#1602) — one entry per shipped deliverable. Drives DETERMINISTIC UAT routing in verify-work.
coverage:
  - id: D1
    description: "computeSuccessRate(success, error) shared success-rate helper: 0 on zero denominator, 1 on no errors, consistent formula (STAT-04 D-01..D-03)"
    requirement: STAT-04
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts#computeSuccessRate"
        status: pass
    human_judgment: false
  - id: D2
    description: "getWorkflowUsage(ownerId) self variant: grouped per-workflow outcome breakdown, per-entry successRate, WHERE ownerId (STAT-02 D-08/D-12)"
    requirement: STAT-02
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts#getWorkflowUsage"
        status: pass
    human_judgment: false
  - id: D3
    description: "getAllWorkflowUsage() admin variant: same shape, no WHERE (D-12), RLS admin SELECT as authority"
    requirement: STAT-02
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts#getAllWorkflowUsage"
        status: pass
    human_judgment: false
  - id: D4
    description: "Orphaned workflows collapse into exactly one explicit 'unknown' bucket with summed counts (D-09); version stays first-class per entry (D-10)"
    requirement: STAT-02
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts#getWorkflowUsage boundary and error paths"
        status: pass
    human_judgment: false
  - id: D5
    description: "Boundary/error edges: empty set -> [], zero-terminal workflow -> successRate 0, rejection surfaces GetWorkflowUsageError, deterministic/repeatable ordering"
    requirement: STAT-02
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts#getWorkflowUsage boundary and error paths"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-08-10
status: complete
---

# Phase 14 Plan 01: Per-Workflow Usage & Shared Success-Rate Summary

**Per-workflow usage query (GROUP BY workflow_id + `count(*) filter (where outcome = ...)` aggregation) with a single shared `computeSuccessRate` helper, self/admin parity, and a JS collapsed `unknown` orphan bucket**

## Performance

- **Duration:** 5 min
- **Started:** 2026-08-10T20:00:57Z
- **Completed:** 2026-08-10T20:05:00Z (approx)
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `computeSuccessRate(success, error)` — the single source-of-truth success-rate (STAT-04): `success/(success+error)`, `0` on zero denominator (D-02), exactly ONE ratio literal in the file (D-03).
- `getWorkflowUsage(ownerId)` (self, WHERE owner_id) and `getAllWorkflowUsage()` (admin, no WHERE) — per-workflow outcome breakdown via `selectWorkflowUsage`, shaped by `shapeWorkflowUsage` (D-12).
- Orphaned workflows (non-null workflow_id, NULL snapshot name) collapse into exactly one explicit `unknown` bucket with summed counts (D-09); version stays first-class (D-10).
- `GetWorkflowUsageError` TaggedError surfaces on query rejection; explicit `onRejected` handler preserves the underlying reason in the message.
- `AnalysisMonitoringWorkflowUsage` extends `AnalysisMonitoringCounts` with workflowId/name/version/successRate.
- Existing `getAnalysisMonitoringCounts`/`getAllAnalysisMonitoringCounts`/`selectCounts` remain byte-identical (STAT-01 preserved).

## Task Commits

Each task was committed atomically (TDD):

1. **Task 1 RED: add failing per-workflow usage and success-rate tests** - `cfd14a88be` (test)
2. **Task 1 GREEN: implement computeSuccessRate and per-workflow usage helpers** - `a327624115` (feat)
3. **Task 2: add per-workflow boundary and error-path edge coverage** - `9c35938b20` (test)

**Plan metadata:** pending (next step)

## Files Created/Modified
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts` - added computeSuccessRate, GetWorkflowUsageError, selectWorkflowUsage, shapeWorkflowUsage, getWorkflowUsage, getAllWorkflowUsage (counts helpers untouched)
- `packages/nuxt-galaxy/src/runtime/types/nuxt-galaxy.ts` - added AnalysisMonitoringWorkflowUsage interface
- `packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts` - 12 new tests (computeSuccessRate + per-workflow + edge paths)

## Decisions Made
- computeSuccessRate is the only success-rate computation in the file (D-03), returning 0 for a zero denominator (D-02).
- selectWorkflowUsage takes an optional ownerId; the self variant always emits WHERE owner_id server-side (D-12), the documented T-14-02 mitigation.
- Orphan collapse is JS-only result shaping — never sends workflowId: null to the integer NOT NULL column (D-09).
- getWorkflowUsage/getAllWorkflowUsage pass an explicit onRejected handler so the underlying Drizzle rejection reason flows into GetWorkflowUsageError.message.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bugfix] Explicit onRejected handler on the Drizzle thenable**
- **Found during:** Task 2 (reject-path edge coverage)
- **Issue:** The plan prescribed using `mockDrizzleSelectRejects` and asserting `GetWorkflowUsageError.message` contains 'boom'. The fixture's rejecting chain only propagates the configured error when `.then` is called with a rejection handler as its second argument, but the initial implementation called `.then(rows => rows)` with a single argument — so the surfaced failure was a generic `TypeError: reject is not a function` instead of the DB error carrying 'boom'.
- **Fix:** Added `reason => { throw reason }` as the second `.then` argument in `getWorkflowUsage` and `getAllWorkflowUsage`, so the underlying rejection reason is rethrown and wrapped by `Effect.tryPromise` into `GetWorkflowUsageError.message`.
- **Files modified:** packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts
- **Verification:** reject-path test passes asserting `.message` contains 'boom' and `_tag === 'GetWorkflowUsageError'`
- **Committed in:** 9c35938b20

---

**Total deviations:** 1 auto-fixed (1 bugfix, Rule 1)
**Impact on plan:** Minimal — the fix only strengthens the error-propagation path (the function already failed with `GetWorkflowUsageError`, just with a less meaningful message). No scope creep.

## Issues Encountered
- The plan's `<verify>` command `pnpm --filter ./packages/nuxt-galaxy vitest run test/server/utils/grizzle/analysisMonitoring.test.ts` does not resolve a `vitest` script at the filter level. The working equivalent used throughout was `pnpm vitest run --config vitest.config.server.ts test/server/utils/grizzle/analysisMonitoring.test.ts` from `packages/nuxt-galaxy/` (the repo's `test` script runs both the default and server configs). Verification results below use the working command.

## User Setup Required

None - no external service configuration required.

## Verification Results

- Target test file: `pnpm vitest run --config vitest.config.server.ts test/server/utils/grizzle/analysisMonitoring.test.ts` → **48 passed / 48** (existing counts tests unchanged).
- Full server suite: `pnpm vitest run --config vitest.config.server.ts` → **36 files, 272 passed / 3 skipped** → PASS.
- Typecheck: `pnpm typecheck` → **green** (both vue-tsc passes).
- STAT-01 preservation: `git diff` on `analysisMonitoring.ts` shows only the import addition and appended code after `getAllAnalysisMonitoringCounts` — the counts helpers are byte-identical.
- Exactly one `success / (success + error)` ratio literal in the file (inside `computeSuccessRate`).

## Next Phase Readiness
- Per-workflow usage dimension (STAT-02) and shared success-rate (STAT-04) are complete and unit-tested; Plan 02 (trend dimension, STAT-03) can reuse `selectWorkflowUsage`'s `selectX(ownerId?)` builder + `shapeX(rows)` shaping pattern and the shared `computeSuccessRate`.
- No blockers.

## Self-Check: PASSED

Created files verified on disk; per-task commits verified in git log (`cfd14a88be`, `a327624115`, `9c35938b20`); all acceptance criteria and the plan-level verification pass.

---
*Phase: 14-stats-query-layer*
*Completed: 2026-08-10*
