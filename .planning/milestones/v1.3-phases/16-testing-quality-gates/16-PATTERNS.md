# Phase 16: Testing & Quality Gates - Pattern Map

**Mapped:** 2026-08-11
**Files analyzed:** 5 classified (1 to create, 4 to verify-only/modify-optional)
**Analogs found:** 4 / 5 (1 artifact with no analog)

## Orientation

This phase is almost entirely **verification** — the research's "Verified Already-Covered Map"
(RESEARCH.md §"Verified Already-Covered Map", lines 57-68) proves TEST-01/02/03/04 are already
landed by suites written in Phases 13-15. The **only genuinely new test file** is
`test/server/utils/grizzle/survival-flow.test.ts` (D-07 integrated create→delete→survive flow).
The other classifications are **verify-only** or **optional one-line additions**. Do not re-create
coverage that exists. All excerpts below are the concrete patterns to copy.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `test/server/utils/grizzle/survival-flow.test.ts` | test (Effect helper integration) | multi-step ordered flow (write → finalize → query) | `test/server/utils/grizzle/analyses.test.ts` `describe('deleteAnalysis')` (L294-527) + `analysisMonitoring.test.ts` insert/query asserts | role-match (composes two analogs) |
| `test/server/utils/grizzle/supabase.test.ts` (modify) | test (helper assertion) | request-response / query-rejection | itself — existing `describe('requireRole')` L199-243 | exact (extend self) |
| `test/server/utils/grizzle/analysisMonitoring.test.ts` (verify-only) | test (query-layer assertions) | CRUD (aggregation) | — | already covered |
| `test/server/utils/grizzle/analyses.test.ts` (verify-only) | test (write-path assertions) | CRUD (delete/finalize tx) | — | already covered |
| `test/server/api/db/analyses/monitoring/admin.get.test.ts` (verify-only) | test (handler gate) | request-response | — | already covered |
| `.planning/phases/16-testing-quality-gates/16-gates-evidence.txt` | evidence note (TEST-05) | N/A | none | no analog |

---

## Pattern Assignments

### `test/server/utils/grizzle/survival-flow.test.ts` (NEW — D-07 integrated create → delete → survive)

**Role:** helper-level Effect integration test. **Data flow:** ordered multi-step (insert → finalize/delete → query).

**Placement rationale (locked by research):** one new file in the same directory as
`analysisMonitoring.test.ts` / `analyses.test.ts` / `supabase.test.ts` (`test/server/utils/grizzle/`).
Do **not** expand `admin.get.test.ts` (handler layer) for D-07 — it is a helper-level concern.
Do **not** duplicate D-08 pending-guard (already in `analyses.test.ts` L378-407) inside this file.

**Analog 1 — imports block** (copy from `analysisMonitoring.test.ts` L1-24, same relative depth)
```typescript
import { and, eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { analysisMonitoring } from '../../../../src/runtime/server/db/schema/galaxy/analysisMonitoring'
import {
  finalizeAnalysisMonitoringEffect,
  getWorkflowUsage,
  insertAnalysisMonitoringEffect,
  GetWorkflowUsageError,
} from '../../../../src/runtime/server/utils/grizzle/analysisMonitoring'
import { createMockDrizzle, createMockDrizzleResult } from '../../fixtures'
// (creates), use analyses.ts's deleteAnalysis only if routing the flow through the real
// deleteAnalysis: import { deleteAnalysis } from '../../../../src/runtime/server/utils/grizzle/analyses'
```

**Mock builder passed by the whole suite** (copy verbatim from `fixtures.ts:452-476`):
```typescript
const drizzle = createMockDrizzle()        // { mock, setResult, enqueueResult, layer }
drizzle.setResult([{ id: 1 }])             // current result (single-return path)
drizzle.enqueueResult([...])               // FIFO queue — REQUIRED for multi-select helpers
// Provide as: Effect.provide(drizzle.layer)
// `drizzle.mock` is the chainable builder; inspect built query via:
//   drizzle.mock.select.mock.results[0]?.value.where.mock.calls[0]?.[0]
```

**Step 1 — CREATE (snapshot insert):** assert built `.values()` contains frozen workflow provenance.
Door to the contract: `insertAnalysisMonitoringEffect(analysisId, ownerId, workflowId, name, galaxyInvocationId, workflowSnapshot?, tx?)`
(`analysisMonitoring.ts:160-190`; `.values()` sets `workflowName/galaxyWorkflowId/workflowVersion` from the snapshot,
falls back to `null` = the **unknown** bucket D-09). Copy assertion shape from `analysisMonitoring.test.ts:26-53,76-...`:
```typescript
drizzle.setResult([{ id: 1 }]) // insert .returning({ insertedId }) -> takeUniqueOrThrow
await insertAnalysisMonitoringEffect(
  1, 'owner-uuid-1', 2, 'Test Analysis', 'galaxy-invocation-1',
  { workflowName: 'Pancake Wrapper', galaxyWorkflowId: 'galaxy-wf-9', workflowVersion: '2.0' },
).pipe(Effect.provide(drizzle.layer), Effect.runPromise)
const snapshotValues = drizzle.mock.insert.mock.results[0]?.value.values.mock.calls[0]?.[0]
expect(snapshotValues).toMatchObject({
  workflowName: 'Pancake Wrapper', galaxyWorkflowId: 'galaxy-wf-9', workflowVersion: '2.0',
})
```

**Step 2 — DELETE / finalize (pending-guard):** two acceptable shapes (research Assumption A1).
- **Shape A (recommended, most end-to-end):** route through real `deleteAnalysis` with a Galaxy layer
  and a transaction. Copy the entire setup from `analyses.test.ts`:
  - `setupDeletePath(drizzle, {...})` — `analyses.test.ts:303-315` (select → join row, update → `[{updatedId}]`, delete → `[{id}]`)
  - Galaxy layer: `createMockGalaxyLayer(mockGalaxyHistory)` — `fixtures.ts:287-294`, `mockGalaxyHistory` `fixtures.ts:19-68`
  - distinct-tx override (finalize must run on the **tx client**, not root mock): `analyses.test.ts:503-527`
  - pending-guard `where` assertion: `analyses.test.ts:378-396`
- **Shape B (simpler, focused):** call `finalizeAnalysisMonitoringEffect(analysisId, ownerId, tx)` directly with
  `tx = drizzle.mock as never`. Source contract `analysisMonitoring.ts:254-278`. Pending-guard `where`:
```typescript
const whereCall = drizzle.mock.update.mock.results[0]?.value.where.mock.calls[0]?.[0]
expect(whereCall).toEqual(and(
  eq(analysisMonitoring.analysisId, 1),
  eq(analysisMonitoring.ownerId, 'owner-uuid-1'),
  eq(analysisMonitoring.outcome, 'pending'),
))
// finalize returns row | undefined, NEVER a numeric count (0-row no-op => undefined):
//   analyses.test.ts:398-407
```

**Step 3 — QUERY (survive):** surface the snapshotted name, NOT the `unknown` bucket. The contract to assert:
`getWorkflowUsage(ownerId)` returns `AnalysisMonitoringWorkflowUsage[]` where a resolved `workflowName`
keys a named entry whose `workflowId` is the snapshot's integer, and the orphan/`unknown` bucket appears
ONLY when `name === null` (`analysisMonitoring.ts:389-434` `shapeWorkflowUsage`). Query needs one select
result (per-workflow group by). Drive the query shape directly:
```typescript
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
// D-02 zero-denominator: no terminal outcomes => successRate 0, not null
//   (source computeSuccessRate analyses.ts monitoring: analysisMonitoring.ts:344-350)
expect(usage[0].successRate).toBe(0)
```
> **NOTE:** If you override `select.mockImplementation`, `setResult`/`enqueueResult` no longer drive that
> select; `createMockDrizzleResult(row)` (`fixtures.ts:375-404`) is the correct terminal thenable for an
> override. Because this flow does *not* call the multi-select composite (`getAnalysisMonitoringStats`),
> a single `setResult`/`mockImplementation` per step is correct — no `enqueueResult` FIFO needed across
> steps unless you route through `deleteAnalysis` (which first runs a select join → use `setupDeletePath`).

**Error/edge patterns to reuse if asserting a reject path** (`fixtures.ts:427-441`, `fixtures.ts:598-614`):
```typescript
drizzle.mock.select.mockImplementation(
  mockDrizzleSelectRejects(['from', 'where', 'groupBy', 'limit'], new Error('boom')),
)
const exit = await getWorkflowUsage('owner-uuid-1').pipe(Effect.provide(drizzle.layer), Effect.runPromiseExit)
expectFailure(exit, (error) => {
  expect(error).toBeInstanceOf(GetWorkflowUsageError)
  expect((error as GetWorkflowUsageError).message).toContain('boom')
})
```

---

### `test/server/utils/grizzle/supabase.test.ts` (MODIFY — optional D-06 role-agnosticism)

**Role:** helper assertion. **Data flow:** request-response / query-rejection. **Status:** `describe('requireRole')`
three branches (grant/deny/500) **already exist** at L199-243 — verified. The only optional addition is
proving `requireRole` is role-agnostic (`admin` is just one role instance) by exercising a second role name.

**Extend the existing resolver to parameterize role** (copy the current `resolveRequireRole`, `supabase.test.ts:200-208`):
```typescript
function resolveRequireRoleFor(drizzle: ReturnType<typeof createMockDrizzle>, role: string) {
  return Either.match(
    Effect.runSync(Effect.either(requireRole({ id: 'user-id' }, role as any).pipe(Effect.provide(drizzle.layer)))),
    { onRight: () => ({ _tag: '__success__' }), onLeft: error => error },
  )
}

it('is role-agnostic: works for a non-admin role name (D-06)', async () => {
  const drizzle = createMockDrizzle()
  drizzle.setResult([{ userId: 'user-id' }])
  const outcome = resolveRequireRoleFor(drizzle, 'editor')
  expect(outcome).toEqual({ _tag: '__success__' })
  // the WHERE used the given role name — source requireRole join (supabase.ts:183-203)
  const whereCall = drizzle.mock.select.mock.results[0]?.value.where.mock.calls[0]?.[0]
  expect(String(whereCall)).toContain('editor')
})
```
Requires importing `Either` (already imported, `supabase.test.ts:2`).

---

## Already-Covered Map (VERIFY-ONLY — do not re-implement)

| Decision | Where it lives (verified line ranges) | Phase 16 action |
|----------|----------------------------------------|-----------------|
| D-01 mock-based RLS proof (self WHERE) | `analysisMonitoring.test.ts` L325-326 (counts), ~L579 (per-workflow), ~L826-829 (trend), L981-988 (composite) | verify only |
| D-01 RLS policies (owner `= auth.uid()`, admin `is_admin()`) | `db/schema/galaxy/analysisMonitoring.test.ts` L21-52 | verify only |
| D-02 admin emits NO owner filter (incl. composite) | `analysisMonitoring.test.ts` L544, L637, L842-846, L1031-1035 | verify only |
| D-03 mock-based aggregation SQL fidelity | `analysisMonitoring.test.ts` counts L307, per-workflow L562, trend L739, composite L942/L1007 | verify only |
| D-05 gate at both layers | helper `supabase.test.ts` L199-243; handler `admin.get.test.ts` L121-182 | verify only |
| D-06 three branches | `supabase.test.ts` L210-242 | verify only (only role-agnosticism optional, above) |
| D-08 pending-guard finalize | `analyses.test.ts` L378-407, L426-478 | verify only — **do not duplicate in survival-flow.test.ts** |

---

## Shared Patterns

### Mock Drizzle builder (applies to every Phase 16 test)
**Source:** `fixtures.ts:375-476` — `createMockDrizzle()`, `setResult`, `enqueueResult`, `createMockDrizzleResult`
```typescript
const drizzle = createMockDrizzle()
drizzle.setResult([{ total: 7, success: 3, error: 2, cancelled: 1, pending: 1 }])
const result = await getAnalysisMonitoringCounts('owner-uuid-1')
  .pipe(Effect.provide(drizzle.layer), Effect.runPromise)
// WHERE-shape assertion — the self-scoping proof (D-01):
const whereCall = drizzle.mock.select.mock.results[0]?.value.where.mock.calls[0]?.[0]
expect(whereCall).toEqual(eq(analysisMonitoring.ownerId, 'owner-uuid-1'))
```
**FIFO rule (composite/trend only):** 4 select pops for `getAnalysisMonitoringStats`, 2 for `getTrend` —
use `enqueueResult([...])` in call order, never `setResult` (Pitfall 4, RESEARCH.md L255-259).

### Effect failure assertion (applies to any error-path new test)
**Source:** `fixtures.ts:598-627` (`expectFailure`/`expectSuccess`) + `mockDrizzle*Rejects` `fixtures.ts:427-441`
- Mock a rejected query chain with `mockDrizzleSelectRejects([...methods], new Error('boom'))` — routes to the
  typed `Data.TaggedError` **Fail** (never `Die`; Pitfall 3).
- Assert via `Effect.runPromiseExit` + `expectFailure(exit, (error) => { expect(error).toBeInstanceOf(Err); expect((error as Err).message).toContain('boom') })`.

### Drizzle query rejection chains
**Sources:** `mockDrizzleSelectRejects` `fixtures.ts:427-429`, `mockDrizzleUpdateRejects` L435, etc.
```typescript
drizzle.mock.update.mockImplementation(
  mockDrizzleUpdateRejects(['set', 'where', 'returning'], new Error('boom')),
)
```

### Evlog / Nuxt import mocks (only if a new handler-logging assertion is added)
**Source:** `setup.ts:3-63` — `createMockRequestLogger()` + global `vi.mock('evlog'|'#imports'|'#supabase/server')`.
Handler rejections assert `rejects.toMatchObject({ statusCode, statusMessage })` (Pitfall 2) — see `admin.get.test.ts:127-130`.
Never assert/log secrets.

### Server vitest config (all new tests must live under `test/server/`)
**Source:** `packages/nuxt-galaxy/vitest.config.server.ts` — `environment:'node'`, `include:['test/server/**/*.test.ts']`,
`setupFiles: ./test/server/setup.ts`, `pool:'threads'` (threads mandated; do not use forks — RESEARCH.md L214-215).
Quick run: `vitest run --config vitest.config.server.ts test/server/utils/grizzle/survival-flow.test.ts`.
Root `pnpm test` runs client + server configs.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.planning/phases/16-testing-quality-gates/16-gates-evidence.txt` | evidence note (TEST-05) | N/A | Not a code file; capture `pnpm lint` / `pnpm typecheck` / `pnpm test` (exit 0) output verbatim as the milestone gate evidence per RESEARCH.md L414-420. |

For this file use:
```bash
pnpm lint && pnpm typecheck && pnpm test
```
and write the captured output into `16-gates-evidence.txt` (Write tool, not heredoc). Exit code 0 for all three is the criterion.

---

## Metadata

**Analog search scope:** `packages/nuxt-galaxy/test/server/` (fixtures, setup, utils/grizzle, api/db/analyses/monitoring, db/schema/galaxy) + `src/runtime/server/utils/grizzle/` sources.
**Files scanned:** 9 (fixtures.ts, setup.ts, analysisMonitoring.test.ts, supabase.test.ts, analyses.test.ts, admin.get.test.ts, schema test, analysisMonitoring.ts, supabase.ts) + analyses.ts.
**Pattern extraction date:** 2026-08-11
