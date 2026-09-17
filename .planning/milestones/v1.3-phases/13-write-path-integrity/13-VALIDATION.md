---
phase: 13
slug: write-path-integrity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-10
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (module ~4.x) |
| **Config file** | `packages/nuxt-galaxy/vitest.config.ts` (default) + `vitest.config.server.ts` (server-only; `include: ['test/server/**/*.test.ts']`, setup `test/server/setup.ts`) |
| **Quick run command** | `pnpm --filter nuxt-galaxy test` (root), or in-package `pnpm test` |
| **Full suite command** | Root `pnpm test` (all packages) |
| **Estimated runtime** | ~10 seconds (targeted grizzle files) / ~60s full suite |

---

## Sampling Rate

- **After every task commit:** Run targeted grizzle test files (`analysisMonitoring.test.ts`, `analyses.test.ts`)
- **After every plan wave:** Run `pnpm --filter nuxt-galaxy test` and `pnpm typecheck`
- **Before `/gsd-verify-work`:** Root `pnpm test`, `pnpm typecheck`, `pnpm lint` must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | WRIT-01 | — | N/A | unit | `pnpm --filter nuxt-galaxy vitest run test/server/utils/grizzle/analysisMonitoring.test.ts test/server/utils/grizzle/analyses.test.ts` | ✅ extend | ⬜ pending |
| 13-01-02 | 01 | 1 | WRIT-01 | — | N/A | unit + API | `pnpm --filter nuxt-galaxy vitest run test/server/utils/grizzle/analyses.test.ts test/server/api/db/analyses.test.ts` | ✅ extend | ⬜ pending |
| 13-02-01 | 02 | 2 | WRIT-02 | — | N/A | unit | `pnpm --filter nuxt-galaxy vitest run test/server/utils/grizzle/analyses.test.ts test/server/utils/grizzle/analysisMonitoring.test.ts` | ✅ extend | ⬜ pending |
| 13-02-02 | 02 | 2 | WRIT-02 | — | N/A | unit + API | `pnpm --filter nuxt-galaxy vitest run test/server/utils/grizzle/analyses.test.ts test/server/api/db/analyses-delete.test.ts` | ✅ existing/extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/server/utils/grizzle/analysisMonitoring.test.ts` — extend `insertAnalysisMonitoringEffect` test to assert snapshot values (PLAN-01)
- [ ] `test/server/utils/grizzle/analyses.test.ts` — extend `insertAnalysis` snapshot assertions (PLAN-01) + `deleteAnalysis` finalize UPDATE shape/order/atomicity + Galaxy-failure no-finalize (PLAN-02)
- [ ] `test/server/api/db/analyses.test.ts` / `analyses-delete.test.ts` — controller wiring regression (PLAN-01/PLAN-02)
- Existing infrastructure (`createMockDrizzle` stubs `transaction`/`update`/`set`/`where`/`delete`) covers all phase requirements — no new fixture files needed.

---

## Manual-Only Verifications

None — all phase behaviors (WRIT-01 snapshot, WRIT-02 finalize) have automated verification. TEST-02's full "stats survive analysis deletion" end-to-end assertion is Phase 16 scope.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
