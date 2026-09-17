---
status: complete
phase: 14-stats-query-layer
source: 14-01-SUMMARY.md, 14-02-SUMMARY.md, 14-03-SUMMARY.md
started: 2026-08-11T09:10:00Z
updated: 2026-08-11T09:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Automated coverage confirmation
expected: |
  All 11 coverage items across Plans 01-03 are already passing their unit-test verification. The deliverables are:
  - Plan 01: computeSuccessRate helper; getWorkflowUsage/getAllWorkflowUsage per-workflow usage; orphan collapse to unknown bucket; boundary/error edges.
  - Plan 02: getTrend/getAllTrend trend series; admin/self parity; empty range; boundary/consistency invariants.
  - Plan 03: getAnalysisMonitoringStats/getAllAnalysisMonitoringStats composite assembly; cross-dimension success-rate parity.
  If this matches your expectation, reply "yes" to complete UAT.
result: pass

### 2. computeSuccessRate shared success-rate helper
expected: computeSuccessRate(success, error) returns 0 on zero denominator, 1 on no errors, and uses a consistent formula (STAT-04 D-01..D-03)
result: pass
source: automated
coverage_id: D1

### 3. getWorkflowUsage self variant
expected: getWorkflowUsage(ownerId) returns grouped per-workflow outcome breakdown with per-entry successRate and WHERE ownerId (STAT-02 D-08/D-12)
result: pass
source: automated
coverage_id: D2

### 4. getAllWorkflowUsage admin variant
expected: getAllWorkflowUsage() returns same shape with no WHERE and relies on RLS admin SELECT as authority (D-12)
result: pass
source: automated
coverage_id: D3

### 5. Orphaned workflows collapse to unknown bucket
expected: Orphaned workflows collapse into exactly one explicit 'unknown' bucket with summed counts; version stays first-class per entry (D-09/D-10)
result: pass
source: automated
coverage_id: D4

### 6. Workflow usage boundary/error edges
expected: Empty set returns [], zero-terminal workflow returns successRate 0, rejection surfaces GetWorkflowUsageError, deterministic/repeatable ordering
result: pass
source: automated
coverage_id: D5

### 7. getTrend time-bucket trend series
expected: getTrend(ownerId, granularity?) returns a continuous zero-filled UTC series over the user's data-derived range, with successRate via computeSuccessRate (STAT-03 D-04/D-05/D-06/D-07)
result: pass
source: automated
coverage_id: D1

### 8. getAllTrend admin variant parity
expected: getAllTrend(granularity?) admin variant emits no WHERE while getTrend emits WHERE eq(ownerId) on both queries (self/admin parity, D-12 / T-14-06)
result: pass
source: automated
coverage_id: D2

### 9. Trend empty range and calendar-aware month stepping
expected: Empty range returns []; calendar-aware month stepping across a month boundary yields 2026-01/02/03 with no fixed-ms drift
result: pass
source: automated
coverage_id: D3

### 10. Trend boundary/consistency invariants
expected: Bucket sums equal the total, every row lands in exactly one bucket, repeated calls deep-equal and same-order, canonical UTC keys hold across a session-timezone day boundary (D-05/T-14-07)
result: pass
source: automated
coverage_id: D4

### 11. Composite stats assembly
expected: getAnalysisMonitoringStats/getAllAnalysisMonitoringStats assemble counts + perWorkflow + trend into the additive AnalysisMonitoringStats shape with an overall successRate routed through computeSuccessRate; self filters owner_id, admin is all-rows, preserved counts helpers byte-identical
result: pass
source: automated
coverage_id: D1

### 12. Cross-dimension success-rate parity
expected: Composite overall, each perWorkflow entry, and each trend point all equal computeSuccessRate(recomputed from their success/error); perWorkflow/trend passed through unchanged
result: pass
source: automated
coverage_id: D2

## Summary

total: 12
passed: 12
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
