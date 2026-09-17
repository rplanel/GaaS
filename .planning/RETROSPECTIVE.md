# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.1 — Restore Quality Gates

**Shipped:** 2026-08-06
**Phases:** 3 | **Plans:** 3 | **Sessions:** 1

### What Was Built
- Fixed 4 pre-existing TypeScript errors in `@gaas/ui` across `HeroShadersDynamic.vue`, `plot/Table.vue`, and `pages/index.vue`.
- Switched all Vitest configurations to the `threads` pool, eliminating the forks-pool `Unknown system error -122 write` failure and restoring green root `pnpm test`.
- Ran root `pnpm lint`, `pnpm typecheck`, and `pnpm test` end-to-end and closed both broken windows in `.planning/WINDOWS.md`.

### What Worked
- Narrow, well-scoped quality-gate milestone kept the team focused on baseline health rather than feature creep.
- Phase 5 verification provided a clean final checkpoint that confirmed all gates pass together.
- Reusing the broken-windows ledger from the previous milestone made the problem statement and closure explicit.

### What Was Inefficient
- The Vitest `threads` pool fix required an extra iteration when the top-level `pool` setting did not propagate into multi-project configs (`packages/wiki/vitest.config.ts`).
- Phase-level verification artifacts were captured in SUMMARY.md coverage blocks, but the canonical `verification_status` field remained `missing`; this added friction during milestone closeout.

### Patterns Established
- When Vitest uses project arrays, runner-level options like `pool` must be set per project block, not only at the top level.
- Generic `defineModel<T>(name, { default: () => ({}) })` for typed v-model state in Vue SFCs.
- Relative dynamic imports for `.client.vue` wrappers consumed by `vue-tsc`.

### Key Lessons
1. A dedicated "green baseline" milestone is valuable before resuming feature work on a long-running branch.
2. Multi-project Vitest configs need per-project runner overrides — top-level defaults are not always inherited.
3. Closing verification loops with both SUMMARY.md coverage and canonical verification status reduces closeout friction.

### Cost Observations
- Model mix: N/A
- Sessions: 1
- Notable: Milestone completed in a single focused session after Phases 3–5 were already implemented.

---

## Milestone: v1.2 — Harden Galaxy Analysis Sync

**Shipped:** 2026-08-10
**Phases:** 6 | **Plans:** 13 | **Tasks:** 40

### What Was Built
- Audited and froze the canonical server-driven sync contract; inventoried every legacy `synchronize*Effect` helper and flagged 15 call sites for removal.
- Replaced the non-atomic read-delete-insert lock with an atomic `galaxy.acquire_sync_lock` RPC; made lock TTL, batch size, and retry backoff configurable; added `sync_attempts`/`last_sync_error_at`/`next_sync_at` tracking.
- Standardized evlog traces across every sync boundary with six trace IDs and a single `taskLog.emit` wide event per run.
- Removed all legacy Drizzle sync helpers (`REFACTOR-01`) and added an owner-scoped on-demand sync endpoint (`POST /api/db/analyses/:id/sync`) with Realtime documented as display-only.
- Expanded test coverage for lock contention, 503/429 retry/exhaustion, partial-failure lock release, and batch summary counts; restored green root quality gates.

### What Worked
- The Phase 6 audit-first approach produced a signed-off contract that de-risked the Phase 8 refactor and gave Phase 9 clear constraints (single source of truth, no lock bypass).
- Atomic lock via a single Postgres RPC eliminated a whole class of race bugs compared to the prior select/delete/insert code.
- TDD in Phase 10 (mocking Galaxy HTTP layers via Effect fixtures) made failure modes like 503 retry/exhaustion explicitly testable.
- Running a milestone audit (`/gsd-audit-milestone`) before closeout surfaced two non-blocking issues (docs-mirror drift, incomplete output.ts annotation) that were reconciled before archiving.

### What Was Inefficient
- Phase 6 and Phase 10 had completed implementation but no canonical `VERIFICATION.md`; this delayed closeout until verification reports were produced retroactively.
- Nyquist `VALIDATION.md` was not reconciled for most phases (only Phase 11 had a draft), requiring a follow-up before full audit compliance.
- The docs-mirror sync contract (in `docs/content/`) drifted from the hardened code until the closeout audit flagged it.

### Patterns Established
- Freeze a contract document and mirror it under `docs/content/` before a large refactor; re-sync the mirror at the end of the milestone.
- Use a single atomic Postgres function for lock acquisition instead of multi-step read/write sequences.
- Mock Galaxy HTTP layers (`create503GalaxyLayer` fixture) for deterministic transient-failure tests.

### Key Lessons
1. Complete verification artifacts at each phase end to avoid closeout friction.
2. Keep the user-facing docs mirror in sync with the implementation within the same milestone.
3. A milestone audit before archival is worth it — it caught two issues that would otherwise have shipped as stale docs + incomplete traces.

### Cost Observations
- Model mix: N/A
- Sessions: multiple (interrupted by environment restarts)
- Notable: archival required a reconciliation pass (docs + annotation) driven by the audit output.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| evlog-review | 3+ | 2 | Established evlog conventions and LOGGING-SPEC.md |
| v1.1 Restore Quality Gates | 1 | 3 | Shifted to baseline-recovery milestone before feature work |
| v1.2 Harden Galaxy Analysis Sync | multiple | 6 | Audit-first milestone with a frozen contract; consistency/observability hardening |

### Cumulative Quality (subset)

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.1 Restore Quality Gates | ~466 passed / 3 skipped | N/A | No new runtime dependencies |
| v1.2 Harden Galaxy Analysis Sync | ~490+ passed / 3 skipped | N/A | No new runtime dependencies |

### Top Lessons (Verified Across Milestones)

1. Verifying quality gates as a discrete phase prevents drift between package-level fixes and root-level health.
2. Environment-specific Vitest pool issues are easier to fix at the config level than by disabling tests.
3. Closing verification loops (VERIFICATION.md + Nyquist VALIDATION.md) at each phase avoids closeout friction.
4. An audit before archival catches stale documentation and incomplete observability that code review alone misses.
