# Phase 11: verify-quality-gates - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-10
**Phase:** 11-verify-quality-gates
**Areas discussed:** Failure remediation scope, Environmental / flaky failures, Verification sequence, Evidence artifacts

---

## Failure remediation scope

| Option | Description | Selected |
|--------|-------------|----------|
| v1.2 changes only | Fix only failures clearly introduced by Phases 6–10. | |
| Any failure | Fix any failure that prevents the root gates from passing, regardless of origin. | ✓ |
| v1.2 first, then escalate | Fix v1.2-induced failures first; escalate pre-existing ones case-by-case. | |

**User's choice:** Any failure
**Notes:** The milestone goal is a green baseline.

---

## Lint warnings and TS diagnostics

| Option | Description | Selected |
|--------|-------------|----------|
| Zero warnings | Treat all lint warnings and TS diagnostics as blockers. | |
| Errors only | Block only on errors. | |
| Zero warnings for new code | Eliminate warnings introduced by v1.2 changes; tolerate pre-existing warnings unless they become errors. | ✓ |

**User's choice:** Zero warnings for new code
**Notes:** Consistent with the v1.1 green baseline: pre-existing warnings should not exist, but if they do they are not in scope.

---

## Environmental / flaky failures

| Option | Description | Selected |
|--------|-------------|----------|
| Reproduce locally required | A failure must be reproducible locally to block. | |
| Local threads proof sufficient | Root `pnpm test` must pass locally with the configured `threads` pool. | ✓ |
| Local + CI evidence required | Both local and CI must pass. | |

**User's choice:** Local threads proof sufficient (after agent recommendation and user agreement)
**Notes:** The phase success criteria explicitly require root `pnpm test` using the `threads` pool. The previous forks-pool `-122` error was environment-specific and resolved by switching to `threads`.

---

## Intermittent failure stability

| Option | Description | Selected |
|--------|-------------|----------|
| Three consecutive passes | A previously failing test must pass three consecutive local runs. | |
| Single pass after investigation | After diagnosing the failure, a single clean run is enough. | ✓ |
| Use Vitest retry config | Rely on Vitest's built-in retry handling if configured. | |

**User's choice:** Single pass after investigation (after agent recommendation and user agreement)
**Notes:** If a failure is reproducible and looks real, it must be fixed. Consecutive-pass requirement is overkill for a milestone gate.

---

## Verification sequence

| Option | Description | Selected |
|--------|-------------|----------|
| Sequential stop on first failure | Run lint → typecheck → test; stop on first failure and restart after fixing. | ✓ |
| Run all three always | Always run all gates to the end. | |
| Fastest feedback first | Run lint first, then typecheck, then test; stop on first failure. | |

**User's choice:** Sequential stop on first failure
**Notes:** Lint is fastest and already listed first in this option.

---

## Evidence artifacts

| Option | Description | Selected |
|--------|-------------|----------|
| Exit codes only | Record only that each command returned exit code 0. | |
| Full command output | Capture complete stdout/stderr for every command. | |
| Summary + outputs on failure | Record summaries normally; capture full output only on failure. | ✓ |

**User's choice:** Summary + outputs on failure (after agent recommendation and user agreement)
**Notes:** Balances auditability with avoiding large artifact files on success.

---

## the agent's Discretion

- Exact format of the evidence summary.
- Where to append/persist evidence (CONTEXT.md, DISCUSSION-LOG.md, or separate report).

## Deferred Ideas

None — discussion stayed within Phase 11 scope.
