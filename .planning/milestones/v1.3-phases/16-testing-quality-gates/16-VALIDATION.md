---
phase: 16
slug: testing-quality-gates
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-11
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Note: this phase *is itself* the validation phase — its deliverable is the milestone's test coverage, so the requirement→test map below is the phase's own deliverable list.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.0 (`catalog:testing`) |
| **Config file** | `packages/nuxt-galaxy/vitest.config.server.ts` (server suite: `environment:'node'`, `include:['test/server/**/*.test.ts']`, `setupFiles: ./test/server/setup.ts`, `pool:'threads'`) |
| **Quick run command** | `cd packages/nuxt-galaxy && vitest run --config vitest.config.server.ts test/server/utils/grizzle/survival-flow.test.ts` |
| **Full suite command** | `pnpm test` (root) — runs every package test script |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/nuxt-galaxy && vitest run --config vitest.config.server.ts test/server/utils/grizzle/survival-flow.test.ts`
- **After every plan wave:** Run `pnpm lint && pnpm typecheck` + `pnpm --filter ./packages/nuxt-galaxy test`
- **Before `/gsd-verify-work`:** Full root `pnpm lint && pnpm typecheck && pnpm test` must be green
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | TEST-02 | T-16-01 / — | Self-scoped query survives deletion via snapshotted name, not `unknown` bucket | unit | `vitest run --config vitest.config.server.ts test/server/utils/grizzle/survival-flow.test.ts` | ❌ W0 | ⬜ pending |
| 16-01-02 | 01 | 1 | TEST-04 | T-16-01 / — | `requireRole` is role-agnostic (second non-admin role name denied) | unit | `vitest run --config vitest.config.server.ts test/server/utils/grizzle/supabase.test.ts` | ✅ | ⬜ pending |
| 16-02-01 | 02 | 2 | TEST-01, TEST-03 | N/A | Verify already-covered aggregation SQL + RLS/self-scoping suites stay green | unit | `vitest run --config vitest.config.server.ts test/server/utils/grizzle/analysisMonitoring.test.ts` | ✅ | ⬜ pending |
| 16-02-02 | 02 | 2 | TEST-05 | N/A | Root gates green + evidence note | smoke (gates) | root `pnpm lint && pnpm typecheck && pnpm test` | N/A (gate run) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/server/utils/grizzle/survival-flow.test.ts` — NEW, the only missing test file (D-07)
- [ ] `test/server/fixtures.ts` / `test/server/setup.ts` — shared mock factories + global mocks (already exist)

*Framework install not needed (Vitest already present).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Root quality gates green | TEST-05 | `pnpm lint` / `pnpm typecheck` are static gates, not unit-testable | Run `pnpm lint && pnpm typecheck && pnpm test` at root and confirm all exit 0; capture to `16-gates-evidence.txt` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
