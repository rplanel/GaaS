# Phase 05: Verify Gates and Close Broken Windows - Context

**Gathered:** 2026-08-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Run the full quality gate suite end-to-end (`pnpm lint`, `pnpm typecheck`, `pnpm test`) and update `.planning/WINDOWS.md` to mark the two documented broken windows fixed. The phase does not add features or change architecture; it verifies that the fixes from Phases 3 and 4 produced a green baseline.

</domain>

<decisions>
## Implementation Decisions

### Failure handling policy
- **D-01:** If a quality gate fails during Phase 05 execution, fix it in place as long as the fix stays within the existing gate scope. Fixes may touch configuration or code already involved in the prior phases, but must not introduce new features, new dependencies unless strictly required, or expand beyond restoring the three gates to green. If a failure is too large or unrelated to the current gate scope, record it as a new broken window and exit rather than letting the phase balloon.
- **D-02:** The phase ends successfully only when root `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass and both broken windows in `.planning/WINDOWS.md` are marked fixed.

### Gate execution order
- **D-03:** Run the gates sequentially in fail-fast order: `lint` → `typecheck` → `test`. Stop at the first failure, address it, then restart the sequence from the beginning to ensure the fix did not regress an earlier gate.

### the agent's Discretion
- Exact command output formatting in SUMMARY.md is left to the implementer, provided it clearly records the pass/fail result of each gate.
- The method of updating `.planning/WINDOWS.md` (direct edit or `gsd-tools windows fixed`) is left to the implementer, provided the two open windows are marked fixed and the ledger remains consistent.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `.planning/REQUIREMENTS.md` — VERIFY-01, VERIFY-02, VERIFY-03 define the verification requirements.
- `.planning/WINDOWS.md` — Broken windows #1 and #2 to close after gates pass.
- `.planning/PROJECT.md` — Milestone v1.1 "Restore Quality Gates" context and constraints.
- `.planning/STATE.md` — Current phase state and recent activity.

### Prior phase context
- `.planning/phases/03-fix-gaas-ui-typescript-errors/03-CONTEXT.md` — Decisions for the TypeScript fixes that should make root typecheck pass.
- `.planning/phases/04-fix-root-test-runner-failure/` — Phase 04 produced the Vitest threads-pool fix; no CONTEXT.md exists, but SUMMARY.md should be consulted for the exact configuration changes.

### Quality gate definitions
- `package.json` — Root `lint`, `typecheck`, and `test` scripts.
- `packages/ui/vitest.config.ts` — Threads pool configuration from Phase 04.
- `packages/wiki/vitest.config.ts` — Threads pool configuration from Phase 04.
- `packages/nuxt-galaxy/vitest.config.ts` — Threads pool configuration from Phase 04.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Root `package.json` scripts are the canonical quality gate entry points.
- `.planning/WINDOWS.md` is the broken-window ledger; closing windows can be done by editing the markdown or via `gsd-tools windows fixed <id>`.

### Established Patterns
- Quality gates run across all workspace packages via `pnpm --filter './packages/**'`.
- Vitest configs in `packages/ui`, `packages/wiki`, and `packages/nuxt-galaxy` were switched to the `threads` pool to avoid the forks-pool `Unknown system error -122 write` failure.

### Integration Points
- Root `pnpm typecheck` depends on package-level `typecheck` scripts; `@gaas/ui` typecheck was the previously failing path.
- Root `pnpm test` depends on package-level `test` scripts; all package suites were already passing with `--pool=threads`.

</code_context>

<specifics>
## Specific Ideas

- No specific visual or behavioral redesign. The goal is a green baseline and closed broken windows.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-Verify Gates and Close Broken Windows*
*Context gathered: 2026-08-06*
