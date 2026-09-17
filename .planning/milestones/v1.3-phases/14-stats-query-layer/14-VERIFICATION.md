---
phase: 14-stats-query-layer
verified: 2026-08-10T22:27:00Z
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: null
gaps: []
deferred: []
behavior_unverified_items: []
human_verification: []
---

# Phase 14: Stats Query Layer Verification Report

**Phase Goal:** Self and admin callers can query the four usage-statistic dimensions through typed Effect helpers.
**Verified:** 2026-08-10T22:27:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

This phase is query-layer only. The four Success Criteria from ROADMAP are all demonstrably true in the codebase at `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts`, backed by passing behavioral unit tests in `test/server/utils/grizzle/analysisMonitoring.test.ts` (63/63 pass, run locally this session). No API endpoints / UI / schema changes were expected (deferred to Phase 15/16), and none were introduced — confirmed by git diff (only the 4 in-scope package files + planning docs changed; no schema/migration/index file touched).

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | Per-user count query returns total + success/error/cancelled/pending breakdown, preserving existing count behavior (SC1 / STAT-01) | ✓ VERIFIED | `getAnalysisMonitoringCounts(ownerId)` / `getAllAnalysisMonitoringCounts()` (analysisMonitoring.ts:302-334) byte-identical — git diff `063ef41d3d..HEAD` shows no edits inside the counts helpers or `selectCounts` (only new `Effect.all` references in the composite). Existing counts tests at lines 307-329, 526-547 still pass. |
| 2   | Per-user query returns per-workflow usage grouped by `workflow_id` using the snapshotted name, incl. explicit `unknown` bucket for orphans (SC2 / STAT-02) | ✓ VERIFIED | `getWorkflowUsage(ownerId)` / `getAllWorkflowUsage()` + `selectWorkflowUsage` (GROUP BY workflow_id, `count(*) filter` breakdowns) + `shapeWorkflowUsage` singleton unknown-bucket collapse (D-09). Types: `AnalysisMonitoringWorkflowUsage extends AnalysisMonitoringCounts { workflowId, name, version, successRate }`. Tests: self-WHERE, admin-no-WHERE, orphan collapse (single unknown entry, summed counts), version parity — all pass. |
| 3   | Per-user query returns a UTC time-bucket trend series on `started_at` where bucket sums equal the total (SC3 / STAT-03) | ✓ VERIFIED | `getTrend(ownerId, granularity?)` / `getAllTrend()` use `date_trunc(gran, started_at AT TIME ZONE 'UTC')` (utcBucket shared by range-floor and bucket GROUP BY, D-06/D-07); continuous zero-fill over data-derived range with calendar-aware month stepping; canonical UTC bucket keys. Tests prove zero-fill (empty middle bucket), month-boundary stepping (2026-01/02/03), bucket-sums=total (7=4+3), no dropped/duplicated rows, UTC normalization across a session-timezone day boundary — all pass. |
| 4   | A single, documented success-rate formula yields the same value across all query paths (SC4 / STAT-04) | ✓ VERIFIED | `computeSuccessRate(success, error)` (analysisMonitoring.ts:344-350) is the only ratio source — exactly ONE `success / (success + error)` literal in the whole file (confirmed by grep count = 1). Every path routes through it: per-workflow (shapeWorkflowUsage), trend (buildTrendSeries), composite overall (getAnalysisMonitoringStats). Parity test (lines 1040-1067) recomputes computeSuccessRate per entry across composite/perWorkflow/trend and asserts equality — this is the executable STAT-04 proof. Passes. |
| 5   | Composite assembles counts + perWorkflow + trend into additive `AnalysisMonitoringStats` (D-11) | ✓ VERIFIED | `getAnalysisMonitoringStats(ownerId)` / `getAllAnalysisMonitoringStats()` run the three dimensions under `Effect.all` and spread counts + successRate + perWorkflow + trend. Type `AnalysisMonitoringStats extends AnalysisMonitoringCounts`. Composite tests (lines 942-1037) assert the additive shape, overall successRate, and self/admin where-parity — pass. |
| 6   | Self variant always filters `owner_id` server-side; admin variant is all-rows (D-12) | ✓ VERIFIED | `selectWorkflowUsage`/`selectTrendRange`/`selectTrendBuckets`/`selectCounts` all take optional `ownerId` and emit `WHERE eq(analysisMonitoring.ownerId, ownerId)` only for self. Tests assert self emits the WHERE (incl. 4 WHERE calls across the composite) and admin emits zero `.where()` calls. |
| 7   | Zero-terminal-outcome rate is 0, never null (D-02) | ✓ VERIFIED | `computeSuccessRate` returns 0 on zero denominator; tested for per-workflow (line 654), trend middle bucket, and composite overall (line 991) successRate === 0. |
| 8   | Granularity is a closed `'day'|'week'|'month'` allowlist, never interpolated from caller input (D-04 / T-14-05) | ✓ VERIFIED | `TrendGranularity` type + `TREND_INTERVALS` fixed literal map (analysisMonitoring.ts:468-475). `date_trunc(${gran}, ...)` takes the allowlisted granularity string (Drizzle parameter, not concatenation). Test asserts TREND_INTERVALS is the closed map. |
| 9   | Trend/empty-range returns `[]`: no phantom `unknown` bucket on zero rows | ✓ VERIFIED | `buildTrendSeries` returns `[]` on null min/max (STAT-03 empty edge); `shapeWorkflowUsage` only appends the unknown entry when `orphanTotal > 0`. Both empty-edge tests pass. |

**Score:** 9/9 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected    | Status | Details |
| -------- | ----------- | ------ | ------- |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts` | computeSuccessRate, getWorkflowUsage/getAllWorkflowUsage, getTrend/getAllTrend, getAnalysisMonitoringStats/getAllAnalysisMonitoringStats, TREND_INTERVALS, TrendGranularity, Get*Error tags | ✓ VERIFIED | All present and exported; documented; no debt markers (grep TBD/FIXME/XXX/TODO = none). |
| `packages/nuxt-galaxy/src/runtime/types/nuxt-galaxy.ts` | AnalysisMonitoringWorkflowUsage, AnalysisMonitoringTrendPoint, AnalysisMonitoringStats (all extend AnalysisMonitoringCounts) | ✓ VERIFIED | Lines 120-136 exactly as specified, additive. |
| `packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts` | per-workflow + computeSuccessRate + trend + composite + parity tests | ✓ VERIFIED | 63 tests; runs green locally. |
| `packages/nuxt-galaxy/test/server/fixtures.ts` | `enqueueResult` FIFO result-sequencing queue | ✓ VERIFIED | Lines 454-473; backward compatible with `setResult`. |

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| computeSuccessRate | shapeWorkflowUsage / buildTrendSeries / composite | single helper call | ✓ WIRED | Only ratio literal is inside computeSuccessRate (grep count = 1). |
| getWorkflowUsage(self) | analysisMonitoring table | `.where(eq(analysisMonitoring.ownerId, ownerId))` | ✓ WIRED | Test asserts WHERE equals eq(ownerId). |
| getTrend/getAllTrend | analysisMonitoring table | shared `utcBucket(gran)` for range-floor + GROUP BY | ✓ WIRED | Test asserts both self queries emit WHERE; admin none. |
| getAnalysisMonitoringStats | counts + perWorkflow + trend helpers | `Effect.all([...])` with `Effect.mapError` → GetAnalysisMonitoringStatsError | ✓ WIRED | Composite consumes self/admin variants respectively (no cross-user mixing). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| getWorkflowUsage | rows.counts | `count(*) filter` surface from analysisMonitoring GROUP BY workflow_id | ✓ FLOWING | Aggregate to JS via `shapeWorkflowUsage`; orphan collapse from NULL workflow_name rows. |
| getTrend | bucket counts | `date_trunc` GROUP BY buckets + range min/max | ✓ FLOWING | Zero-fill merge over data-derived range; sums=total by construction. |
| getAnalysisMonitoringStats | stats | three constituent DB queries | ✓ FLOWING | Spreads counts, passes perWorkflow/trend through unchanged (passthrough test). |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full per-workflow/trend/composite/success-rate suite | `pnpm vitest run --config vitest.config.server.ts test/server/utils/grizzle/analysisMonitoring.test.ts` (from packages/nuxt-galaxy) | 63 passed / 63 | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| — | — | No probes declared in PLANs; phase is query-layer only with unit-test verification (`<verify>` references the vitest target file) | SKIPPED |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| STAT-01 | 14-03 | per-user total + outcome breakdown, counts preserved | ✓ SATISFIED | counts helpers byte-identical (git diff), composite spreads them, existing counts tests pass. |
| STAT-02 | 14-01 | per-workflow grouped by workflow_id, snapshot name, explicit unknown bucket | ✓ SATISFIED | getWorkflowUsage + shapeWorkflowUsage orphan collapse; tests for collapse/version/parity pass. |
| STAT-03 | 14-02 | UTC time-bucket trend on started_at with bucket sums = total | ✓ SATISFIED | getTrend/getAllTrend zero-filled continuous UTC series; sums=total/no-drop tests pass. |
| STAT-04 | 14-01, 14-03 | single documented success-rate formula used consistently | ✓ SATISFIED | computeSuccessRate only source (grep count=1); parity test proves same value across all paths. |

All four requirement IDs (STAT-01..STAT-04) are accounted for across the three plans and are satisfied by the committed code. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | none (no TBD/FIXME/XXX/TODO/placeholder markers; no stub/empty implementations) | ℹ️ Info | — |

### Human Verification Required

None. This phase is query-layer only: every observable truth (orphan collapse, version parity, zero-fill, calendar-aware month stepping, UTC key normalization, bucket-sums=total, single-formula parity, self/admin WHERE parity, zero-terminal→0 rate) is exercised directly by passing unit tests through the real JS shaping logic against the mock Drizzle client — the plan's agreed verification mechanism (`human_judgment: false` across all coverage entries). No `<human-check>` blocks were deferred in any PLAN. No UI, endpoints, or live-DB behavior is in scope; Phase 15 (endpoints) and Phase 16 (real aggregation SQL / RLS scoping / quality gates) are separate later phases, so no real-DB/RLS integration gap is attributable to this phase.

### Gaps Summary

No gaps. All 9 derived truths, all artifacts, and all key links are verified. The single success-rate formula is the only ratio source and is proven to yield identical values on the composite, per-workflow, and trend paths (STAT-04 parity test). The existing counts helpers remain byte-identical (STAT-01 preservation). No schema/migration/index file was modified, and no debt markers were introduced.

---

_Verified: 2026-08-10T22:27:00Z_
_Verifier: the agent (gsd-verifier)_
