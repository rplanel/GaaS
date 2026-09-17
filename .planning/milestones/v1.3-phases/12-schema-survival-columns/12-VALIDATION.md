---
phase: 12
slug: schema-survival-columns
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-10
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.0 (catalog:testing) |
| **Config file** | `packages/nuxt-galaxy/vitest.config.server.ts` |
| **Quick run command** | `pnpm exec vitest run server/db/schema/galaxy/analysisMonitoring.test.ts --config vitest.config.server.ts` (from `packages/nuxt-galaxy`) |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm exec vitest run server/db/schema/galaxy/analysisMonitoring.test.ts --config vitest.config.server.ts`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | SCHE-01 | T-12-01 / — | Drizzle schema exposes 3 nullable snapshot fields; RLS preserved | unit | vitest analysisMonitoring.test.ts | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | SCHE-02 | T-12-01 / — | Migration SQL adds 2 composite indexes | unit | vitest analysisMonitoring.test.ts | ❌ W0 | ⬜ pending |
| 12-01-03 | 01 | 1 | SCHE-03 | T-12-01 / — | Backfill UPDATE joins workflows, known values only, idempotent | unit | vitest analysisMonitoring.test.ts | ❌ W0 | ⬜ pending |
| 12-01-04 | 01 | 1 | SCHE-01 | — | Regenerated types compile; 3 columns present in `database.ts` | manual | `supabase:generate:types` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/server/db/schema/galaxy/analysisMonitoring.test.ts` — add migration + schema assertions (REQ SCHE-01/02/03)
- [ ] A running local Supabase (`supabase start`) + applied migration as prerequisite for the manual `supabase:generate:types` verification step (criterion 4)

*(No framework-install gap: Vitest is already configured.)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Regenerated Supabase types compile against extended schema | SCHE-01 (criterion 4) | Requires live local DB with migration applied | Run `supabase start`, apply migration, run `supabase:generate:types`, confirm the three columns exist in `src/runtime/types/database.ts` and `pnpm typecheck` passes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
