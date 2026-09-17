# Phase 16: Testing & Quality Gates - Context

**Gathered:** 2026-08-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify the v1.3 analysis-usage-statistics milestone (Phases 12–15) end-to-end through tests and keep the monorepo quality gates green. Concretely: cover aggregation SQL (per-workflow, trend, outcome counts — TEST-01), prove delete-time finalization and that stats survive analysis deletion (TEST-02), prove RLS/self-scoping prevents one user reading another's stats (TEST-03), prove the admin gate rejects non-admin users (TEST-04), and land root `pnpm lint` / `pnpm typecheck` / `pnpm test` green (TEST-05).

**In scope:** the test-coverage decisions below plus the green quality-gate verification. **Out of scope:** new feature work, new schema/table/write-path changes, any UI. Much of the Phase 16 scope is *already covered* by tests written during Phases 14–15 — this phase fills the deliberate gaps identified during discussion and closes the milestone with a green gate run.

</domain>

<decisions>
## Implementation Decisions

### Self-Scoping / RLS Proof (TEST-03)
- **D-01:** **Mock-based proof is sufficient.** No real-Postgres/Supabase integration test is added; the suite stays DB-free. Self-scoping is proven two ways that already exist: every self helper asserts a `WHERE eq(ownerId, ...)` filter (counts, per-workflow, trend, composite) and the schema test asserts both RLS SELECT policies (owner `= auth.uid()`, admin `is_admin()`). Postgres-side RLS is enforced by Supabase, not by app code, so policy-contract assertion is the right level. — **Reversibility:** reversible.
- **D-02:** Add an explicit **TEST-03 contract test**: admin `getAll*` variants emit **no** `ownerId` filter while self variants always do. A deliberate negative assertion pinning the self/admin distinction (blanket vs. owner-scoped), including the admin variant of the composite. — **Reversibility:** reversible.

### Aggregation SQL Test Fidelity (TEST-01)
- **D-03:** **Keep the suite mock-based.** Per-workflow / trend / outcome-count SQL is covered by asserting helper output against fixture rows plus the built query shape (WHERE / GROUP BY / `filter (where ...)`), consistent with the existing DB-free suite. Real Postgres behaviors — `generate_series` continuity, `date_trunc ... AT TIME ZONE 'UTC'` — are validated through the unit tests on the JS bucketing that normalizes the canonical UTC bucket keys, not by executing SQL against a DB. — **Reversibility:** reversible.
- **D-04 (agent discretion):** Whether to additionally assert the trend helper is invoked with the canonical granularity default (`'day'`) and its query contract params is left to the researcher/planner. The JS bucketing + result-shape assertions in D-03 are the floor.

### Admin-Gate Test Layer (TEST-04)
- **D-05:** Test the admin gate at **both layers**. A **helper-level** test of the real `requireRole` (its `userRoles ⋈ roles` join against a mock Drizzle layer), plus the **handler-level** test already present in `admin.get.test.ts` (mock `requireRole` → 403) so the endpoint mapping is proven too. Belt-and-suspenders: gate logic AND endpoint wiring. — **Reversibility:** reversible.
- **D-06:** The helper-level `requireRole` test covers **all three branches**: (1) granted role → `Effect.void`, (2) deny / empty role join → `ForbiddenError`, (3) Drizzle query rejection → `AdminRoleCheckError` (500). It validates the helper is **role-agnostic** (`admin` is just one role instance). — **Reversibility:** reversible.

### Deletion-Survival Test Depth (TEST-02)
- **D-07:** Add an **integrated create → delete → query (survive) flow test**: create an analysis snapshotting workflow provenance, simulate workflow deletion, then run the stats query and assert the row survives — surfaced via the **snapshotted per-workflow entry (name/version preserved), not the `unknown` bucket**. Proves the milestone's core guarantee in one end-to-end place. — **Reversibility:** reversible.
- **D-08:** Also add a targeted **unit test for the delete-finalization pending-guard**: finalization only flips `pending → cancelled` and its guarded UPDATE no-ops when a real terminal outcome (`success`/`error`) is already present — sync's write is never overwritten by deletion. The orphan/`unknown`-bucket path is already unit-tested (Phase 14). — **Reversibility:** reversible.

### the agent's Discretion
- Exact test structure/placement (new files vs. expanding existing `analysisMonitoring.test.ts` / `supabase.test.ts` / `admin.get.test.ts`), how the integrated flow test wires the snapshot + workflow-delete simulation, and whether the TEST-05 gate verification is captured as an evidence note. D-04 granularity-param assertion is open.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Testing & Quality Gates requirements
- `.planning/REQUIREMENTS.md` §"Testing & Quality Gates" — TEST-01 (aggregation SQL), TEST-02 (delete finalization + survival), TEST-03 (RLS/self-scoping), TEST-04 (admin gate rejects non-admin), TEST-05 (root gates pass).

### Roadmap & prior-phase contract
- `.planning/ROADMAP.md` §"Phase 16: Testing & Quality Gates" — goal and the 5 success criteria this phase satisfies.
- `.planning/phases/15-api-endpoints/15-CONTEXT.md` — D-06 (backward-compatible composite shape the tests assert against), and note that Phase 15 **explicitly deferred handler tests (incl. `requireRole`/composite mocks) to Phase 16**. **MUST read**.
- `.planning/phases/14-stats-query-layer/14-CONTEXT.md` — D-09 (orphan `unknown` bucket), D-12 (self helpers always `WHERE owner_id` server-side — the mechanism TEST-03 proves). **MUST read**.
- `.planning/phases/13-write-path-integrity/13-CONTEXT.md` — D-09 (delete-finalize `pending` guard), D-10 (snapshot frozen at write) — the guarantees TEST-02/D-08 assert.

### Existing test code (codebase)
- `packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts` — the query-layer suite that already asserts `WHERE eq(ownerId)` for self helpers (counts ~L326, per-workflow ~L580, trend ~L811/827, composite ~L985-988) and the orphan/`unknown` bucket (~L583). TEST-01/TEST-03 extend this file's patterns.
- `packages/nuxt-galaxy/test/server/api/db/analyses/monitoring/admin.get.test.ts` — handler-level admin-gate test that already proves non-admin → 403 (L121), 401s, and the 500 path (L167). TEST-04 builds on this.
- `packages/nuxt-galaxy/test/server/utils/grizzle/supabase.test.ts` — home of the existing `requireRole` helper test (`describe('requireRole')` ~L199); TEST-04/D-06 expands it to all three branches.
- `packages/nuxt-galaxy/test/server/db/schema/galaxy/analysisMonitoring.test.ts` — asserts both RLS `pgPolicy` SELECT policies (owner `= auth.uid()`, admin `is_admin()`) and the migration/index SQL. The D-01/D-02 RLS proofs live here.

### Fixtures & conventions
- `packages/nuxt-galaxy/test/server/fixtures.ts` — `createMockDrizzle`, mock DB row/`GalaxyWorkflow` fixtures, `createMockSupabaseClient`, `createLogCaptureLayer`; the shared factories for every Phase 16 test.
- `packages/nuxt-galaxy/test/server/setup.ts` — global mocks (`evlog`, `#imports`, `#supabase/server`) the server suite depends on.
- `.planning/codebase/TESTING.md` — comprehensive testing conventions (Vitest threads pool, Effect test patterns, `expectFailure`, mock-Drizzle builder, coverage posture). **MUST read** before writing any Phase 16 test.

### Module conventions
- `packages/nuxt-galaxy/AGENTS.md` — Effect/DI patterns, migration/DB rules relevant to the write-path tests.
- `.planning/LOGGING-SPEC.md` — evlog conventions; never-log-secrets (relevant if any test asserts handler logging on the 500 gate path).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createMockDrizzle` + `setResult`/`enqueueResult` (`test/server/fixtures.ts:447`) — the chainable query-builder mock powering every aggregation / self-scoping / `requireRole` test; already used throughout `analysisMonitoring.test.ts`.
- `server/fixtures.ts` mock row factories (`mockDb*`) typed to the Drizzle schema — source of fixture rows for the trend / per-workflow / survival tests.
- The existing suites above already cover the bulk of TEST-01/03/04 — this phase fills gaps (D-02 admin-no-filter, D-06 `requireRole` branches, D-07/D-08 survival), not rebuilds.

### Established Patterns
- Effect tests run inside `Effect.gen` with a mock layer, asserting via `Effect.runPromise` / `Effect.runPromiseExit` + `expectFailure`; handler tests assert `createError` statusCode objects (e.g. `{ statusCode: 403 }`).
- Self-helpers assert the built `where` equals `eq(analysisMonitoring.ownerId, 'owner-uuid-1')` by inspecting `mock.select.mock.results`; admin variants assert no such `where` — the D-02 pattern already exists per-dimension.
- Schema tests assert RLS policies via `config[].filter(i => i instanceof PgPolicy)` and migration SQL via regex over the generated `migration.sql` — the D-01 RLS proof.

### Integration Points
- `requireRole` (`utils/grizzle/supabase.ts`) is the shared admin gate; its helper test lives in `supabase.test.ts` (D-05/D-06), while the endpoint wiring test lives in `admin.get.test.ts` (D-05).
- The survival flow test (D-07) threads the Phase 13/14 contract: `insertAnalysisMonitoringEffect` snapshot → `deleteAnalysis`/`finalizeAnalysisMonitoringEffect` pending-guard → `getAnalysisMonitoringStats`/`getWorkflowUsage` snapshotted-name entry.
- Root gates (`pnpm lint` / `pnpm typecheck` / `pnpm test`, threads pool) are the TEST-05 exit criterion; no new dependencies introduced.

</code_context>

<specifics>
## Specific Ideas

- The user confirmed the suite must stay **DB-free / mock-based** for both self-scoping (D-01) and aggregation SQL fidelity (D-03) — no real-Postgres integration tests added to this milestone's test phase.
- The user wanted the self/admin distinction made **explicit and negative** — assert admin emits no owner filter (D-02) — rather than only asserting the self side.
- The user wanted the admin gate proven at **both layers** (helper + handler, D-05) and `requireRole` covered across **grant/deny/query-error** (D-06).
- For deletion survival, the user wanted a real **create→delete→survive flow** (D-07) plus a targeted **pending-guard** unit test (D-08).

</specifics>

<deferred>
## Deferred Ideas

- **Real-Postgres / local-Supabase RLS integration tests** — consciously rejected for TEST-03 (D-01): postgres-side RLS is Supabase's guarantee and policy shape is already asserted; a DB-dependent test would break the DB-free suite. Future consideration if RLS behavior itself ever regresses.
- **E2E / Playwright** — still not configured in the repo (only vendored fixtures); not needed for this server-only, no-UI milestone.
- **Coverage thresholds as a hard gate** — `blendtype` runs coverage but no numeric threshold gates root `pnpm test`; TEST-05 only requires the bare gates to pass, not a raised coverage floor.

</deferred>

---

*Phase: 16-Testing & Quality Gates*
*Context gathered: 2026-08-11*
