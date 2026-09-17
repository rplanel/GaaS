# Phase 16: Testing & Quality Gates - Research

**Researched:** 2026-08-11
**Domain:** Vitest + Effect + Drizzle mock-based testing, monorepo quality gates
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Self-Scoping / RLS Proof (TEST-03)
- **D-01:** **Mock-based proof is sufficient.** No real-Postgres/Supabase integration test is added; the suite stays DB-free. Self-scoping is proven two ways that already exist: every self helper asserts a `WHERE eq(ownerId, ...)` filter (counts, per-workflow, trend, composite) and the schema test asserts both RLS SELECT policies (owner `= auth.uid()`, admin `is_admin()`). Postgres-side RLS is enforced by Supabase, not by app code, so policy-contract assertion is the right level.
- **D-02:** Add an explicit **TEST-03 contract test**: admin `getAll*` variants emit **no** `ownerId` filter while self variants always do. A deliberate negative assertion pinning the self/admin distinction (blanket vs. owner-scoped), including the admin variant of the composite.

### Aggregation SQL Test Fidelity (TEST-01)
- **D-03:** **Keep the suite mock-based.** Per-workflow / trend / outcome-count SQL is covered by asserting helper output against fixture rows plus the built query shape (WHERE / GROUP BY / `filter (where ...)`), consistent with the existing DB-free suite. Real Postgres behaviors — `generate_series` continuity, `date_trunc ... AT TIME ZONE 'UTC'` — are validated through the unit tests on the JS bucketing that normalizes the canonical UTC bucket keys, not by executing SQL against a DB.
- **D-04 (agent discretion):** Whether to additionally assert the trend helper is invoked with the canonical granularity default (`'day'`) and its query contract params is left to the researcher/planner. The JS bucketing + result-shape assertions in D-03 are the floor.

### Admin-Gate Test Layer (TEST-04)
- **D-05:** Test the admin gate at **both layers**. A **helper-level** test of the real `requireRole` (its `userRoles ⋈ roles` join against a mock Drizzle layer), plus the **handler-level** test already present in `admin.get.test.ts` (mock `requireRole` → 403) so the endpoint mapping is proven too. Belt-and-suspenders: gate logic AND endpoint wiring.
- **D-06:** The helper-level `requireRole` test covers **all three branches**: (1) granted role → `Effect.void`, (2) deny / empty role join → `ForbiddenError`, (3) Drizzle query rejection → `AdminRoleCheckError` (500). It validates the helper is **role-agnostic** (`admin` is just one role instance).

### Deletion-Survival Test Depth (TEST-02)
- **D-07:** Add an **integrated create → delete → query (survive) flow test**: create an analysis snapshotting workflow provenance, simulate workflow deletion, then run the stats query and assert the row survives — surfaced via the **snapshotted per-workflow entry (name/version preserved), not the `unknown` bucket**. Proves the milestone's core guarantee in one end-to-end place.
- **D-08:** Also add a targeted **unit test for the delete-finalization pending-guard**: finalization only flips `pending → cancelled` and its guarded UPDATE no-ops when a real terminal outcome (`success`/`error`) is already present — sync's write is never overwritten by deletion.

### the agent's Discretion
- Exact test structure/placement (new files vs. expanding existing `analysisMonitoring.test.ts` / `supabase.test.ts` / `admin.get.test.ts`), how the integrated flow test wires the snapshot + workflow-delete simulation, and whether the TEST-05 gate verification is captured as an evidence note. D-04 granularity-param assertion is open.

### Deferred Ideas (OUT OF SCOPE)
- **Real-Postgres / local-Supabase RLS integration tests** — consciously rejected for TEST-03 (D-01).
- **E2E / Playwright** — not configured in the repo; not needed for this server-only, no-UI milestone.
- **Coverage thresholds as a hard gate** — no numeric threshold gates root `pnpm test`; TEST-05 only requires the bare gates to pass.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | Tests cover aggregation SQL (per-workflow, trend, outcome counts) | **Already covered** by `analysisMonitoring.test.ts` (`getAnalysisMonitoringCounts` L307, `getWorkflowUsage` L562, `getTrend` L739, composites L942/L1007). No new SQL tests needed — verify existing, optionally add D-04. |
| TEST-02 | Tests verify delete-time finalization and that stats survive analysis deletion | Delete-time finalization **already covered** extensively in `analyses.test.ts` `describe('deleteAnalysis')` L294-527. D-08 pending-guard **already covered** (L378-396, L455-478). **Genuine new work: D-07** integrated create→delete→survive flow test. |
| TEST-03 | Tests verify RLS/self-scoping prevents one user reading another's stats | **Already covered**: self helpers assert `WHERE eq(ownerId)` per-dimension (counts L325, per-workflow L579, trend L826-829, composite L981-988); admin helpers assert zero WHERE (counts L544, per-workflow L637, trend L842-846, composite L1031-1035); schema test asserts both RLS policies (L25-51). D-01/D-02 satisfied as-is. |
| TEST-04 | Tests verify the admin gate rejects non-admin users | **Already covered at both layers**: helper-level `requireRole` three-branch test in `supabase.test.ts` L199-243; handler-level `admin.get.test.ts` (403 L121, 401 L134/145/156, 500 L167). D-05/D-06 satisfied as-is; only the optional role-agnosticism sub-assertion is absent. |
| TEST-05 | Root `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass | Documented below; verify by running all three root gates and capturing exit codes. threads pool already configured in all vitest configs. |
</phase_requirements>

## Summary

This phase's core finding is that **most of TEST-01 through TEST-04 is already green** — the suites written in Phases 14–15 (and the delete/finalize suite from Phase 13) already land the bulk of the required coverage. The genuinely new *implementation* work is **D-07** (the integrated create → delete → survive flow test) and, at most, two optional additions the context leaves open (D-06 role-agnosticism; D-04 granularity-default assertion). The **primary** remaining responsibility of the phase is verifcation: the TEST-05 root `pnpm lint` / `pnpm typecheck` / `pnpm test` green run, evidenced for the milestone gate.

Because this is a test-only, DB-free, mock-based phase that introduces **no new dependencies**, the standard stack is the repo's existing Vitest + Effect + `createMockDrizzle` fixture machinery. There is nothing to install. The research below documents the exact patterns the (few) new tests must follow, the precise already-covered map so the planner does not duplicate work, and the TEST-05 verification procedure.

**Primary recommendation:** Implement **one new integrated survival-flow test (D-07)** in a new file `test/server/utils/grizzle/survival-flow.test.ts`, optionally add the D-06 role-agnostic sub-assertion to the existing `supabase.test.ts` `describe('requireRole')`, skip D-04, and treat D-01/D-02/D-03/D-05/D-06/D-08 as already satisfied. Then run and evidence the three root gates (TEST-05).

## Verified Already-Covered Map (do NOT re-implement)

| Decision | Status | Where it lives (verified this session) |
|----------|--------|----------------------------------------|
| D-01 (mock-based RLS proof, two ways) | ✅ Covered | Self `WHERE` assertions + schema RLS policy test |
| D-02 (admin emits no owner filter, incl. composite) | ✅ Covered | Admin zero-WHERE assertions per-dimension + composite |
| D-03 (mock-based aggregation SQL fidelity) | ✅ Covered | Full query-layer suites |
| D-04 (trend `'day'` default assertion) | ⚠️ Optional | Not present — recommend skip (implicitly covered) |
| D-05 (admin gate both layers) | ✅ Covered | `supabase.test.ts` helper + `admin.get.test.ts` handler |
| D-06 (requireRole three branches) | ✅ Covered | `supabase.test.ts` L199-243; only role-agnosticism absent |
| D-07 (create→delete→survive flow) | ❌ **New** | No integrated flow test exists |
| D-08 (delete-finalization pending-guard) | ✅ Covered | `analyses.test.ts` L378-396, L398-407, L455-478 |

## Project Constraints (from AGENTS.md)

Root and package AGENTS.md directives that govern Phase 16 (all verified against the repo):

- **Protected files, do not modify:** `pnpm-workspace.yaml`, root `package.json` scripts, generated dirs (`.nuxt/`, `dist/`, `.output/`). Phase 16 adds no deps, so `pnpm-workspace.yaml` is untouched.
- **Layer dependency direction:** `wiki → ui → nuxt-galaxy → blendtype`; tests live in the owning package. Phase 16 tests belong in `packages/nuxt-galaxy/test/server/` only.
- **blendtype is a pure TS library with NO Nuxt/Node code**; `nuxt-galaxy` is the module owning Drizzle/DB logic — all tests here are server-side in nuxt-galaxy.
- **Never log secrets** (LOGGING-SPEC / evlog): any test asserting handler logging (the 500 gate path in `admin.get.test.ts`) must not introduce secrets; assert on `requestLog.error` calls with plain cause strings.
- **`evlog` conventions:** server API routes use `useLogger(event)`; tests mock it via `createMockRequestLogger` (setup.ts).
- **Testing standards:** Vitest threads pool (must-preserve in any new config — none added); mock `blendtype`/Galaxy HTTP; never real DB (DB-free suite is a locked decision D-01/D-03).
- **Git hooks:** pre-commit runs `pnpm lint --fix` via lint-staged; do not bypass (`HUSKY=0`/`--no-verify` prohibited). New test files must pass `pnpm lint` (ESLint + `@antfu/eslint-config`).
- **TypeScript strict mode** in all packages; new test files must pass `vue-tsc --noEmit`/`tsc` typecheck.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Aggregation SQL fidelity (TEST-01) | API / Backend (query-layer helpers) | — | `analysisMonitoring.ts` Effect helpers own the SQL; tests assert their output + built query shape |
| Self-scoping / RLS proof (TEST-03) | API / Backend (server) | Database / Storage | App enforces `WHERE owner_id` server-side; RLS policy shape asserted via schema (D-01, D-02) |
| Admin-gate rejection (TEST-04) | API / Backend (handler + `requireRole`) | — | Gate logic in `requireRole`; endpoint wiring in `admin.get.ts` |
| Delete survival (TEST-02) | API / Backend (write path) | Database / Storage | `deleteAnalysis` finalize + snapshot survive in the monitoring table |
| Quality gates (TEST-05) | Tooling / CI | — | Root `pnpm lint/typecheck/test` are repo-level gates |

## Standard Stack

### Core (already installed — Phase 16 adds NOTHING)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | ^4.1.0 (`catalog:testing`) | Test runner | Repo-wide runner; threads pool mandated by TESTING.md |
| Effect-TS | ^3.19.6 (`catalog:`) | Effect program testing | `Effect.runPromise`/`runPromiseExit`/`expectFailure` patterns |
| @vue/test-utils | ^2.4.6 | (not used in these server tests) | — |
| Drizzle ORM | ^1.0.0-beta.16 (`catalog:`) | `eq`/`and` for WHERE-shape assertions | Existing query-shape assertions use `eq(analysisMonitoring.ownerId, ...)` |
| evlog | (workspace) | Request logger mock | `createMockRequestLogger` from `setup.ts` for handler tests |

### No new packages

Phase 16 is test-only and introduces **no new runtime or dev dependencies** (locked: "no new dependencies introduced"). Nothing to install; `pnpm-workspace.yaml` and root scripts stay untouched.

**Version verification (no install needed):** All packages above are already present in the workspace `node_modules` and pinned via `pnpm-workspace.yaml` catalogs `[VERIFIED: packages/nuxt-galaxy/AGENTS.md §Stack & dependencies]`.

## Package Legitimacy Audit

> **N/A** — this phase installs no external packages. Per the Package Legitimacy Gate protocol, the audit applies only to phases that install packages; Phase 16's locked decisions confirm "no new dependencies introduced" (16-CONTEXT.md L86) and there is nothing in the standard stack above that is not already vendored/pinned in-repo. No `[SLOP]`/`[SUS]` packages exist to gate.

## Architecture Patterns

### System Architecture Diagram

```
 [Phase 16 test author]
        │
        ▼
 ┌─────────────────────────┐        ┌──────────────────────────────┐
 │ createMockDrizzle()     │◄───────│ fixtures.ts:452 (setResult /  │
 │  .select/.insert/.update│        │  enqueueResult FIFO, .layer) │
 └───────────┬─────────────┘        └──────────────────────────────┘
             │ Layer.succeed(Drizzle, mock)
             ▼
 ┌──────────────────────────┐
 │ Effect.gen { yield* … }  │  e.g. getWorkflowUsage / finalize /
 │   .pipe(Effect.provide   │  deleteAnalysis / requireRole
 │     (drizzle.layer))     │
 └───────────┬──────────────┘
             │ runtime
             ▼
   Effect.runPromise / runPromiseExit
   (assert success / expectFailure)
```

```
 D-07 integrated survival flow (mock state is a FIFO across steps):
  insertAnalysisMonitoringEffect(snapshot)  →  finalize/delete  →  getWorkflowUsage
   [insert returns {id:1}]                    [update→{updatedId},   [returns row with
                                               delete→{id:1}]         workflowName:'…',
                                                                      NOT in unknown bucket]
```

### Recommended Project Structure (new test placement)

D-07 bridges two modules (`analysisMonitoring.ts` for insert/query, `analyses.ts` for finalize/delete) — put it in **one new helper-level file** so it reads as one integrated flow and stays DB-free:

```
packages/nuxt-galaxy/test/server/utils/grizzle/
├── survival-flow.test.ts     # NEW — D-07 integrated create→delete→survive flow
├── analyses.test.ts          # existing — D-08 finalize/pending-guard already here (do not duplicate)
├── analysisMonitoring.test.ts# existing — TEST-01/03 query suites (verify only)
└── supabase.test.ts          # existing — D-06 requireRole; optionally add role-agnostic sub-test
```

Placement rationale (agent's discretion): a dedicated `survival-flow.test.ts` keeps the flow isolated and discoverable, avoids bloating the 1110-line `analysisMonitoring.test.ts`, and avoids entangling `analyses.test.ts` (which already owns the delete/finalize domain) with a brand-new cross-module scenario. Do **not** expand `admin.get.test.ts` (handler layer) for D-07 — it is a helper-level concern.

### Pattern 1: DB-free mock query-builder (the core of every Phase 16 test)
**What:** `createMockDrizzle()` returns a chainable query-builder mock whose terminal `.then()` resolves to a configured result; `setResult`/`enqueueResult` drive it. `.select.mock.results` carries the built query for shape assertions.
**When to use:** every aggregation / self-scoping / requireRole / survival test.
**Source:** verified from `packages/nuxt-galaxy/test/server/fixtures.ts:452-476`.

```typescript
const drizzle = createMockDrizzle()
drizzle.setResult([{ total: 7, success: 3, error: 2, cancelled: 1, pending: 1 }])

const result = await getAnalysisMonitoringCounts('owner-uuid-1').pipe(
  Effect.provide(drizzle.layer),
  Effect.runPromise,
)
expect(result).toEqual({ total: 7, success: 3, error: 2, cancelled: 1, pending: 1 })
// WHERE-shape assertion — proves the self helper is owner-scoped:
const whereCall = drizzle.mock.select.mock.results[0]?.value.where.mock.calls[0]?.[0]
expect(whereCall).toEqual(eq(analysisMonitoring.ownerId, 'owner-uuid-1'))
// Admin variant: assert NO where was built:
expect(drizzle.mock.select.mock.results[0]?.value.where.mock.calls.length).toBe(0)
```
`enqueueResult` is required for multi-query paths (composite `getAnalysisMonitoringStats` pops 4 select results; trend pops range + buckets) `[VERIFIED: fixtures.ts:452-476 + analysisMonitoring.test.ts:942-989]`.

### Pattern 2: `requireRole` three-branch test
**Source:** `[VERIFIED: supabase.test.ts:199-243]` — resolve via `Effect.either` + `Either.match`, drive the join with the mock Drizzle, assert `_tag`.

```typescript
function resolveRequireRole(drizzle: ReturnType<typeof createMockDrizzle>) {
  return Either.match(
    Effect.runSync(Effect.either(requireRole({ id: 'user-id' }, 'admin').pipe(Effect.provide(drizzle.layer)))),
    { onRight: () => ({ _tag: '__success__' }), onLeft: error => error },
  )
}
// branch 1 (granted):   setResult([{ userId: 'user-id' }]) -> outcome === { _tag: '__success__' }, limit(...).toBe(1)
// branch 2 (deny):      setResult([])                      -> (outcome)._tag === 'ForbiddenError'
// branch 3 (query err): mockDrizzleSelectRejects([...], new Error('boom')) -> _tag === 'AdminRoleCheckError', message contains 'boom'
```

### Pattern 3: `${STATUS}`-shaped handler gate test
**Source:** `[VERIFIED: admin.get.test.ts:121-182]` — mock `requireRole`/`getSupabaseUser` at module level, assert the handler rejects with `createError`-shape objects.

```typescript
mockRequireRole.mockReturnValueOnce(Effect.fail(new ForbiddenError({ message: 'Forbidden: admin role required' })))
const handler = (await import('.../monitoring/admin.get')).default
await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 403, statusMessage: 'Forbidden: admin role required' })
```

### Pattern 4 (D-07 new): integrated survival-flow test
Thread the Phase 13/14/15 contract through one FIFO mock. Steps below in Code Examples.

### Anti-Patterns to Avoid
- **Re-adding D-02/D-06/D-08 tests** that already exist — duplicate coverage adds churn without value; verify-then-skip instead.
- **Writing a real-DB integration test** — violates locked D-01/D-03 (stay DB-free).
- **Asserting SQL strings** (`generate_series`, raw `date_trunc` text) — the D-03 decision is to assert JS bucketing output + query shape, not execute SQL. Only `TREND_INTERVALS` literals are asserted as an allowlist.
- **Using the forks pool** — any new/`editable` config must stay on `threads` to avoid errno -122/EDQUOT IPC writes.
- **Asserting on raw mock state instead of Effect output** — prefer `ExpectFailure`/`toEqual` on the resolved value.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mock Drizzle query chains | A custom stub builder | `createMockDrizzle()`/`setResult`/`enqueueResult` (fixtures.ts:375-476) | Already solves chaining, terminal thenables, FIFO for multi-query paths |
| Effect failure assertion | Manual `try/catch` on `Exit` | `expectFailure`/`expectSuccess` (fixtures.ts:598-627) | Handles `Fail` vs `Die`/`Cause` correctly |
| Drizzle query-rejection mocks | Ad-hoc `vi.fn` chains | `mockDrizzleSelectRejects`/`mockDrizzle*Rejects` (fixtures.ts:427-441) | Uniform rejection chain per method list |
| Supabase client mocks | Full manual client stub | `createMockSupabaseClient`/`createMockServerSupabaseClientLayer` | Typed, chainable, override-able |
| Nuxt auto-import / evlog mocks | Per-file `vi.mock` drift | `test/server/setup.ts` global mocks | Centralizes `evlog`/`#imports`/`#supabase/server` |
| Handler error logging assertions | Asserting real evlog output | `createMockRequestLogger` + `vi.mocked(useLogger).mockReturnValue(...)` | Proven pattern in `admin.get.test.ts` |

**Key insight:** every test primitive this phase needs already exists in `test/server/fixtures.ts` + `setup.ts` + the existing suites. The phase should *compose* these, not rebuild them — writing ad-hoc mock builders is the main avoidable complexity.

## Runtime State Inventory

> This is a **testing/greenfield-for-tests** phase, not a rename/refactor/migration phase. Step 2.5 is SKIPPED — no runtime state is renamed, stored-data schema is untouched, and no OS/secret/build-artifact registration changes.

## Common Pitfalls

### Pitfall 1: Duplicating already-existing coverage
**What goes wrong:** The planner re-implements D-08 (pending-guard), D-06 (three branches), and D-02 (admin no-filter) as if they do not exist, producing redundant tests.
**Why it happens:** CONTEXT.md was written (2026-08-11) around planned additions; Phases 13–15 subsequently landed most of them. `analyses.test.ts` and `supabase.test.ts` now already hold them.
**How to avoid:** Use the "Verified Already-Covered Map" above. Before writing any test, grep for the target helper name in `test/server/` (e.g. `finalizeAnalysisMonitoringEffect`, `describe('requireRole')`).
**Warning signs:** The new test duplicates an `it('...')` title already present in an existing `.test.ts`.

### Pitfall 2: `createError` statusCode shape mismatch
**What goes wrong:** Failing a handler test because the rejected error lacks a `statusCode` field.
**Why it happens:** The `#imports` mock builds `createError` objects `{ statusCode, statusMessage }` (setup.ts:48-55); asserting the raw `Error.message` instead of `statusCode` misses the contract.
**How to avoid:** Assert `rejects.toMatchObject({ statusCode: 403, statusMessage: ... })` exactly as `admin.get.test.ts:127-130` does.
**Warning signs:** A test asserts `.message` or `.name` on a handler rejection instead of `statusCode`/`statusMessage`.

### Pitfall 3: Effect `Die` vs `Fail` in failure assertions
**What goes wrong:** `expectFailure` throws "Effect died with defect" because the error surfaced as a `Die`, not a typed `Fail`.
**Why it happens:** A mock layer throws a raw error rather than `Effect.fail(...)`.
**How to avoid:** Return/reject `Effect.fail(new SomeTaggedError({ message: ... }))`; only wrap genuinely-throwing promises in `tryPromise`. For Drizzle rejects, use `mockDrizzleSelectRejects([...], error)` which routes to the typed `catch` → `Data.TaggedError` `Fail`.
**Warning signs:** `exit.cause._tag === 'Die'` in a test that expected `ForbiddenError`/`AdminRoleCheckError`.

### Pitfall 4: Mock-result ordering on multi-query helpers
**What goes wrong:** `getAnalysisMonitoringStats` / `getTrend` tests return the wrong data because `setResult` (not `enqueueResult`) is used and the FIFO is misaligned.
**Why it happens:** These helpers issue multiple `.select()` calls (counts, per-workflow, trend range, trend buckets) — a single `setResult` serves every call the same value.
**How to avoid:** Push each `.select` result in call order via `enqueueResult` (composite = 4 pops, trend = 2 pops), as `analysisMonitoring.test.ts:942-989` and `739-848` do.
**Warning signs:** A trend/composite assertion receives the counts row where it expected a bucket row.

### Pitfall 5: Wrong vitest environment / include path
**What goes wrong:** A `test/server/**` file doesn't run or runs under the client `environment: 'nuxt'` config.
**Why it happens:** nuxt-galaxy's default config `include: ['test/**/*.test.ts']` but `exclude: ['test/server/**']`; the server suite runs via `vitest run --config vitest.config.server.ts` (`include: ['test/server/**/*.test.ts']`, `environment:'node'`, `setupFiles: ./test/server/setup.ts`).
**How to avoid:** Put new tests under `test/server/` and run with the server config. The root `pnpm test` runs both (`vitest run && vitest run --config vitest.config.server.ts`).
**Warning signs:** A new test in `test/server/` never executes in local `pnpm --filter nuxt-galaxy vitest run` runs.

## Code Examples

### D-07: integrated create → delete → survive flow (NEW — the core deliverable)
Compose existing helpers against one FIFO mock. Each step's select/insert/update/delete result is set on the same `createMockDrizzle()` instance, in execution order.

```typescript
// packages/nuxt-galaxy/test/server/utils/grizzle/survival-flow.test.ts (NEW)
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  finalizeAnalysisMonitoringEffect,
  getWorkflowUsage,
  insertAnalysisMonitoringEffect,
} from '../../../../src/runtime/server/utils/grizzle/analysisMonitoring'
import { createMockDrizzle } from '../../fixtures'

describe('analysis monitoring stats survive workflow deletion (D-07)', () => {
  it('create (snapshot) → delete (finalize) → query surfaces the snapshotted name, not the unknown bucket', async () => {
    const drizzle = createMockDrizzle()

    // Step 1 — CREATE: persist an analysis snapshotting workflow provenance.
    drizzle.setResult([{ id: 1 }]) // insert .returning({ insertedId })
    await insertAnalysisMonitoringEffect(
      1, 'owner-uuid-1', 2, 'Test Analysis', 'galaxy-invocation-1',
      { workflowName: 'Pancake Wrapper', galaxyWorkflowId: 'galaxy-wf-9', workflowVersion: '2.0' },
    ).pipe(Effect.provide(drizzle.layer), Effect.runPromise)
    const snapshotValues = drizzle.mock.insert.mock.results[0]?.value.values.mock.calls[0]?.[0]
    expect(snapshotValues).toMatchObject({
      workflowName: 'Pancake Wrapper', galaxyWorkflowId: 'galaxy-wf-9', workflowVersion: '2.0',
    })

    // Step 2 — DELETE: workflow is removed; the stranded pending row is finalized to cancelled.
    drizzle.mock.update.mockImplementation(() =>
      // a real tx-client would be used inside deleteAnalysis; here we call the
      // finalize helper directly with the tx-shaped mock, mirroring analyse.test.ts
      ({}) as never)
    const finalized = await finalizeAnalysisMonitoringEffect(1, 'owner-uuid-1', drizzle.mock as never)
      .pipe(Effect.runPromise)
    // pending guard: the UPDATE carries analysisId+ownerId+outcome='pending'
    const whereCall = drizzle.mock.update.mock.results[0]?.value.where.mock.calls[0]?.[0]
    expect(whereCall).toEqual(and(
      eq(analysisMonitoring.analysisId, 1),
      eq(analysisMonitoring.ownerId, 'owner-uuid-1'),
      eq(analysisMonitoring.outcome, 'pending'),
    ))
    expect(finalized).toBeUndefined() // finalize returns row|undefined, never a count

    // Step 3 — QUERY: the snapshotted name survives, keyed as a named entry, NOT 'unknown'.
    drizzle.mock.select.mockImplementation(() =>
      createMockDrizzleResult([
        { workflowId: 2, name: 'Pancake Wrapper', version: '2.0',
          total: 1, success: 0, error: 0, cancelled: 1, pending: 0 },
      ]))
    const usage = await getWorkflowUsage('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer), Effect.runPromise,
    )
    expect(usage).toHaveLength(1)
    expect(usage[0]).toMatchObject({ workflowId: 2, name: 'Pancake Wrapper', version: '2.0', cancelled: 1 })
    expect(usage[0].successRate).toBe(0) // D-02 zero-denominator edge
  })
})
// NOTE: if the flow should go through the real deleteAnalysis (Galaxy layer +
// transaction), mirror analyses.test.ts:303-315 (setupDeletePath + createMockGalaxyLayer/
// createFailingGalaxyLayer). Both shapes are acceptable within discretion.
```

> **Placement/imports note (verify against fixtures when implementing):** the exact mock-setup shape should start from the real `createMockDrizzle()` signature at `fixtures.ts:452` and `createMockDrizzleResult` at `fixtures.ts:375`. Prefer routing the flow through the real `deleteAnalysis` (as `analyses.test.ts` does) to also exercise the transaction wiring — that is the cleaner "one end-to-end place."

### D-06 (optional add — role-agnosticism): extend `supabase.test.ts` `describe('requireRole')`
Proves `admin` is just one role instance by exercising a second role name against the same join.

```typescript
it('is role-agnostic: works for a non-admin role name (D-06)', async () => {
  const drizzle = createMockDrizzle()
  drizzle.setResult([{ userId: 'user-id' }])
  const outcome = resolveRequireRoleFor('editor', drizzle) // reuse existing resolver with role param
  expect(outcome).toEqual({ _tag: '__success__' })
  // assert the WHERE used the given role name
  const whereCall = drizzle.mock.select.mock.results[0]?.value.where.mock.calls[0]?.[0]
  expect(String(whereCall)).toContain('editor')
})
```

### Failure-assertion / query-rejection pattern (for any new error-path test)
```typescript
const exit = await getWorkflowUsage('owner-uuid-1').pipe(
  Effect.provide(drizzle.layer), Effect.runPromiseExit,
)
expectFailure(exit, (error) => {
  expect(error).toBeInstanceOf(GetWorkflowUsageError)
  expect((error as GetWorkflowUsageError)._tag).toBe('GetWorkflowUsageError')
  expect((error as GetWorkflowUsageError).message).toContain('boom')
})
// Source: [VERIFIED: analysisMonitoring.test.ts:669-690, fixtures.ts:598-627]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw `vi.fn()` Drizzle stubs per test | `createMockDrizzle()` chain builder with `setResult`/`enqueueResult` FIFO | Phase 10+ | Multi-query helpers (trend/composite) testable with distinct per-query results |
| Real-SQL integration tests | DB-free mock-based with `Effect.provide(drizzle.layer)` | v1.1 restore | Suite runs anywhere without Postgres; D-01/D-03 lock this in |
| Forks pool | `pool: 'threads'` in all vitest configs | v1.1 (errno -122/EDQUOT) | Must preserve in any config; none added this phase |

**Deprecated/outdated:**
- **Inline admin-role gate per handler:** Phase 15 replaced it with the generic `requireRole(user, role)` helper (supabase.ts:183-203); tests must target `requireRole`, not a per-handler check.
- **MSW for current tests:** TESTING.md notes all current server tests use direct `vi.fn()`/global `fetch` mocking; MSW scaffolding is retained "for future use" only.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The D-07 flow test should route through the real `deleteAnalysis` (Galaxy layer + transaction) rather than calling `finalizeAnalysisMonitoringEffect` directly | Architecture Patterns / Code Examples | Low — both shapes are within discretion; direct-finalize is simpler, deleteAnalysis is more "end-to-end". Pick one and document. |
| A2 | No new dependencies are required, so the Package Legitimacy Audit is N/A | Package Legitimacy Audit | Low — if a planner later adds a dev-dep, the audit gate must run |

*All other claims in this research were verified this session by reading the source-of-truth files (fixtures.ts, setup.ts, analysisMonitoring.test.ts, analyses.test.ts, supabase.test.ts, admin.get.test.ts, schema test, analysisMonitoring.ts, supabase.ts, vitest configs, package.json scripts).*

## Open Questions (RESOLVED)

1. **(RESOLVED → real `deleteAnalysis`)** Does D-07 route through the real `deleteAnalysis` or call `finalizeAnalysisMonitoringEffect` directly? — **Resolution:** route through the real `deleteAnalysis` with a `createMockGalaxyLayer` (16-01 Task 1 / PLAN.md), proving the full create → Galaxy delete → finalize → query-survive flow per D-07's "integrated end-to-end" wording.
   - What we know: both are DB-free and valid. `deleteAnalysis` exercises the Galaxy-delete ordering + transaction (analyses.test.ts:303-315); direct-finalize is a smaller, more focused step 2.
   - What's unclear: planner preference for "one end-to-end place" fidelity vs. test isolation.
   - Recommendation: route through the real `deleteAnalysis` with a `createMockGalaxyLayer` to prove the full flow (create → Galaxy delete → finalize → query survive). This best matches D-07's "integrated end-to-end" wording.

2. **(RESOLVED → add)** Add D-06 role-agnosticism or not? — **Resolution:** add one small sub-test proving `requireRole` accepts a second, non-admin role name (16-01 Task 2).
   - What we know: the three D-06 branches already exist; only a second (non-admin) role name is untested.
   - What's unclear: whether the contract requires proving `admin` is just one instance.
   - Recommendation: add one small sub-test (cheap, directly validates the D-06 wording). Optional but recommended.

3. **(RESOLVED → skip)** Add D-04 (trend `'day'`-default assertion) or not? — **Resolution:** skip — the JS bucketing + result-shape assertions (the D-03 floor) already cover the behavior; discretion documented in 16-02 Task 1.
   - What we know: `getTrend(ownerId, granularity = 'day')` defaults to `'day'` [VERIFIED: analysisMonitoring.ts:664-666]; every existing `getTrend('owner-uuid-1')` test implicitly exercises day buckets.
   - What's unclear: whether the default should be pinned explicitly and whether "query contract params" means asserting the second arg flows to `utcBucket`.
   - Recommendation: **skip** — the JS bucketing + result-shape assertions (the D-03 floor) already cover the behavior; an explicit default-param test is marginal. `TREND_INTERVALS` allowlist is already asserted (analysisMonitoring.test.ts:733-737).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js (>=20) | All gates | ✓ | v24.12.0 | — |
| pnpm (10.27.0) | All gates | ✓ | 10.27.0 | — |
| Vitest (threads pool) | `pnpm test` | ✓ | ^4.1.0 (catalog:testing) | — |
| Effect / Drizzle / evlog | Test code | ✓ | pinned catalogs | — |
| `pnpm lint` (eslint + @antfu) | TEST-05 | ✓ | ^9.39.1 / ^6.7.1 | — |
| `pnpm typecheck` (vue-tsc) | TEST-05 | ✓ | vue-tsc per catalog | — |

No external services (no Postgres, no Supabase, no Galaxy) are required — the suite is DB-free by locked decision. **Missing dependencies with no fallback:** none.

**TEST-05 verification procedure (how to evidence):** run each root gate from the monorepo root and capture passing output:
```bash
pnpm lint        # expect: all packages, no errors
pnpm typecheck   # expect: all packages, no errors
pnpm test        # expect: all packages' suites pass (nuxt-galaxy runs client + server configs)
```
Capture the terminal output (or a summary line per package) into the phase dir as an evidence note (e.g. `.planning/phases/16-testing-quality-gates/16-gates-evidence.txt`) per the agent's-discretion note that TEST-05 verification "is captured as an evidence note." Exit code 0 for all three is the gate criterion.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` — this section applies. Note: this phase *is itself* the validation phase (its output is the milestone's test coverage), so the "phase requirements → tests" map below is the phase's own deliverable list.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.0 (`catalog:testing`) |
| Config file | `packages/nuxt-galaxy/vitest.config.server.ts` (server suite: `environment:'node'`, `include:['test/server/**/*.test.ts']`, `setupFiles: ./test/server/setup.ts`, `pool:'threads'`) |
| Quick run command | `cd packages/nuxt-galaxy && vitest run --config vitest.config.server.ts test/server/utils/grizzle/survival-flow.test.ts` |
| Full suite command | `pnpm test` (root) — runs every package test script |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | Aggregation SQL (per-workflow, trend, outcome counts) | unit | `vitest run --config vitest.config.server.ts test/server/utils/grizzle/analysisMonitoring.test.ts` | ✅ (existing) |
| TEST-02 | Delete finalization + survival | unit | `…analysisMonitoring.test.ts` + `…utils/grizzle/analyses.test.ts` (existing) + **NEW `survival-flow.test.ts`** | ⚠️ D-07 file ❌ / rest ✅ |
| TEST-03 | RLS/self-scoping | unit | `…analysisMonitoring.test.ts` + `…db/schema/galaxy/analysisMonitoring.test.ts` | ✅ (existing) |
| TEST-04 | Admin gate rejects non-admin | unit | `…utils/grizzle/supabase.test.ts` + `…api/db/analyses/monitoring/admin.get.test.ts` | ✅ (existing) |
| TEST-05 | Root lint/typecheck/test green | smoke (gates) | root `pnpm lint` / `pnpm typecheck` / `pnpm test` | N/A (gate run) |

### Sampling Rate
- **Per task commit:** quick-run the touched suite (e.g. `vitest run --config vitest.config.server.ts test/server/utils/grizzle/survival-flow.test.ts`).
- **Per wave merge:** `pnpm lint && pnpm typecheck` + the package `pnpm --filter ./packages/nuxt-galaxy test`.
- **Phase gate:** full root `pnpm lint && pnpm typecheck && pnpm test` green before `/gsd-verify-work`.

### Wave 0 Gaps
- [x] `test/server/fixtures.ts` + `test/server/setup.ts` — shared mock factories + global mocks (already exist)
- [ ] `test/server/utils/grizzle/survival-flow.test.ts` — NEW, the only missing test file (D-07)
- [ ] optionally `supabase.test.ts` `describe('requireRole')` role-agnostic sub-test (D-06)
- Framework install not needed (Vitest already present).

## Security Domain

> `security_enforcement` not explicitly disabled → treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes (TEST-04) | `requireRole(user, role)` Drizzle `userRoles ⋈ roles` join → `ForbiddenError` (403); validated at helper + handler layers |
| V5 Input Validation | partial | Granularity is allowlisted via `TREND_INTERVALS` (never caller-string-interpolated) — asserted by test at analysisMonitoring.test.ts:733-737 |
| V6 Cryptography | no | Session identity from server-side Supabase only, no crypto in phase |
| V2/V3 Auth/Session | no | Identity derived from server-side Supabase session (API-03), tested in Phase 15 |
| V8 Communication | no | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR: one user reading another's stats | Information Disclosure | Self helpers always emit `WHERE owner_id` server-side (asserted per-dimension, TEST-03); RLS owner SELECT policy (schema test) |
| Privilege escalation via forged role | Elevation | `requireRole` does a real DB `userRoles ⋈ roles` join; empty join → `ForbiddenError` (TEST-04/D-06 branch 2) |
| Granularity/query-param injection | Tampering | Allowlist `TREND_INTERVALS`; granularity never interpolated into SQL from caller input |
| Residual data after delete (survival by design) | — | delete-time finalize `pending → cancelled` guarded by `outcome='pending'`; real terminal outcomes never overwritten (TEST-02/D-08) |

## Sources

### Primary (HIGH confidence — source files Read this session)
- `packages/nuxt-galaxy/test/server/fixtures.ts` — `createMockDrizzle` (L375-476), `expectFailure`/`expectSuccess` (L598-627), reject chains (L413-441), supabase mocks.
- `packages/nuxt-galaxy/test/server/setup.ts` — `createMockRequestLogger` + module mocks.
- `packages/nuxt-galaxy/test/server/utils/grizzle/analysisMonitoring.test.ts` — full query-layer suite (TEST-01/03).
- `packages/nuxt-galaxy/test/server/utils/grizzle/analyses.test.ts` — `describe('deleteAnalysis')` L294-527 (D-08 finalize/pending-guard).
- `packages/nuxt-galaxy/test/server/utils/grizzle/supabase.test.ts` — `describe('requireRole')` L199-243 (D-06 three branches).
- `packages/nuxt-galaxy/test/server/api/db/analyses/monitoring/admin.get.test.ts` — handler gate tests (D-05).
- `packages/nuxt-galaxy/test/server/db/schema/galaxy/analysisMonitoring.test.ts` — RLS policy + migration/survival-column tests (D-01).
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts` — `getTrend(ownerId, granularity='day')` (L664-666), `TREND_INTERVALS` (L471-475), `finalizeAnalysisMonitoringEffect` (L254-278), `insertAnalysisMonitoringEffect` (L160-190), composite (L693-736).
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts` — `requireRole` (L183-203), error types (L51-61).
- `.planning/codebase/TESTING.md`, `.planning/config.json` (nyquist true), vitest configs, root + nuxt-galaxy package.json scripts.

### Secondary (MEDIUM confidence)
- `.planning/LOGGING-SPEC.md` — evlog handler/`useLogger(event)` conventions (for the 500-gate logging assertion).
- `packages/nuxt-galaxy/AGENTS.md` — module conventions.

### Tertiary (LOW confidence)
- None — this phase is fully grounded in in-repo source-of-truth files read this session.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Vitest/Effect/fixtures already installed and pinned; verified against configs and package.json.
- Architecture: HIGH — already-covered map and patterns verified line-by-line against the actual suites.
- Pitfalls: HIGH — anchored to concrete line ranges in real tests.
- D-04/D-06/D-07 placement: MEDIUM — open questions flagged; the three optional items are discretionary.

**Research date:** 2026-08-11
**Valid until:** 2026-09-10 (stable; monorepo test conventions change slowly). Re-verify the "already covered" map before implementing anything marked optional.
