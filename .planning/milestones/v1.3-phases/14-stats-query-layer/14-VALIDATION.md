---
phase: 14
slug: stats-query-layer
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-10
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (^4.1.0, catalog:testing) |
| **Config file** | packages/nuxt-galaxy/vitest.config.ts |
| **Quick run command** | `pnpm --filter ./packages/nuxt-galaxy vitest run test/server/utils/grizzle/analysisMonitoring.test.ts` |
| **Full suite command** | `pnpm --filter ./packages/nuxt-galaxy test` then root `pnpm lint` + `pnpm typecheck` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick grizzle analysisMonitoring test command.
- **After every plan wave:** Run full package suite (`pnpm --filter ./packages/nuxt-galaxy test`).
- **Before `/gsd-verify-work`:** Full suite + lint + typecheck green.
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | STAT-02, STAT-04 | T-14-01 / — | self always WHERE owner_id; admin no-WHERE; no ownerId logged | unit | `pnpm --filter ./packages/nuxt-galaxy vitest run test/server/utils/grizzle/analysisMonitoring.test.ts` | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 1 | STAT-02 | T-14-02 / — | orphan collapse single unknown bucket; deterministic ordering | unit | `pnpm --filter ./packages/nuxt-galaxy vitest run test/server/utils/grizzle/analysisMonitoring.test.ts` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 2 | STAT-03 | T-14-03 / — | granularity allowlist; UTC clamp; no user data overflow | unit | `pnpm --filter ./packages/nuxt-galaxy vitest run test/server/utils/grizzle/analysisMonitoring.test.ts` | ❌ W0 | ⬜ pending |
| 14-02-02 | 02 | 2 | STAT-03 | T-14-04 / — | bucket sums = total; empty → [] | unit | `pnpm --filter ./packages/nuxt-galaxy vitest run test/server/utils/grizzle/analysisMonitoring.test.ts` | ❌ W0 | ⬜ pending |
| 14-03-01 | 03 | 3 | STAT-01, STAT-04 | T-14-05 / — | composite consumes byte-identical counts; successRate via computeSuccessRate | unit | `pnpm --filter ./packages/nuxt-galaxy vitest run test/server/utils/grizzle/analysisMonitoring.test.ts` | ❌ W0 | ⬜ pending |
| 14-03-02 | 03 | 3 | STAT-01, STAT-04 | T-14-06 / — | cross-path success-rate parity | unit | `pnpm --filter ./packages/nuxt-galaxy vitest run test/server/utils/grizzle/analysisMonitoring.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/server/utils/grizzle/analysisMonitoring.test.ts` — new named-import tests for `computeSuccessRate`, `getWorkflowUsage`/`getAllWorkflowUsage`, `getTrend`/`getAllTrend`, `getAnalysisMonitoringStats`/`getAllAnalysisMonitoringStats` (existing tests extended, not replaced)
- [ ] `test/server/fixtures.ts` — confirm `createMockDrizzle` expresses distinct result sets per select call (see checker warning #3); extend with a result-sequencing mechanism or adopt the single-query trend approach so the two-query trend and composite `Effect.all` tests are executable
- [ ] Existing infrastructure covers all phase requirements (vitest + createMockDrizzle already present).

*Existing infrastructure covers all phase requirements except the mock-result-sequencing gap noted above.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| RLS cross-user isolation | STAT-01..04 | RLS is enforced at the Postgres layer, not the query layer | Deferred to Phase 16 integration tests (TEST-03) — self helpers filter `ownerId` server-side in SQL; integration proves one user cannot read another's stats |
| None within query layer | — | — | All other phase behaviors have automated verification |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
