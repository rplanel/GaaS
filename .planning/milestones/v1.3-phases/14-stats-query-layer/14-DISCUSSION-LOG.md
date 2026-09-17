# Phase 14: Stats Query Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-10
**Phase:** 14-stats-query-layer
**Areas discussed:** Success-rate formula, Trend granularity & shape, Per-workflow "unknown" + breakdown, Helper shape & self/admin parity

---

## Success-rate formula

| Option | Description | Selected |
|--------|-------------|----------|
| success/(success+error) | Reliability among terminal outcomes; excludes pending/cancelled | ✓ |
| success/total | Denominator is all rows; pending/cancelled depress rate | |
| success/(success+error+cancelled) | Includes cancelled, excludes pending | |

**User's choice:** success/(success+error) — Recommended
**Notes:** Locks STAT-04; applied identically across counts, per-workflow, trend paths.

| Option | Description | Selected |
|--------|-------------|----------|
| Rate = 0 | Valid number when no terminal outcomes; no null-handling downstream | ✓ |
| Rate = null | Signals 'no completed analyses'; forces null-handling everywhere | |

**User's choice:** Rate = 0 — Recommended
**Notes:** Zero-denominator edge (success+error=0) returns 0.

---

## Trend granularity & shape

| Option | Description | Selected |
|--------|-------------|----------|
| Daily buckets | date_trunc('day') — one point per UTC day | |
| Weekly buckets | Monday-anchored weekly points | |
| Monthly buckets | Monthly points; coarsest | |

**User's choice:** User asked to clarify purpose; after explanation, reframed the decision to a parameterized helper.
**Notes:** User correctly noted aggregation is a query-time choice over raw `analysis_monitoring` rows, not a permanent/schema decision.

| Option | Description | Selected |
|--------|-------------|----------|
| Parameterize, default day | Granularity is a helper parameter ('day'/'week'/'month'); nothing hard-coded | ✓ |
| Fixed to one granularity | Simpler signature, locks the choice | |

**User's choice:** Parameterize, default day — Recommended

| Option | Description | Selected |
|--------|-------------|----------|
| Continuous, zero-filled | One entry per bucket over full UTC range; sums equal total; chart-ready | ✓ |
| Sparse, only populated | Smaller payload; gaps implicit zero | |

**User's choice:** Continuous, zero-filled — Recommended

| Option | Description | Selected |
|--------|-------------|----------|
| Derive from data | Range from min/max started_at floored to granularity; sums equal total by construction | ✓ |
| Caller-supplied range | More flexible; risks truncating data outside window | |

**User's choice:** Derive from data — Recommended

---

## Per-workflow "unknown" + breakdown

| Option | Description | Selected |
|--------|-------------|----------|
| Total + outcome breakdown | Per-workflow total + success/error/cancelled/pending + success rate | ✓ |
| Total count only | Minimal payload | |

**User's choice:** Total + outcome breakdown — Recommended

| Option | Description | Selected |
|--------|-------------|----------|
| Single collapsed 'unknown' | All orphans aggregate into one sentinel entry (workflow_id null, name 'unknown') | ✓ |
| Separate entry per orphan id | Preserves each orphan id, but unusable entries | |

**User's choice:** Single collapsed 'unknown' — Recommended

| Option | Description | Selected |
|--------|-------------|----------|
| Name + version per bucket | Surfaces workflow_version per bucket, keyed by workflow_id | ✓ |
| Name only | Simpler; loses version distinction | |

**User's choice:** Name + version per bucket — Recommended

---

## Helper shape & self/admin parity

| Option | Description | Selected |
|--------|-------------|----------|
| Per-dimension + composite | Four per-dimension helpers + a composite AnalysisMonitoringStats helper | ✓ |
| Per-dimension only | Phase 15 composes them itself | |
| Composite only | No standalone per-dimension helpers | |

**User's choice:** Per-dimension + composite — Recommended

| Option | Description | Selected |
|--------|-------------|----------|
| Separate self + admin per helper | Mirrors getAnalysisMonitoringCounts/getAllAnalysisMonitoringCounts | ✓ |
| Single helper, optional ownerId | Fewer exports; overloads missing-arg meaning | |

**User's choice:** Separate self + admin per helper — Recommended

---

## the agent's Discretion

Naming/signatures of Effect helpers, exact SQL (generate_series for continuous series, filter vs sum(case) for breakdowns), parallel vs sequential composite assembly, Data.TaggedError names, evlog annotations.

## Deferred Ideas

- UI consumption / chart rendering of the trend series (v2) — the continuous shape was chosen partly to be chart-ready.
- Hourly trend buckets — explicitly rejected in REQUIREMENTS.md out-of-scope.
- Materialized rollups / pre-aggregated tables — deferred; query-layer aggregation sufficient at current scale.
