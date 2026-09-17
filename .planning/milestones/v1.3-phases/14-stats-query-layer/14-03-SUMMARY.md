---
phase: 14-stats-query-layer
plan: 03
subsystem: api
tags: [effect, drizzle, stats, success-rate, composite, server]

requires:
  - phase: 14-stats-query-layer
    provides: 14-01 per-workflow usage + shared computeSuccessRate; 14-02 UTC trend series + enqueueResult queue
provides:
  - "getAnalysisMonitoringStats(ownerId) / getAllAnalysisMonitoringStats() composite assembly of counts + perWorkflow + trend"
  - "AnalysisMonitoringStats additive interface extending AnalysisMonitoringCounts with perWorkflow, trend, successRate"
  - "GetAnalysisMonitoringStatsError tagged error wrapping constituent failures"
  - "cross-dimension success-rate parity + passthrough uniformity proof (STAT-04)"
affects: [15-api-endpoints]

actuals:
  tokens: 2558        # chars/4 over the realized diff (10231 added chars)
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Effect.all tuple assembly mapping constituent errors to a composite TaggedError via Effect.mapError"
    - "additive interface extension (AnalysisMonitoringStats extends AnalysisMonitoringCounts) for backward-compatible reads"

key-files:
  created: []
  modified:
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts
    - packages/nuxt-galaxy/src/runtime/types/nuxt-galaxy.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts

key-decisions:
  - "overall successRate computed exclusively via computeSuccessRate(success, error) — no inline ratio literal (D-03 continuity)"
  - "composite uses Effect.all with default sequential execution so the enqueueResult queue pops deterministically (counts, perWorkflow, trend range, trend buckets)"
  - "self/admin composite variants compose only the ownerId-scoped / all-rows underlying helpers respectively; preserved counts helpers left byte-identical"

patterns-established:
  - "Composite dimension (D-11) is the single public seam for Phase 15 endpoints: counts spread + perWorkflow + trend + overall successRate"

requirements-completed: [STAT-01, STAT-04]

coverage:
  - id: D1
    description: "getAnalysisMonitoringStats/getAllAnalysisMonitoringStats assemble counts + perWorkflow + trend into the additive AnalysisMonitoringStats shape with an overall successRate routed through computeSuccessRate; self filters owner_id, admin is all-rows, preserved counts helpers byte-identical"
    requirement: STAT-01
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts#getAnalysisMonitoringStats"
        status: pass
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts#getAllAnalysisMonitoringStats"
        status: pass
    human_judgment: false
  - id: D2
    description: "cross-dimension success-rate parity — composite overall, each perWorkflow entry, and each trend point all equal computeSuccessRate(recomputed from their success/error); perWorkflow/trend passed through unchanged"
    requirement: STAT-04
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts#cross-dimension success-rate parity and uniformity"
        status: pass
    human_judgment: false

# Metrics
duration: 3min
completed: 2026-08-10
status: complete
---

# Phase 14 Plan 3: Composite helper — counts + perWorkflow + trend assembly Summary

**getAnalysisMonitoringStats/**getAllAnalysisMonitoringStats** assemble the three finished monitoring dimensions into the additive `AnalysisMonitoringStats` object, routing every success-rate through the single shared `computeSuccessRate` formula and proving parity across all query paths (STAT-04).**

## Performance

- **Duration:** 3 min
- **Started:** 2026-08-10T20:18:30Z
- **Completed:** 2026-08-10T20:21:09Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `getAnalysisMonitoringStats(ownerId)` composing `getAnalysisMonitoringCounts(ownerId)`, `getWorkflowUsage(ownerId)`, and `getTrend(ownerId)` under `Effect.all`, returning `{ ...counts, successRate, perWorkflow, trend }`.
- Added `getAllAnalysisMonitoringStats()` admin variant composing the all-rows `getAll*` helpers with zero `WHERE`.
- Added `GetAnalysisMonitoringStatsError` mapping any constituent failure under `Effect.mapError`.
- Added `AnalysisMonitoringStats` interface extending `AnalysisMonitoringCounts` with `perWorkflow`, `trend`, and `successRate` (backward compatible additive extension).
- Proved STAT-04 parity: the overall, per-workflow, and trend success-rates all equal `computeSuccessRate` recomputed per path; perWorkflow/trend are passed through unchanged.
- Preserved all existing counts/per-workflow/trend helpers byte-identical; no schema/migration/index file touched.

## Task Commits

Each task was committed atomically (Task 1 was TDD, producing two commits):

1. **Task 1 (RED): failing composite helper assembly tests** - `234d2f91e1` (test)
2. **Task 1 (GREEN): composite helper implementation** - `f3f832bbc9` (feat)
3. **Task 2: success-rate parity + passthrough uniformity tests** - `c387ee6357` (test)

**Plan metadata:** pending (committed after this summary)

## Files Created/Modified

- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts` - Added `GetAnalysisMonitoringStatsError`, `getAnalysisMonitoringStats`, `getAllAnalysisMonitoringStats` (pure append; all prior helpers untouched)
- `packages/nuxt-galaxy/src/runtime/types/nuxt-galaxy.ts` - Added `AnalysisMonitoringStats` interface
- `packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts` - Added composite assembly + parity + uniformity tests (63 tests in file, all pass)

## Decisions Made

- Overall `successRate` routed exclusively through `computeSuccessRate(success, error)` to keep every path on the one documented formula (STAT-04 / D-01..D-03); no inline ratio introduced.
- Composite uses `Effect.all` on its default **sequential** execution; the `enqueueResult` queue (from Plan 02's `fixtures.ts`) pops deterministically in the order counts → perWorkflow → trend range → trend buckets. `fixtures.ts` left untouched this plan.
- Self and admin variants compose only ownerId-scoped / all-rows underlying helpers respectively, preserving the T-14-09 (owner isolation) and T-14-10 (admin all-rows, RLS) trust boundaries.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- One corrected test expectation: the composite's `perWorkflow` array is the *shaped* output of `getWorkflowUsage` (which adds `successRate`), so the expected fixture constant needed a `successRate` field. Not a code defect — a test-fixture expectation fix folded into the GREEN commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The composite (`getAnalysisMonitoringStats` / `getAllAnalysisMonitoringStats`) is the complete, tested seam Phase 15's API endpoints consume; its shape is exactly the additive `AnalysisMonitoringStats` extension.
- All verification gates green: target test file (63 pass), full package test (64 + 287 pass), package typecheck, and package lint.

---
*Phase: 14-stats-query-layer*
*Completed: 2026-08-10*

## Self-Check: PASSED

- 14-03-SUMMARY.md exists on disk
- Task commits verified in git log: `234d2f91e1` (RED), `f3f832bbc9` (GREEN), `c387ee6357` (Task 2); metadata `cdb22be21e`, state `07fc89ff2e`
- Target test file: 63/63 pass; package test: 64 + 287 pass; package typecheck clean; package lint clean
- Preserved counts helpers byte-identical (pure append); fixtures.ts untouched; no schema/migration/index file modified
