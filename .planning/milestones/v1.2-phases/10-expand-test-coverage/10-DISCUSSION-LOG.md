# Phase 10: expand-test-coverage - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-09
**Phase:** 10-expand-test-coverage
**Areas discussed:** Lock contention test level, Galaxy 503 simulation, Partial failure scope, Batch summary counts

---

## Lock contention test level

| Option | Description | Selected |
|--------|-------------|----------|
| Unit-level lock helper | Extend lock.test.ts. Model acquire_sync_lock RPC returning false (held) and true on reclaim. | |
| Integration through syncAnalysisEffect | Add tests in analysis.test.ts where acquireSyncLock is mocked to return false (skip) and true after expiry. | |
| Task-level worker contention | Add a test in sync-analyses.test.ts where two task runs contend for the same analysisId. | ✓ |

**User's choice:** Task-level worker contention
**Notes:** Follow-up question asked how to model expired-lock reclaim. User requested advice. Recommended keeping expired-lock reclaim at the unit helper level and using task-level test only for held-lock skip. User agreed.

---

## Galaxy 503 simulation

| Option | Description | Selected |
|--------|-------------|----------|
| blendtype error with statusCode | Use GalaxyApiError/ResponseError with statusCode 503 in the mock Galaxy layer. | ✓ |
| Generic Error with 503 message | Throw Error('503 Service Unavailable') and rely on isTransientError string matching. | |
| MSW HTTP 503 response | Configure MSW handlers to return HTTP 503 for the invocation endpoint. | |

**User's choice:** blendtype error with statusCode
**Notes:** Follow-up noted that isTransientError currently only checks message strings. User requested advice. Recommended enhancing isTransientError to also inspect statusCode via extractStatusCode, and using a realistic GalaxyApiError({ message: 'Service Unavailable', statusCode: 503 }) in tests. User agreed.

---

## Partial failure scope

| Option | Description | Selected |
|--------|-------------|----------|
| analysis_outputs insert fails | The final write linking dataset to analysis fails. | ✓ |
| datasets insert fails | The dataset row insert fails before the output link is attempted. | |
| storage owner update fails | The storage.objects owner update fails after upload. | |

**User's choice:** analysis_outputs insert fails
**Notes:** User requested advice. Recommended verifying this at two layers: output.test.ts (unit, confirms SyncOutputError) and sync-analyses.test.ts (task level, confirms releaseSyncLock and batch continuation). User said "ok go".

---

## Batch summary counts

| Option | Description | Selected |
|--------|-------------|----------|
| Document always-zero skipped | Assert skipped: 0 across all batch mixes; no implementation change. | ✓ |
| Implement skipped semantics | Change sync-analyses.ts to increment skipped for held-lock/not-due analyses. | |
| Redefine skipped for terminal no-op | Count skipped when invocation is already terminal and no writes occurred. | |

**User's choice:** Document always-zero skipped
**Notes:** User asked why skipped exists if always zero. Explained it was in the result shape from prior phases and is currently a placeholder. User agreed to document the always-zero contract in tests and defer meaningful skipped semantics to a later phase.

---

## the agent's Discretion

- Exact mock helper factory design for 503 errors.
- Whether batch-summary mixed-outcome cases are new `it()` blocks or extensions of existing ones.

## Deferred Ideas

- Implement meaningful `skipped` count in `galaxy:sync-analyses` batch summary (e.g., lock-held or already-up-to-date analyses).
