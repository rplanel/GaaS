# Phase 16: Testing & Quality Gates - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-11
**Phase:** 16-Testing & Quality Gates
**Areas discussed:** Self-scoping (RLS) proof; Aggregation SQL test fidelity; Admin-gate test layer; Deletion-survival test depth

---

## Self-Scoping (RLS) Proof

**Context noted:** Query-layer tests already assert `WHERE ownerId` for every self dimension; schema test already asserts both RLS SELECT policies; the suite has no real Postgres.

| Option | Description | Selected |
|--------|-------------|----------|
| Mock-based proof is sufficient | Consistent with no-real-DB suite; self helpers filter ownerId + RLS policy contract asserted | ✓ |
| Add one real-DB RLS test | Spin up local Supabase/Postgres to prove actual cross-user SELECT returns nothing | |

**User's choice:** Mock-based proof is sufficient.
**Notes:** Postgres-side RLS is enforced by Supabase, not app code — policy-contract assertion is the right level.

| Option | Description | Selected |
|--------|-------------|----------|
| Assert admin emits no owner filter | Explicit negative test: admin getAll* emit no ownerId filter while self always do | ✓ |
| Existing assertions are enough | Don't add a dedicated admin-no-filter assertion | |

**User's choice:** Assert admin emits no owner filter.

---

## Aggregation SQL Test Fidelity

| Option | Description | Selected |
|--------|-------------|----------|
| Keep mock-based, assert query shape | Assert helper output from fixture rows + query shape (WHERE/GROUP BY/filter-where) | ✓ |
| Add a real-SQL integration test | Execute real aggregation SQL against local Postgres to prove generate_series/date_trunc | |

**User's choice:** Keep mock-based, assert query shape.

| Option | Description | Selected |
|--------|-------------|----------|
| Assert granularity + query contract | Also assert the trend helper's granularity default + canonical UTC bucketing params pass through | (dismissed) |
| Result-shape assertions are enough | Don't inspect the SQL/param layer further | |

**User's choice:** Question dismissed — left to researcher/planner as agent discretion (D-04).

---

## Admin-Gate Test Layer

| Option | Description | Selected |
|--------|-------------|----------|
| Helper + handler coverage | Helper-level test of real requireRole join AND existing handler-level 403 | ✓ |
| Existing coverage is enough | Rely on existing admin.get.test.ts + supabase.test.ts requireRole test | |
| Helper-level only | Only test real requireRole against mocked Drizzle join | |

**User's choice:** Helper + handler coverage.

| Option | Description | Selected |
|--------|-------------|----------|
| Cover grant, deny, and query-error branches | requireRole test covers grant → void, deny → ForbiddenError, query reject → AdminRoleCheckError | ✓ |
| Minimal deny-path only | Just the existing non-admin → ForbiddenError case | |

**User's choice:** Cover grant, deny, and query-error branches.

---

## Deletion-Survival Test Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Integrated create→delete→survive flow | Create analysis (snapshot), delete workflow, query stats, assert snapshotted entry survives | ✓ |
| Separate unit-level tests only | Keep finalize and snapshot-preservation as separate unit tests | |
| Both flow + unit tests | Integrated flow AND unit-level finalize/guard tests | |

**User's choice:** Integrated create→delete→survive flow.

| Option | Description | Selected |
|--------|-------------|----------|
| Add finalization guard unit test too | Targeted unit test: finalize only flips pending; never overwrites real terminal outcome | ✓ |
| Flow test only | Integrated flow test is sufficient | |

**User's choice:** Add finalization guard unit test too.

---

## the agent's Discretion

- D-04: whether to additionally assert the trend helper's granularity default + query-contract params (follow-up question was dismissed by the user).
- Exact test placement/structuring (new files vs. expanding existing `analysisMonitoring.test.ts` / `supabase.test.ts` / `admin.get.test.ts`), how the integrated survival flow wires the snapshot + workflow-deletion simulation, and how the TEST-05 gate verification is recorded.

## Deferred Ideas

- Real-Postgres / local-Supabase RLS integration tests — rejected for TEST-03 (D-01); suite stays DB-free.
- E2E / Playwright — still not configured; not needed for this server-only, no-UI milestone.
- Hard coverage thresholds — TEST-05 only requires the bare gates to pass, not a raised coverage floor.
