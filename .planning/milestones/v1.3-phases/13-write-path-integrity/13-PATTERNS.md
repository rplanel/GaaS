# Phase 13: Write Path Integrity - Pattern Map

**Mapped:** 2026-08-10
**Files analyzed:** 9 new/modified files (all are in-place extensions of existing files)
**Analogs found:** 9 / 9 (7 existing files; 2 new helpers derived from known patterns)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/runtime/server/utils/grizzle/analysisMonitoring.ts` (extend `insertAnalysisMonitoringEffect` +3 snapshot params, optional `tx`) | service | CRUD | Its own `updateAnalysisMonitoringEffect` (lines 171-212) + its current `insertAnalysisMonitoringEffect` (140-165) | exact (self + sibling) |
| `src/runtime/server/utils/grizzle/analysisMonitoring.ts` (new delete-finalize helper, recommended) | service | CRUD | `updateAnalysisMonitoringEffect` pending-guarded update (194-209) | exact (role + data flow + guard) |
| `src/runtime/server/utils/grizzle/analyses.ts` (`insertAnalysis` delegates monitoring insert) | service | CRUD (transaction) | Its own `insertAnalysis` transaction (113-143) | exact (self) |
| `src/runtime/server/utils/grizzle/analyses.ts` (`deleteAnalysis` wraps finalize + delete in one tx) | service | CRUD (transaction) | Its own `deleteAnalysis` flatMap (85-107) + `insertAnalysis` transaction | exact (self) |
| `src/runtime/server/api/db/analyses.post.ts` (resolve provenance from `workflow` row; pass into `runAnalysis`) | controller | request-response | Itself (32, 56-66) + `getWorkflowEffect` (workflows.ts 17-38) for provenance source shape | exact (self) |
| `src/runtime/server/api/db/analyses/[analysisId].delete.ts` (unchanged) | controller | request-response | Itself (11-47) | exact (self) |
| `test/server/utils/grizzle/analysisMonitoring.test.ts` (extend insert snapshot) | test | — | Itself `insertAnalysisMonitoringEffect` suite (17-45) | exact (self) |
| `test/server/utils/grizzle/analyses.test.ts` (extend insertAnalysis snapshot + deleteAnalysis finalize) | test | — | Itself insertAnalysis (68-99) + deleteAnalysis suites (223-319) | exact (self) |
| `test/server/api/db/analyses-delete.test.ts` (regression; unchanged) | test | — | Itself (79-150) | exact (self) |

> **Note:** Every modified file is an in-place extension, so its own current body is both the closest analog AND the code being changed. Cross-cutting analogs (`updateAnalysisMonitoringEffect` pending-guard, `insertAnalysis` transaction, the sync task terminal-writer) above are the authoritative pattern sources for the *new* code introduced.

## Pattern Assignments

### `utils/grizzle/analysisMonitoring.ts` — extend `insertAnalysisMonitoringEffect` (service, CRUD)

**Analog:** Its own `insertAnalysisMonitoringEffect` (current, lines 140-165) + sibling `updateAnalysisMonitoringEffect` (171-212).

**Imports pattern** (lines 1-7):
```typescript
import { and, eq, sql } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { analysisMonitoring } from '../../db/schema/galaxy/analysisMonitoring'
import { Drizzle } from '../drizzle'
import { takeUniqueOrThrow } from './helper'
```

**Error class pattern** (lines 136-138):
```typescript
export class InsertAnalysisMonitoringError extends Data.TaggedError('InsertAnalysisMonitoringError')<{
  readonly message: string
}> {}
```

**Insert helper to extend** (lines 140-165) — add `workflowName: string | null`, `galaxyWorkflowId: string | null`, `workflowVersion: string | null` (spread a `snapshot?` object into `.values()`), plus optional transaction client `tx` so `insertAnalysis` can call it inside its own tx (D-04 atomicity):
```typescript
export function insertAnalysisMonitoringEffect(
  analysisId: number,
  ownerId: string,
  workflowId: number,
  name: string,
  galaxyInvocationId: string,
  // ADD: snapshot?: { workflowName: string | null, galaxyWorkflowId: string | null, workflowVersion: string | null },
  // ADD: tx?: DbClient  // required to run inside insertAnalysis's useDrizzle.transaction
) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle   // OR: use provided tx when present
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .insert(analysisMonitoring)
        .values({
          analysisId,
          ownerId,
          workflowId,
          name,
          outcome: 'pending',
          galaxyInvocationId,
          // ADD: ...snapshot   (D-01/D-05: unresolvable field stays null)
        })
        .returning({ insertedId: analysisMonitoring.id })
        .then(takeUniqueOrThrow),
      catch: error => new InsertAnalysisMonitoringError({ message: `Error inserting analysis monitoring: ${error}` }),
    })
  })
}
```

**Pending-guard + null-tolerant terminal read pattern** — the delete-finalize helper should mirror `updateAnalysisMonitoringEffect`'s WHERE shape AND its null-safe `.then(takeUniqueOrThrow).then(row => row === null ? undefined : row)` (lines 194-208), but locate by `analysisId` (D-08), not `galaxyInvocationId`:
```typescript
// updateAnalysisMonitoringEffect lines 194-208 (guard to mirror; D-09)
.where(
  and(
    eq(analysisMonitoring.galaxyInvocationId, galaxyInvocationId),
    eq(analysisMonitoring.ownerId, ownerId),
    eq(analysisMonitoring.outcome, 'pending'),
  ),
)
.returning({ updatedId: analysisMonitoring.id })
.then(takeUniqueOrThrow)
.then((row) => {
  if (row === null) { return undefined }
  return row
})
```

**Error class for delete-finalize** (copy the `Data.TaggedError` shape, unique symbol):
```typescript
export class FinalizeAnalysisMonitoringError extends Data.TaggedError('FinalizeAnalysisMonitoringError')<{
  readonly message: string
}> {}
```

---

### `utils/grizzle/analyses.ts` — `insertAnalysis` delegates tracking insert; `deleteAnalysis` adds finalize (service, CRUD)

**Analog:** Its own `insertAnalysis` transaction (113-143) and `deleteAnalysis` flatMap (85-107).

**Imports** (lines 1-11): already imports `analysisMonitoring`, `Drizzle`, `takeUniqueOrThrow`. NOTE: D-03 removes the inline `.insert(analysisMonitoring)`; `insertAnalysis` must then forward the snapshot + `tx`:
```typescript
import * as bt from 'blendtype'
import { and, eq } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { analyses } from '../../db/schema/galaxy/analyses'
import { analysisMonitoring } from '../../db/schema/galaxy/analysisMonitoring'
import { Drizzle } from '../drizzle'
import { takeUniqueOrThrow } from './helper'
// ADD: import { insertAnalysisMonitoringEffect } from './analysisMonitoring'
```

**Extension point (D-03/D-04)** — inside the existing `useDrizzle.transaction(async (tx) => ...)` (lines 117-139), replace the inline `await tx.insert(analysisMonitoring).values({...analysisId, ownerId, workflowId, name, outcome:'pending', galaxyInvocationId})` with a call to `insertAnalysisMonitoringEffect(..., snapshot, tx)`. The caller must thread `snapshot` through `insertAnalysis`'s `NewAnalysis`-derived params (or a new optional arg).

**`deleteAnalysis` flatMap — the slot for finalize + delete tx (WRIT-02)** (current lines 85-107):
```typescript
export function deleteAnalysis(analysisId: number, ownerId: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* getHistoryAnalysis(analysisId, ownerId).pipe(
      Effect.flatMap((historyAnalysis) => {
        if (historyAnalysis) {
          // Galaxy delete MUST stay outside/before the DB transaction (D-07)
          return bt.deleteHistoryEffect(historyAnalysis.histories.galaxyId)
            .pipe(Effect.flatMap(() => Effect.tryPromise({
              try: () => useDrizzle.transaction(async (tx) => {   // REPLACE raw tx
                // 1) FINALIZE first (D-08: analysis_id still set before SET NULL rule)
                await tx.update(analysisMonitoring).set({
                  outcome: 'cancelled',
                  completedAt: new Date(),
                }).where(and(
                  eq(analysisMonitoring.analysisId, analysisId),  // locate by analysisId not galaxyInvocationId
                  eq(analysisMonitoring.ownerId, ownerId),
                  eq(analysisMonitoring.outcome, 'pending'),      // D-09 sole concurrency gate
                ))
                // 2) THEN delete analysis
                return tx.delete(analyses)
                  .where(and(eq(analyses.id, analysisId), eq(analyses.ownerId, ownerId)))
                  .returning()
              }),
              catch: error => new DeleteAnalysisError({ message: `Error deleting analysis: ${error}` }),
            })))
        }
        return Effect.fail(new DeleteAnalysisError({ message: `Error deleting analysis: Analysis not found` }))
      }),
    )
  })
}
```

**Error class** (lines 82-84) — reuse as-is; finalize failures bubble as `DeleteAnalysisError`.

**Ordering invariant:** finalize UPDATE runs BEFORE the analyses DELETE inside the same `useDrizzle.transaction` (the `analysis_id ON DELETE SET NULL` FK nulls the join column after DELETE — see schema `analysisMonitoring.ts:29`).

---

### `api/db/analyses.post.ts` — resolve provenance from `workflow` row; pass into `runAnalysis` (controller, request-response)

**Analog:** Itself (the create caller) + `getWorkflowEffect` provenance source.

**Provenance source already in hand** (lines 32-33): `const workflow = yield* getWorkflowEffect(workflowId)` returns the full `workflows` row with `name`, `galaxyId`, `versionKey` (schema `workflows.ts:15-22`; `galaxyItem` = `galaxyId` + `name` at `galaxy/index.ts:14-18`). Resolve `workflowName = workflow.name`, `galaxyWorkflowId = workflow.galaxyId`, `workflowVersion = workflow.versionKey` here (D-02, no Galaxy API) and pass them down:
```typescript
const workflow = yield* getWorkflowEffect(workflowId)   // line 32
// ADD: resolve { workflowName: workflow?.name, galaxyWorkflowId: workflow?.galaxyId, workflowVersion: workflow?.versionKey }
return yield* runAnalysis(   // lines 56-66
  name,
  historyDb.galaxyId,
  workflow.galaxyId,
  historyDb.id,
  workflow.id,
  supabaseUser.id,
  inputs,
  parameters || {},
  datamap,
  // ADD: snapshot arg threaded through runAnalysis -> insertAnalysis -> insertAnalysisMonitoringEffect
)
```

**Layer provisioning pattern** (lines 73-86): keep `Drizzle.Live`, `ServerSupabaseClient.Live`, `ServerSupabaseClaims.Live`, `UrlFetch.Live` merged; `runGalaxyEffect(event, program.pipe(toGalaxyServiceUnavailable, Effect.provide(finalLayer), Effect.provide(useGalaxyLayer())))`. The new snapshot fields do not add layers — they ride the existing `workflow` row.

---

### `api/db/analyses/[analysisId].delete.ts` — unchanged (controller, request-response)

**Analog:** Itself (11-47). `deleteAnalysis(supabaseUser.id)` signature is unchanged, so the handler needs no modification. Reference the error-mapping pattern in case a `FinalizeAnalysisMonitoringError` needs handling (currently any non-`GetSupabaseUserError` → 500):
```typescript
return Either.match(result, {
  onLeft: (error) => {
    if (error._tag === 'GetSupabaseUserError') {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
    const log = useLogger(event)
    log.error('delete analysis handler failed', { cause: Cause.pretty(Cause.fail(error)) })
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  },
  onRight: value => value,
})
```

---

### Tests

#### `test/server/utils/grizzle/analysisMonitoring.test.ts` — extend insert snapshot (test)

**Analog:** Itself `insertAnalysisMonitoringEffect` suite (17-45). Extend the existing insert test to also pass `workflowName`/`galaxyWorkflowId`/`workflowVersion` and assert they land in `.values()`:
```typescript
const drizzle = createMockDrizzle()
drizzle.setResult([{ id: 1 }])
await insertAnalysisMonitoringEffect(1, 'owner-uuid-1', 2, 'Test Analysis', 'galaxy-invocation-1',
  { workflowName: 'Test Workflow', galaxyWorkflowId: 'galaxy-workflow-1', workflowVersion: '1.0' },
).pipe(Effect.provide(drizzle.layer), Effect.runPromise)

const values = drizzle.mock.insert.mock.results[0]?.value.values.mock.calls[0]?.[0]
expect(values).toMatchObject({
  analysisId: 1, ownerId: 'owner-uuid-1', workflowId: 2, name: 'Test Analysis',
  galaxyInvocationId: 'galaxy-invocation-1', outcome: 'pending',
  workflowName: 'Test Workflow', galaxyWorkflowId: 'galaxy-workflow-1', workflowVersion: '1.0',
})
```
`createMockDrizzle()` already stubs `transaction`, `update`, `set`, `where`, `delete`, `returning` (fixtures.ts 447-466), so a new delete-finalize helper test can assert on `drizzle.mock.update` → `set` → `where` (mirror the `updateAnalysisMonitoringEffect` set assertions at lines 80-133).

#### `test/server/utils/grizzle/analyses.test.ts` — extend insertAnalysis snapshot + deleteAnalysis finalize (test)

**Analog:** Itself. For `insertAnalysis` snapshot values, extend the existing "should insert a monitoring row" test (68-99) to assert the three snapshot fields on `drizzle.mock.insert.mock.results[1]?.value.values.mock.calls[0]?.[0]`. For `deleteAnalysis`, extend the delete suite (223-319) to assert the `update`/`set`/`where` finalize shape + `outcome:'pending'` guard, the transaction call, and that a failing Galaxy delete (`createFailingGalaxyLayer`, fixtures 326-331) leaves the monitoring row untouched (D-07). `createMockGalaxyLayer`/`createFailingGalaxyLayer` provide the external-delete layer (fixtures 287-331).

#### `test/server/api/db/analyses-delete.test.ts` — regression (test)

**Analog:** Itself (79-150). No changes expected; it already mocks `deleteAnalysis` (vi.mock) and asserts 200/401/500. Re-run as a regression guard.

---

## Shared Patterns

### Single canonical write helper (D-03)
**Source:** `grizzle/analysisMonitoring.ts:140-165` (`insertAnalysisMonitoringEffect`) + `grizzle/analyses.ts:126-137` (the inline insert it replaces).
**Apply to:** All monitoring inserts must route through the one helper, so every caller snapshots identically. Removes the dual write path.

### `useDrizzle.transaction` for atomic multi-row writes (D-04/D-07)
**Source:** `grizzle/analyses.ts:117-139` (create), to be replicated in `deleteAnalysis` (finalize + delete).
**Apply to:** Any operation persisting more than one row (analyses + monitoring). The helper called inside the tx needs an optional transaction client, since `Drizzle` service reads lose transaction scope.

### `outcome = 'pending'` concurrency gate (D-09)
**Source:** `grizzle/analysisMonitoring.ts:198` + `sync/analysis.ts:115` (`.eq('outcome', 'pending')`).
**Apply to:** Every transition out of `pending` — delete-finalize AND the sync task's terminal writes — so exactly one writer wins and a real `success`/`error` is never overwritten.

### `Data.TaggedError` error types with unique symbols
**Source:** `grizzle/analysisMonitoring.ts:136-138, 167-169` and `grizzle/analyses.ts:82-84, 109-111`.
**Apply to:** Every `Effect.tryPromise({ catch: error => new XError({ message: `...: ${error}` }) })` wrapper. New errors: consider `FinalizeAnalysisMonitoringError`; reuse `DeleteAnalysisError`/`InsertAnalysisError` for the surrounding operations.

### External Galaxy call outside / before the DB transaction (D-07)
**Source:** `grizzle/analyses.ts:94` (`bt.deleteHistoryEffect(history.galaxyId)` before the tx).
**Apply to:** Delete path — Galaxy delete gating the DB transaction; on failure nothing finalizes.

### `takeUniqueOrThrow` single-row handling
**Source:** `grizzle/helper.ts:3-14`; null-tolerant chaining in `grizzle/analysisMonitoring.ts:201-208`.
**Apply to:** All `.returning().then(...)` single-row reads.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| *(none)* | — | — | Every file has a self/existing analog; both new helpers (delete-finalize, tx-aware insert) derive from in-file patterns. |

## Metadata

**Analog search scope:** `packages/nuxt-galaxy/src/runtime/server/{utils/grizzle,api/db,sync/analysis,schema/galaxy}` + `test/server/`
**Files scanned:** 12 (9 primary + 3 supporting: `helper.ts`, `workflows.ts`, `sync/analysis.ts`, `fixtures.ts`, `galaxy/index.ts`)
**Pattern extraction date:** 2026-08-10
