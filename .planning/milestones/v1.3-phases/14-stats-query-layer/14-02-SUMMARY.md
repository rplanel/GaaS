---
phase: 14-stats-query-layer
plan: 02
subsystem: api
tags: [drizzle, effect, date-trunc, trend, time-bucket, utc, zero-fill, postgres]

requires:
  - phase: 14-stats-query-layer
    provides: computeSuccessRate (D-01..D-03), selectX(ownerId?)/shapeX builder+shaping pattern, self/admin parity (D-12)
provides:
  - getTrend(ownerId, granularity?) / getAllTrend(granularity?): continuous zero-filled UTC time-bucket series over the user's own started_at range (STAT-03)
  - TrendGranularity allowlist + TREND_INTERVALS fixed interval literals (D-04, T-14-05 mitigation)
  - canonical UTC bucket keys aligning SQL-returned with JS-generated buckets; calendar-aware month stepping (D-05, RESEARCH A3, T-14-07)
  - GetTrendError TaggedError; AnalysisMonitoringTrendPoint type; createMockDrizzle result-sequencing queue in fixtures
affects: [14-03-composite, 15-api-endpoints, 16-testing-quality-gates]

actuals:
  tokens: 112        # chars/4 over the realized diff (447 added chars across 4 files)
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Time-bucket trend = date_trunc(gran, started_at AT TIME ZONE 'UTC') GROUP BY + JS calendar-aware zero-fill merge"
    - "Canonical UTC bucket key (YYYY-MM-DD / YYYY-MM / Monday date) so SQL and JS bucket keys always align"
    - "Two-query trend path (selectTrendRange + selectTrendBuckets) under sequential Effect.all, made testable by a FIFO result-sequencing queue in the Drizzle mock"
    - "Granularity as a closed allowlist indexing TREND_INTERVALS — the interval literal is never built from caller input"

key-files:
  created:
    - packages/nuxt-galaxy/src/runtime/types/nuxt-galaxy.ts (AnalysisMonitoringTrendPoint added)
  modified:
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts
    - packages/nuxt-galaxy/test/server/fixtures.ts (enqueueResult queue)

key-decisions:
  - "selectTrendRange returns the raw min/max of started_at (per plan step 4); the covered range is floored on the JS side with the identical UTC truncation semantics as the bucket GROUP BY, guaranteeing bucket sums = total"
  - "Canonical bucket key is the UTC-floored instant sliced to YYYY-MM-DD (day/week / Monday of ISO week) or YYYY-MM (month); every SQL-returned and JS-generated key is normalized through it"
  - "Month stepping advances the calendar month (staying on the 1st, wrapping the year) rather than adding a fixed 30/31-day ms value, eliminating drift on variable-length months (RESEARCH A3)"
  - "successRate is computed exactly once per point and always through computeSuccessRate (never an inline ratio)"

patterns-established:
  - "Pattern 1: Trend query = selectX(ownerId?) raw builders run under sequential Effect.all + buildX(...) JS zero-fill shaping + getX(ownerId)/getAllX() exports with Data.TaggedError"
  - "Pattern 2: Mock dialect — createMockDrizzle exposes enqueueResult(result): a FIFO queue popped per .select()/.insert()/.update()/.delete() call, falling back to setResult/currentResult when empty, so multi-query Effect.all paths resolve distinct results deterministically"

requirements-completed: [STAT-03]

coverage:
  - id: D1
    description: "getTrend(ownerId, granularity?) returns a continuous zero-filled UTC series over the user's data-derived range, with successRate via computeSuccessRate (STAT-03 D-04/D-05/D-06/D-07)"
    requirement: STAT-03
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts#getTrend"
        status: pass
    human_judgment: false
  - id: D2
    description: "getAllTrend(granularity?) admin variant emits no WHERE while getTrend emits WHERE eq(ownerId) on both queries (self/admin parity, D-12 / T-14-06)"
    requirement: STAT-03
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts#getTrend"
        status: pass
    human_judgment: false
  - id: D3
    description: "Empty range returns [] (STAT-03 empty edge); calendar-aware month stepping across a month boundary yields 2026-01/02/03 with no fixed-ms drift"
    requirement: STAT-03
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts#getTrend"
        status: pass
    human_judgment: false
  - id: D4
    description: "Boundary/consistency invariants: bucket sums equal the total, every row lands in exactly one bucket, repeated calls deep-equal and same-order, canonical UTC keys hold across a session-timezone day boundary (D-05/T-14-07)"
    requirement: STAT-03
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts#getTrend boundary and consistency invariants"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-08-10
status: complete
---

# Phase 14 Plan 02: Time-Bucket Trend Series Summary

**Continuous, zero-filled UTC time-bucket trend series (`date_trunc(gran, started_at AT TIME ZONE 'UTC')`) with a canonical UTC key merge, calendar-aware month stepping, and closed day/week/month granularity allowlist — `getTrend(ownerId)` self + `getAllTrend()` admin parity (STAT-03)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-08-10T22:10:30Z
- **Completed:** 2026-08-10T20:14:44Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `getTrend(ownerId, granularity? = 'day')` / `getAllTrend(granularity?)` — run `selectTrendRange` + `selectTrendBuckets` under sequential `Effect.all`, then apply a JS zero-fill merge to produce one point per UTC bucket over the floor(range.min)→floor(range.max) span.
- `TrendGranularity` (`'day'|'week'|'month'`) closed allowlist + `TREND_INTERVALS` fixed interval literals (D-04). The interval literal is selected from the map, never built from caller input (T-14-05 mitigation).
- `utcBucket(gran)` builds `date_trunc(${gran}, started_at AT TIME ZONE 'UTC')` (D-07) used in the bucket GROUP BY; the covered range is floored with identical UTC truncation semantics (D-06), so `sum(trend[].total) === counts.total` by construction.
- Canonical UTC bucket keys (YYYY-MM-DD / Monday-of-ISO-week / YYYY-MM) normalize both SQL-returned and JS-generated bucket strings so they always align regardless of driver formatting (D-05 drift risk).
- Month stepping is calendar-aware (advance month, wrap year, stay on the 1st) — no fixed-ms drift on variable-length months (RESEARCH A3 / T-14-07).
- Empty range (null min/max) returns `[]` (STAT-03 empty edge); `successRate` computed exactly once per point and always through `computeSuccessRate` (D-01..D-03).
- `GetTrendError` TaggedError; `AnalysisMonitoringTrendPoint` type; `createMockDrizzle` gains an `enqueueResult` result-sequencing queue (backward compatible with `setResult`).
- Existing counts + per-workflow helpers remain byte-identical (only the type import line and the appended block changed).

## Task Commits

Each task was committed atomically (Task 1 TDD):

1. **Task 1 RED: add failing trend series and result-sequencing queue tests** - `25353f4577` (test)
2. **Task 1 GREEN: implement trend series with continuous UTC zero-fill** - `d65a33f255` (feat)
3. **Task 2: add trend boundary and consistency invariants** - `0ddd88a9f5` (test)

**Plan metadata:** pending (next step)

## Files Created/Modified
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts` — added TrendGranularity, TREND_INTERVALS, GetTrendError, utcBucket, selectTrendRange/selectTrendBuckets, floorToGranularity/addGranularity/canonicalBucketKey, buildTrendSeries, trendSeries, getTrend, getAllTrend (counts + per-workflow helpers untouched)
- `packages/nuxt-galaxy/src/runtime/types/nuxt-galaxy.ts` — added `AnalysisMonitoringTrendPoint extends AnalysisMonitoringCounts { bucket: string; successRate: number }`
- `packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts` — 10 new tests (trend behaviors + boundary/consistency invariants)
- `packages/nuxt-galaxy/test/server/fixtures.ts` — `createMockDrizzle` result-sequencing queue (`enqueueResult`), backward compatible with `setResult`/`currentResult`

## Decisions Made
- selectTrendRange returns raw min/max; the covered range is floored in JS with the same UTC truncation as the bucket GROUP BY, guaranteeing range/bucket agreement and bucket sums = total.
- Canonical UTC bucket key is the single normalization point for both SQL-returned and JS-generated bucket strings, eliminating the main format-mismatch drift risk.
- Month stepping is calendar-aware (not a fixed-ms increment) so variable-length months do not drift; day/week step in fixed calendar units.
- successRate is computed once per point, always via computeSuccessRate.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The plan's `<verify>` command `pnpm --filter ./packages/nuxt-galaxy vitest run test/server/utils/grizzle/analysisMonitoring.test.ts` does not resolve a `vitest` script at the filter level (same as Plan 01). The working equivalent used throughout was `pnpm vitest run --config vitest.config.server.ts test/server/utils/grizzle/analysisMonitoring.test.ts` from `packages/nuxt-galaxy/`.

## Verification Results

- Target test file: `pnpm vitest run --config vitest.config.server.ts test/server/utils/grizzle/analysisMonitoring.test.ts` → **58 passed / 58** (48 Plan 01 tests unchanged + 10 new trend tests).
- Full server suite: `pnpm vitest run --config vitest.config.server.ts` → **36 files, 282 passed / 3 skipped** (282 = 272 baseline + 10 new) → PASS, no regressions.
- Typecheck: `pnpm typecheck` → **green** (both vue-tsc passes).
- No schema file, migration, or index modified — `git diff` shows only the four in-scope files.
- Existing helpers preserved: `git diff` on `analysisMonitoring.ts` shows only the import-line addition and the appended block after `getAllWorkflowUsage`; counts + per-workflow helpers are byte-identical.
- Exactly one `successRate:` computation per point, routed through `computeSuccessRate`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Trend dimension (STAT-03) complete and unit-tested; Plan 03 (composite `AnalysisMonitoringStats`) can consume counts + perWorkflow + trend with the established per-dimension Effect-helper pattern.
- No blockers.

## Self-Check: PASSED

Created/modified files verified on disk; per-task commits verified in git log (`25353f4577`, `d65a33f255`, `0ddd88a9f5`); all acceptance criteria and the plan-level verification pass (target test 58/58, full server suite green, typecheck green, no schema file touched).

---
*Phase: 14-stats-query-layer*
*Completed: 2026-08-10*
