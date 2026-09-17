---
phase: 15
slug: api-endpoints
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-11
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (node environment) |
| **Config file** | `packages/nuxt-galaxy/vitest.config.server.ts` (server) |
| **Quick run command** | `pnpm --filter ./packages/nuxt-galaxy exec vitest run --config vitest.config.server.ts test/server/api/db/analyses/monitoring.get.test.ts test/server/api/db/analyses/monitoring/admin.get.test.ts test/server/utils/grizzle/supabase.test.ts` |
| **Full suite command** | `pnpm --filter ./packages/nuxt-galaxy test:server` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run the three phase test files (quick run command)
- **After every plan wave:** Run `pnpm test:server`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | API-02, API-04 | T-15-01 / T-15-04 | Admin endpoint returns all-users composite behind `requireRole(user, 'admin')`; non-admin → 403; gate-query rejection → AdminRoleCheckError → 500 logged; no logging inside requireRole (D-04) | integration | `pnpm exec vitest run --config vitest.config.server.ts test/server/api/db/analyses/monitoring/admin.get.test.ts` | ✅ | ✅ green |
| 15-01-01 | 01 | 1 | API-04 | T-15-01 / T-15-04 | Shared `requireRole(user, role)` Effect gate: role granted → Unit; empty match → ForbiddenError (403); query rejection → AdminRoleCheckError (500) | unit | `pnpm exec vitest run --config vitest.config.server.ts test/server/utils/grizzle/supabase.test.ts` | ✅ | ✅ green |
| 15-01-02 | 01 | 1 | API-01, API-03 | T-15-02 | Self endpoint returns full `AnalysisMonitoringStats` composite; ownerId derived from server-session user id only, never client input; no role gate on self (D-07) | integration | `pnpm exec vitest run --config vitest.config.server.ts test/server/api/db/analyses/monitoring.get.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. The two existing endpoint suites (`monitoring.get.test.ts`, `monitoring/admin.get.test.ts`) were repaired to the new handler surface during validation, and direct `requireRole` unit tests were added to `supabase.test.ts`.

- [x] `test/server/api/db/analyses/monitoring.get.test.ts` — self endpoint composite + session ownerId (API-01, API-03)
- [x] `test/server/api/db/analyses/monitoring/admin.get.test.ts` — admin gate + composite (API-02, API-04)
- [x] `test/server/utils/grizzle/supabase.test.ts` — requireRole unit coverage (API-04)

---

## Manual-Only Verifications

All phase behaviors have automated verification.

> Note: RLS-scoping / aggregation-SQL / deletion-survival integration coverage against a live database is deferred to Phase 16 (Testing & Quality Gates) per the phase plan's explicit scope — not a Phase 15 gap.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-11
