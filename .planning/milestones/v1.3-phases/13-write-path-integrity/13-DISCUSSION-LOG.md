# Phase 13: Write Path Integrity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-10
**Phase:** 13-Write Path Integrity
**Areas discussed:** Version snapshot at write, Provenance resolution, Delete finalization, Edge semantics

---

## Version Snapshot at Write

| Option | Description | Selected |
|--------|-------------|----------|
| Snapshot all three (Recommended) | populate workflow_name + galaxy_workflow_id + workflow_version (from version_key) together, matching Phase 12 D-01. | ✓ |
| Only the two in WRIT-01 | fix the 3-column snapshot at write, leaving workflow_version NULL. | |
| You decide | capture all three but leave sourcing to planner. | |

**User's choice:** Snapshot all three
**Notes:** WRIT-01 text names two columns but Phase 12 added a third; user accepted keeping the milestone contract consistent (D-01).

---

## Provenance Resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Resolve at caller, pass in (Recommended) | caller joins workflows via workflowId, passes the three resolved fields into the monitoring insert helper. | ✓ |
| Subquery inside insert | insert helper itself joins workflows. | |
| You decide | resolver/planner chooses. | |

**User's choice:** Resolve at caller, pass in
**Notes:** Two insert helpers exist (inline in insertAnalysis + unused insertAnalysisMonitoringEffect); resolved to extend insertAnalysisMonitoringEffect as the canonical helper.

| Option | Description | Selected |
|--------|-------------|----------|
| Extend insertAnalysisMonitoringEffect (Recommended) | single canonical write path used by insertAnalysis; remove inline duplicate. | ✓ |
| Edit inline, leave helper | keep inline insert, add three fields there. | |
| You decide | planner picks consolidation. | |

**User's choice:** Extend insertAnalysisMonitoringEffect

| Option | Description | Selected |
|--------|-------------|----------|
| Atomic within tx (Recommended) | provenance resolution + monitoring insert in the same DB transaction as the analyses insert. | ✓ |
| Resolve then insert, NULL fallback | separate query, insert with NULLs on miss. | |
| You decide | planner decides transaction shape. | |

**User's choice:** Atomic within tx

---

## Delete Finalization

| Option | Description | Selected |
|--------|-------------|----------|
| In deleteAnalysis, same tx (Recommended) | finalize UPDATE (outcome='cancelled' + completedAt) WHERE analysisId AND ownerId AND outcome='pending', in the same DB transaction as the analyses DELETE. | ✓ |
| Separate step, no shared tx | finalize after the delete without a shared transaction. | |
| You decide | planner chooses. | |

**User's choice:** In deleteAnalysis, same tx

| Option | Description | Selected |
|--------|-------------|----------|
| DB tx after Galaxy delete (Recommended) | transaction runs after the external Galaxy history delete; if Galaxy fails, DeleteAnalysisError bubbles and nothing is finalized. | ✓ |
| Finalize regardless of Galaxy | finalize pending row regardless of Galaxy outcome. | |
| You decide | planner decides failure semantics. | |

**User's choice:** DB tx after Galaxy delete

| Option | Description | Selected |
|--------|-------------|----------|
| Key on analysisId (Recommended) | finalize via analysisId + ownerId + outcome='pending' before/with the delete (analysisId still set). | ✓ |
| Key on stable cols | key on ownerId + workflowId + galaxyInvocationId. | |
| You decide | planner picks locating key. | |

**User's choice:** Key on analysisId
**Notes:** `analysis_id` is ON DELETE SET NULL, so finalization must run while it is set. The outcome='pending' predicate is the sole sync-vs-delete concurrency gate (mirrors updateAnalysisMonitoringEffect).

---

## Edge Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Freeze at write (Recommended) | snapshot captured once, never auto-updated on workflow rename/re-version. | ✓ |
| Re-resolve on sync | re-resolve snapshot on each sync while pending. | |
| You decide | planner decides. | |

**User's choice:** Freeze at write

| Option | Description | Selected |
|--------|-------------|----------|
| Same NULL policy as Phase 12 (Recommended) | each column resolves independently; no source -> NULL -> unknown bucket. | ✓ |
| Stricter — skip on unresolved | treat missing-provenance differently / skip insert. | |
| You decide | planner decides. | |

**User's choice:** Same NULL policy as Phase 12

---

## the agent's Discretion

None — all four areas resolved with an accepted recommendation. Latitude only on mechanical details (exact transaction boundaries, SQL shape, how the caller obtains workflow fields).

## Deferred Ideas

None.
