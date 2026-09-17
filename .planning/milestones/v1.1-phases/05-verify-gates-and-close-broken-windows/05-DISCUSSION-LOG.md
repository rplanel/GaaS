# Phase 05: Verify Gates and Close Broken Windows - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-06
**Phase:** 05-Verify Gates and Close Broken Windows
**Areas discussed:** Failure handling policy, Gate execution order

---

## Failure handling policy

| Option | Description | Selected |
|--------|-------------|----------|
| Verify-only: record new broken window and exit | Keep Phase 05 strictly verification. Any new failure becomes a new broken window entry and the phase ends. | |
| Fix-in-place for regressions only | Fix failures that are clearly regressions from earlier phases; new unrelated failures become broken windows. | |
| Fix-in-place within gate scope | If a gate fails, attempt to fix it immediately as part of Phase 05, provided the fix stays within the existing gate scope and does not introduce new features. | ✓ |

**User's choice:** Fix-in-place within gate scope
**Notes:** The fix must stay within existing gate scope. No new features or new dependencies unless strictly required. If a failure is too large or unrelated, record it as a new broken window and exit.

---

## Gate execution order

| Option | Description | Selected |
|--------|-------------|----------|
| Sequential fail-fast: lint → typecheck → test | Run one gate at a time. Stop at the first failure, fix it, then restart from the beginning. | ✓ |
| Parallel with captured logs | Run all three concurrently, capture each output to a separate log, and report aggregate results. | |
| Sequential with full run | Run all three in sequence but always run all three even if one fails, so every failing gate is reported in one pass. | |

**User's choice:** Sequential fail-fast: lint → typecheck → test
**Notes:** Fail-fast gives clean, isolated diagnostics. After a fix, restart from the beginning to ensure no regression of earlier gates.

---

## the agent's Discretion

- Exact command output formatting in SUMMARY.md.
- Method of updating `.planning/WINDOWS.md` (direct edit or `gsd-tools windows fixed`).

## Deferred Ideas

None — discussion stayed within phase scope.
