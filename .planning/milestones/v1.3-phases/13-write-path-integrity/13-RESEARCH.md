# Phase 13: Write Path Integrity - Research

**Researched:** 2026-08-10
**Domain:** Internal DB write path (Drizzle + Effect on `analysis_monitoring`)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Snapshot at Creation (WRIT-01)
- **D-01:** The write path snapshots **all three** columns — `workflow_name`, `galaxy_workflow_id`, and `workflow_version` — at creation, not just the two named in WRIT-01. This keeps the milestone contract consistent with Phase 12 D-01 (version is first-class, so same-name/different-version workflows stay distinguishable after deletion). — **Reversibility:** reversible — additive field capture; no published contract change.
- **D-02:** Provenance is resolved **at the caller** (the analysis creation path) from the LOCAL `workflows` table via `workflowId`, consistent with Phase 12 D-06 (no Galaxy API calls for provenance). The three resolved fields (`workflowName`, `galaxyWorkflowId`, `workflowVersion` from `workflows.name`, `workflows.galaxy_id`, `workflows.version_key`) are passed into the monitoring insert as explicit arguments. — **Reversibility:** reversible.
- **D-03:** `insertAnalysisMonitoringEffect` becomes the **single canonical monitoring-insert helper**, extended to accept the three snapshot fields. `insertAnalysis`'s inline monitoring insert is removed and delegates to it, eliminating the duplicate write path. — **Reversibility:** reversible — internal refactor; call sites are in-repo.
- **D-04:** Provenance resolution + monitoring insert run inside the **same DB transaction** as the `analyses` insert (atomic). A row can never be persisted with fabricated provenance — an unresolvable field stays NULL only. — **Reversibility:** reversible.
- **D-05:** Each snapshot field resolves **independently**; any field with no source stays NULL. NULL fields surface as the "unknown" bucket downstream — identical to Phase 12 D-05/D-07 orphan semantics.

#### Delete-Time Finalization (WRIT-02)
- **D-06:** Finalization is added **inside `deleteAnalysis`**: `UPDATE analysis_monitoring SET outcome = 'cancelled', completed_at = now() WHERE analysis_id = ? AND owner_id = ? AND outcome = 'pending'`. — **Reversibility:** reversible — idempotent row update.
- **D-07:** The finalize + `analyses` DELETE run in **one DB transaction** (both commit or roll back together). The transaction runs only **after** the external Galaxy history delete succeeds; if the Galaxy delete fails, the error bubbles as `DeleteAnalysisError` and nothing is finalized. — **Reversibility:** reversible.
- **D-08:** The monitoring row is located for finalization by `analysisId` + `ownerId` (while `analysis_id` is still set — before the `set null` cascade nulls it). — **Reversibility:** reversible.
- **D-09:** The `outcome = 'pending'` predicate is the **sole concurrency gate** between delete-finalize and the sync task. The sync task writes terminal outcomes through the same `pending`-guarded WHERE (`updateAnalysisMonitoringEffect`), so only one writer wins; a real `success`/`error` recorded by sync is never overwritten by deletion.

#### Edge Semantics
- **D-10:** The snapshot is **frozen at write** — captured once, never re-resolved on later rename/re-version of the workflow. This preserves the "stats survive deletion" intent and keeps the monitoring row immutable to later user edits. — **Reversibility:** costly — retroactively changing the interpretation of already-snapshotted stats would misrepresent past data.

### the agent's Discretion
None asked explicitly — all four discussed areas were resolved with a recommendation the user accepted. Resolver/planner retains latitude only on mechanical details: exact transaction boundaries in `deleteAnalysis`, precise SQL shape, and how the create-path caller obtains `workflows.name/galaxy_id/version_key` (join vs lookup) without changing the decisions above.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. No todos were folded or reviewed for this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WRIT-01 | The persist path snapshots `workflow_name` and `galaxy_workflow_id` onto the `analysis_monitoring` row at creation | Extend `insertAnalysisMonitoringEffect` (the canonical insert, `analysisMonitoring.ts` grizzle) with the three snapshot params (D-01); resolve provenance at the create caller from the already-loaded `workflows` row (D-02); delegate `insertAnalysis`'s inline monitoring insert to the helper within its transaction (D-03/D-04). NULL-passthrough per D-05. |
| WRIT-02 | Deleting an analysis finalizes its stranded `analysis_monitoring` row from `pending` to `cancelled`, guarded on `pending` so the sync task remains the sole terminal-state writer | Add the pending-guarded finalize UPDATE inside `deleteAnalysis` before the `analyses` DELETE, in one transaction, after the external Galaxy delete succeeds (D-06/D-07/D-08). Concurrency gate mirrors the `outcome = 'pending'` guard both sync writers already use (D-09). |

## Summary

Phase 13 completes the `analysis_monitoring` durability write contract across two in-repo grizzle Effect helpers. **WRIT-01** makes the create path snapshot workflow provenance at creation: the canonical insert helper `insertAnalysisMonitoringEffect` gains three optional snapshot fields (`workflowName`, `galaxyWorkflowId`, `workflowVersion`), and the create caller resolves them from the local `workflows` row it already holds. **WRIT-02** makes the delete path finalize a stranded `pending` monitoring row to `cancelled` inside `deleteAnalysis`, in the same DB transaction as the `analyses` delete and only after the external Galaxy history delete succeeds. All changes are migration-free and compile against the Phase 12 snapshot columns, which are already present on the schema (`workflow_name`, `galaxy_workflow_id`, `workflow_version` — all nullable).

This is a pure server-side write-path phase with **no new external packages** and no schema changes. Every authority is in-repo (`analysisMonitoring.ts` and `workflows.ts` schemas, `grizzle/analyses.ts` and `grizzle/analysisMonitoring.ts`, the sync terminal-writer). The single most important architectural invariant is **D-09's concurrency gate**: both the delete-finalize and the sync task's terminal-outcome write must guard on `outcome = 'pending'`, so exactly one writer transitions a row out of `pending` and a real `success`/`error` recorded by sync is never overwritten by deletion. Verbatim confirmation: the sync writer (`sync/analysis.ts`) filters `.eq('outcome', 'pending')` [VERIFIED], and it is the only production caller that transitions `analysis_monitoring` to a terminal state.

**Primary recommendation:** Extend `insertAnalysisMonitoringEffect` with three `string | null` snapshot params (writing NULL when absent); resolve them at `analyses.post.ts` (which already holds the `workflows` row from `getWorkflowEffect`) and thread them through `runAnalysis → insertAnalysis → insertAnalysisMonitoringEffect` inside the existing create transaction; and wrap the finalize-UPDATE + analyses-DELETE inside `deleteAnalysis` in `useDrizzle.transaction`, keeping `bt.deleteHistoryEffect` strictly before it.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Provenance snapshot at creation (WRIT-01) | API / Backend (server grizzle) | — | The monitoring insert lives in the server DB layer (`grizzle/analysisMonitoring.ts`); the create caller already resolves the `workflows` row. No client/CDN role. |
| Delete-time finalization (WRIT-02) | API / Backend (server grizzle) | — | Finalize UPDATE + analyses DELETE happen inside `deleteAnalysis`, a server Effect invoked by the `[analysisId].delete.ts` handler. |
| Concurrency gate (pending-guarded terminal write) | Database / Storage (row-level WHERE) | API / Backend | The `outcome = 'pending'` predicate in the SQL WHERE is the sole gate D-09 designates; enforced in SQL, not in application logic. |
| Workflow provenance source | Database / Storage (`workflows` table) | API / Backend | `name`, `galaxy_id`, `version_key` are read from the local `workflows` table; never from a Galaxy API call (D-02). |
| Sync task = sole terminal writer (success criterion 4) | Scheduled task (`sync/analysis.ts`) | — | `updateAnalysisMonitoringOutcome` is the only production path that writes `success`/`error`/`cancelled` on non-delete transitions; delete-finalize handles only the `pending → cancelled` strand. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM | ^1.0.0-beta.16 (catalog:) | DB schema, `insert`/`update`/`delete`/`transaction` | Existing module-wide standard (nuxt-galaxy AGENTS.md). No new writers introduced. |
| Effect-TS | ^3.19.6 (catalog:) | `Effect.gen`, `Data.TaggedError`, DI via `Drizzle` tag | Existing pattern for all grizzle helpers; `runGalaxyEffect` provides layers. |

**Version verification:** Confirmed against `packages/nuxt-galaxy/package.json` + root `AGENTS.md` (catalog versions). No new packages are added in this phase, so no registry verification is required.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `bindtype` (`bt.*`) | workspace:* | `deleteHistoryEffect`, `getWorkflowEffect` terminal/opaque Galaxy ops | Used as-is; the delete path keeps `bt.deleteHistoryEffect` before the DB transaction. |
| `@supabase/supabase-js` | ^2.72.8 (catalog:) | Sync task's `updateAnalysisMonitoringOutcome` client | Only referenced to keep the concurrency gate identical; not changed by this phase. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Passing 3 snapshot params to `insertAnalysisMonitoringEffect` | A single `{ workflowName, galaxyWorkflowId, workflowVersion }` object param | Object param is less error-prone for a growing arg list; either is acceptable. Decision D-02 says "explicit arguments" — recommend a single typed object to keep the signature stable. |
| Resolving provenance at `analyses.post.ts` (row already loaded) | Re-`select` from `workflows` by `workflowId` inside `insertAnalysis` | The caller already holds the full `workflows` row, so re-looking-up is redundant. Recommend passing it down. |

**Installation:** None. This phase adds no packages.

## Package Legitimacy Audit

> **SKIPPED — no external packages are in scope.** This is an internal server-only write-path phase using only packages already declared in `packages/nuxt-galaxy/package.json` (drizzle-orm, effect, blendtype). No `npm install`/registry verification is required. No `[ASSUMED]` package names appear anywhere in this research.

## Architecture Patterns

### System Architecture Diagram

```
CREATE PATH (WRIT-01)
  analyses.post.ts
    ├─ getWorkflowEffect(workflowId) ──► workflows row { name, galaxy_id, version_key }  [source]
    │                                      ▲ resolved from LOCAL table (D-02), never Galaxy API
    └─ runAnalysis(…, workflowId, + workflowName, workflowVersion)
         └─ insertAnalysis(newAnalysis, + snapshot)
              └─ useDrizzle.transaction(                       [D-04 atomic]
                   ├─ INSERT analyses ──► analyses
                   └─ INSERT analysis_monitoring               [delegates to insertAnalysisMonitoringEffect, D-03]
                        values { workflowName, galaxyWorkflowId, workflowVersion }   ← snapshot (D-01)
                        // unresolvable field stays NULL (D-05)

DELETE PATH (WRIT-02)
  [analysisId].delete.ts ──► deleteAnalysis(analysisId, ownerId)
    ├─ getHistoryAnalysis(...) ──► analysis+history join
    ├─ bt.deleteHistoryEffect(history.galaxyId)                [EXTERNAL — must succeed first, D-07]
    │     │  on failure → bubble error → NOTHING finalized
    │     ▼
    └─ useDrizzle.transaction(                                 [D-07 one tx]
         ├─ UPDATE analysis_monitoring                         [D-06 finalize]
         │     SET outcome='cancelled', completed_at=now()
         │     WHERE analysis_id=? AND owner_id=? AND outcome='pending'   ← locate by analysisId while still set (D-08)
         │                                                        ← pending guard = concurrency gate (D-09)
         └─ DELETE FROM analyses WHERE id=? AND owner_id=?
               (FK analysis_id ON DELETE SET NULL nulls it AFTER finalize)
```

### Recommended Project Structure
```
packages/nuxt-galaxy/src/runtime/server/
├── utils/grizzle/
│   ├── analysisMonitoring.ts   # extend insertAnalysisMonitoringEffect (+3 snapshot params); DELETE-finalize helper (recommended) or inline
│   └── analyses.ts             # insertAnalysis delegates monitoring insert; deleteAnalysis wraps finalize+delete in one transaction
└── api/db/analyses.post.ts     # resolve workflowName/workflowVersion from `workflow` row; pass into runAnalysis
```

### Pattern 1: Canonical single-insert helper (D-03)
**What:** One function owns the `analysis_monitoring` insert, so every future caller snapshots consistently.
**When to use:** Any create path that persists a monitoring row.
**Example (verbatim current shape to extend — `grizzle/analysisMonitoring.ts:140-165`):**
```typescript
export function insertAnalysisMonitoringEffect(
  analysisId: number,
  ownerId: string,
  workflowId: number,
  name: string,
  galaxyInvocationId: string,
) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
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
        })
        .returning({ insertedId: analysisMonitoring.id })
        .then(takeUniqueOrThrow),
      catch: error => new InsertAnalysisMonitoringError({ message: `Error inserting analysis monitoring: ${error}` }),
    })
  })
}
```
**Extend with:** `workflowName: string | null`, `galaxyWorkflowId: string | null`, `workflowVersion: string | null` in `.values({ ... })`. Because `insertAnalysis` runs inside `useDrizzle.transaction` and D-04 requires atomicity, the helper must accept an optional transaction client (e.g. `insertAnalysisMonitoringEffect(..., tx?)`, defaulting to the `Drizzle` service) so `insertAnalysis` can call it inside its existing `tx`. **This is the recommended delegation shape.**

### Pattern 2: Pending-guarded terminal write (D-09)
**What:** Any transition out of `pending` filters WHERE `outcome = 'pending'` so only the first writer wins.
**When to use:** Sync terminal updates and the delete-finalize UPDATE.
**Example (verbatim grizzle `analysisMonitoring.ts:194-202` — the guard the delete-finalize mirrors by predicate shape, but located by `analysisId` not `galaxyInvocationId`):**
```typescript
.where(
  and(
    eq(analysisMonitoring.galaxyInvocationId, galaxyInvocationId),
    eq(analysisMonitoring.ownerId, ownerId),
    eq(analysisMonitoring.outcome, 'pending'),
  ),
)
```
**Delete-finalize equivalent (D-06 SQL):**
```typescript
update(analysisMonitoring)
  .set({ outcome: 'cancelled', completedAt: new Date() })
  .where(and(
    eq(analysisMonitoring.analysisId, analysisId),
    eq(analysisMonitoring.ownerId, ownerId),
    eq(analysisMonitoring.outcome, 'pending'),
  ))
```
The sync task's real writer (`sync/analysis.ts:106-115`) confirms the identical guard on `outcome`: `.eq('outcome', 'pending')` [VERIFIED: src/runtime/server/utils/grizzle/sync/analysis.ts:115].

### Anti-Patterns to Avoid
- **Finalizing by `galaxyInvocationId` instead of `analysisId`:** D-08 locates the stranded row by `analysis_id` + `owner_id` (the sync path uses `galaxy_invocation_id`). Do not conflate the two locators.
- **Running the finalize UPDATE after the analyses DELETE:** The FK is `analysis_id ON DELETE SET NULL`, so the delete nulls the join column; the finalize must run first while `analysis_id` is still set (D-08).
- **Wrapping the external `bt.deleteHistoryEffect` in the DB transaction:** D-07 requires the Galaxy delete to precede and gate the transaction. Keep it outside (as the current `flatMap` ordering does).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic analyses + monitoring insert / finalize + delete | Raw `Promise.all` of two queries | `useDrizzle.transaction(async (tx) => …)` | D-04/D-07 require all-or-nothing; the existing `insertAnalysis` already uses `useDrizzle.transaction` [VERIFIED: analyses.ts:117]. |
| Terminal-outcome concurrency control | Fresh comparison logic | The existing `outcome = 'pending'` WHERE predicate | D-09 designates this single gate; adding a second mechanism could let two writers transition a row. |
| Single-row "0 or 1" handling | Ad-hoc `array[0]` | `takeUniqueOrThrow` (grizzle/helper.ts) | Existing module convention; throws on non-unique. |

**Key insight:** This phase is about *consistency of existing primitives* (transactions + pending-guarded WHERE), not new machinery. Reuse `useDrizzle.transaction` and the `takeUniqueOrThrow` / `Data.TaggedError` conventions verbatim.

## Common Pitfalls

### Pitfall 1: Delete-finalize overwriting a real terminal outcome
**What goes wrong:** Deletion changes `success`/`error` to `cancelled`, corrupting stats.
**Why it happens:** The finalize UPDATE has no guard, or the guard is on the wrong predicate.
**How to avoid:** Mandate `AND outcome = 'pending'` in the WHERE (D-06/D-09).
**Warning signs:** A delete-path test where the pre-existing row is `success` and the finalize still fires.

### Pitfall 2: `set null` cascade nulls `analysis_id` before finalization
**What goes wrong:** The finalize UPDATE matches 0 rows because the join column is already NULL.
**Why it happens:** FK `onDelete: 'set null'` on `analysis_id` [VERIFIED: schema analysisMonitoring.ts:29]; ordering the DELETE before the UPDATE.
**How to avoid:** Run the finalize UPDATE before the analyses DELETE inside the same transaction.
**Warning signs:** Delete leaves a `pending` stranded row.

### Pitfall 3: Galaxy-delete failure still finalizing
**What goes wrong:** A failed Galaxy delete still marks the local row `cancelled`, misrepresenting the analysis.
**Why it happens:** Finalize runs unconditionally rather than after a successful `deleteHistoryEffect`.
**How to avoid:** Keep `bt.deleteHistoryEffect` before the DB transaction (existing `flatMap` ordering) and preserve its error propagation.
**Warning signs:** Tests that force `deleteHistoryEffect` to throw and assert the monitoring row is untouched.

### Pitfall 4: Snapshot params not threaded through the call chain
**What goes wrong:** Runtime receives `undefined` provenance and the create always snapshots NULL, or the signature churn breaks call sites.
**Why it happens:** `runAnalysis → insertAnalysis → insertAnalysisMonitoringEffect` all need the three fields; missing one link silently drops them.
**How to avoid:** Resolve at `analyses.post.ts` (row already loaded) and pass a single typed snapshot object through; extend the `insertAnalysisMonitoringEffect` test to assert the values land in `.values()`.
**Warning signs:** The `insertAnalysis` test asserts monitoring values contain the snapshot fields.

## Code Examples

Verified patterns from the in-repo source (authority, not third-party docs):

### Extending the canonical insert (WRIT-01)
```typescript
// Source: grizzle/analysisMonitoring.ts:140-165 (current shape to extend)
// Add a snapshot object param and forward into .values():
export function insertAnalysisMonitoringEffect(
  analysisId: number,
  ownerId: string,
  workflowId: number,
  name: string,
  galaxyInvocationId: string,
  snapshot?: { workflowName: string | null, galaxyWorkflowId: string | null, workflowVersion: string | null },
  // NOTE: pass an optional tx (transactor) here when called inside insertAnalysis's
  // useDrizzle.transaction to satisfy D-04 atomicity.
) { /* ... .values({ ..., ...snapshot }) ... */ }
```

### Atomic both-writes (D-04) — existing insertAnalysis transaction to extend
```typescript
// Source: grizzle/analyses.ts:117-139 (verbatim)
try: () => useDrizzle.transaction(async (tx) => {
  const inserted = await tx
    .insert(analyses)
    .values(analysis)
    .returning({ insertedId: analyses.id })
    .then(takeUniqueOrThrow)
  if (!inserted) {
    throw new Error('Analysis insert returned no row')
  }
  await tx
    .insert(analysisMonitoring)
    .values({
      analysisId: inserted.insertedId,
      ownerId: analysis.ownerId,
      workflowId: analysis.workflowId,
      name: analysis.name,
      outcome: 'pending',
      galaxyInvocationId: analysis.galaxyId,
    })
    .returning({ insertedId: analysisMonitoring.id })
    .then(takeUniqueOrThrow)
  return inserted
}),
```
This inline `.insert(analysisMonitoring)` is what D-03 removes in favor of delegating to `insertAnalysisMonitoringEffect` (passing `tx`).

### Delete-time finalize inside one transaction (WRIT-02)
Use the D-06 predicate shape and D-08 locator, wrapped in `useDrizzle.transaction`, placed after `bt.deleteHistoryEffect` inside the existing `flatMap`:
```typescript
// Current skeleton (grizzle/analyses.ts:91-105):
return yield* getHistoryAnalysis(analysisId, ownerId).pipe(
  Effect.flatMap((historyAnalysis) => {
    if (historyAnalysis) {
      return bt.deleteHistoryEffect(historyAnalysis.histories.galaxyId)
        .pipe(Effect.flatMap(() => Effect.tryPromise({
          try: () => useDrizzle.transaction(async (tx) => {
            await tx.update(analysisMonitoring).set({
              outcome: 'cancelled',
              completedAt: new Date(),
            }).where(and(
              eq(analysisMonitoring.analysisId, analysisId),
              eq(analysisMonitoring.ownerId, ownerId),
              eq(analysisMonitoring.outcome, 'pending'),
            ))
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
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monitoring insert duplicated in `insertAnalysis` + the standalone helper | Single canonical `insertAnalysisMonitoringEffect` (D-03) | This phase | Removes dual write path; creation always snapshots the same way. |
| Strictly two snapshot columns in WRIT-01 | Three columns incl. `workflow_version` (D-01) | This phase | Same-name/different-version workflows stay distinguishable after deletion. |
| Delete left stranded `pending` rows | Delete finalizes `pending → cancelled` (D-06) | This phase | Stats no longer show phantom pending after deletion. |

**Deprecated/outdated:**
- `insertAnalysis`'s inline `.insert(analysisMonitoring)` writes: removed in favor of the canonical helper (internal refactor; in-repo call sites only).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "If the Galaxy delete fails, the error bubbles as `DeleteAnalysisError`" (D-07 wording) | WRIT-02 | The current code `bt.deleteHistoryEffect(...).pipe(Effect.flatMap(...))` propagates whatever error `deleteHistoryEffect` throws (not necessarily `DeleteAnalysisError`). Regardless of the tag, the DB transaction is correctly unreached on failure. Planner should preserve existing error-bubbling and not assert a specific tag unless a mapping already exists. |
| A2 | The planner may choose an object-param signature over three positional args for the snapshot | WRIT-01 | D-02 says "explicit arguments" — an object is a reasonable reading; if the planner interprets it strictly as positional, adjust the helper signature accordingly. In-repo call sites make this fully reversible. |

**All other claims verified.** (In-repo structure/values quoted verbatim in this document.)

## Open Questions (RESOLVED)

1. **Where should the snapshot fields be threaded — `runAnalysis` params or a re-lookup inside `insertAnalysis`?**
   - What we know: `analyses.post.ts` already holds the full `workflows` row (from `getWorkflowEffect`) including `name`, `galaxyId`, `versionKey` [VERIFIED].
   - What's unclear: whether the planner passes `workflow.name`/`workflow.versionKey` into `runAnalysis`/`insertAnalysis` (recommended — no redundant query) or re-selects `workflows` by `workflowId` inside `insertAnalysis`'s transaction.
   - RESOLVED: pass the values down from the caller (matches D-02 "resolved at the caller" and avoids a duplicate lookup). PLAN-01 Task 1 implements caller threading via a `WorkflowSnapshot` param.

2. **How does `insertAnalysisMonitoringEffect` stay atomic inside the transaction despite being a standalone helper?**
   - What we know: it currently reads the `Drizzle` service directly; `insertAnalysis` uses `useDrizzle.transaction(async (tx) => …)`.
   - What's unclear: whether to add an optional `tx` param to the helper (recommended) or restructure.
   - RESOLVED: accept an optional transaction client param, defaulting to the `Drizzle` service; `insertAnalysis` passes `tx`. This preserves D-03 (single helper) and D-04 (atomicity). PLAN-01 Task 1 implements the optional `tx` param.

3. **Does the Galaxy-delete error surface as `DeleteAnalysisError` today?**
   - What we know: `deleteHistoryEffect` failure currently propagates its own error (not wrapped) while still preventing the DB transaction from running.
   - What's unclear: whether the CONTEXT's "bubbles as DeleteAnalysisError" is a hard contract or descriptive.
   - RESOLVED: verify existing error mapping during implementation; do not change behavior beyond preserving "Galaxy fail ⇒ nothing finalized" (D-07). The finalize transaction is unreachable on Galaxy failure regardless of error tag.

## Environment Availability

> Step 2.6 — **SKIPPED (no new external dependencies).** This phase adds no packages, CLIs, services, or runtimes beyond those already present and used by Phase 12. Confirmed at runtime: `node v24.12.0` (≥ v20 required), `pnpm 10.27.0` (matches AGENTS.md 10.27.0). Test runner is Vitest via module config; local Supabase is not required for the pure grizzle/mock unit tests this phase relies on.

## Validation Architecture

> Enabled — `.planning/config.json` has `workflow.nyquist_validation: true`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (module `~4.x`), `@nestjs`-free; runs `vitest run` (default) + `vitest run --config vitest.config.server.ts` |
| Config file | `packages/nuxt-galaxy/vitest.config.ts` (default) + `vitest.config.server.ts` (server-only; `include: ['test/server/**/*.test.ts']`, setup `test/server/setup.ts`) |
| Quick run command | `pnpm --filter nuxt-galaxy test` (from root), or in-package `pnpm test` |
| Full suite command | Root `pnpm test` (all packages) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WRIT-01 | Snapshot fields written to monitoring row at creation (incl. NULL passthrough, D-05) | unit (mock DB) | `pnpm --filter nuxt-galaxy vitest run test/server/utils/grizzle/analysisMonitoring.test.ts test/server/utils/grizzle/analyses.test.ts` | ✅ existing files; extend |
| WRIT-02 | Delete finalizes `pending → cancelled`; guarded so `success`/`error` untouched; atomic with analyses delete; unreached on Galaxy failure | unit (mock DB) | same command above (`analyses.test.ts` deleteAnalysis suite) | ✅ existing files; extend |
| WRIT-02 | API handler still returns delete result / 401 / 500 (regression) | API (handler, `deleteAnalysis` mocked) | `vitest run test/server/api/db/analyses-delete.test.ts` | ✅ existing file |

### Sampling Rate
- **Per task commit:** In-package `pnpm test` (or the two targeted grizzle test files).
- **Per wave merge:** Full `pnpm test` for `nuxt-galaxy`.
- **Phase gate:** Root `pnpm test`, `pnpm typecheck`, `pnpm lint` green before `/gsd-verify-work`.

### Wave 0 Gaps
- [x] `test/server/utils/grizzle/analysisMonitoring.test.ts` — covers insert/update helper behavior (extend `insertAnalysisMonitoringEffect` test to assert snapshot values).
- [x] `test/server/utils/grizzle/analyses.test.ts` — covers `insertAnalysis` (assert snapshot values in monitoring `.values()`) + `deleteAnalysis` (assert finalize UPDATE shape/order/atomicity, Galaxy-failure no-finalize).
- [x] `test/server/utils/grizzle/sync/analysis.test.ts` — existing terminal-writer test already asserts `.eq('outcome','pending')` guard at line 336; reusable as the canonical concurrency-gate reference for the delete-finalize test.
- [x] `test/server/fixtures.ts` — `createMockDrizzle` already stubs `transaction`, `update`, `set`, `where`, `delete`, `returning` so the new delete transaction + update are mockable with no fixture changes.
- The write-path work under WRIT-01/WRIT-02 is covered by the grizzle unit tests named above. (TEST-02's full "stats survive analysis deletion" end-to-end assertion is Phase 16 scope.)

## Security Domain

> Enabled (`.planning/config.json` does not set `security_enforcement: false`).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Existing `getSupabaseUser(event)` server-side session identity; ownerId derived server-side, never from client input (Phase 15 API-03). Unchanged by this phase. |
| V3 Session Management | No | No session state touched by the write path. |
| V4 Access Control | Yes | Both the finalize UPDATE and analyses DELETE are scoped by `ownerId` (D-06/D-08 SQL) AND governed by existing RLS `pgPolicy` on `analysis_monitoring` (`owner_id = auth.uid()`) [VERIFIED: schema analysisMonitoring.ts:55-75]. |
| V5 Input Validation | Yes | `analysisId`/`ownerId` are typed (`number`/`string(uuid)`); snapshot fields are typed `string \| null` and flow into `varchar` columns via Drizzle (DB-enforced length). No raw user string enters an executable position. |
| V6 Cryptography | No | No secrets or cryptographic operations. |

### Known Threat Patterns for {Effect + Drizzle + Supabase RLS}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant delete/finalize (user A finalizes/deletes user B's row) | Elevation of Privilege | `ownerId` in every WHERE + RLS `owner_id = auth.uid()` on UPDATE/INSERT policy. |
| Finalize overwriting a real terminal outcome (data integrity) | Tampering | `outcome = 'pending'` guard (D-09) — only the first writer wins. |
| Partial commit leaving analysis row but no/lost monitoring row | Tampering | Both writes in one `useDrizzle.transaction` (D-04/D-07). |

**No new secrets or attack surface introduced.** This phase modifies two existing server grizzle write helpers.

## Sources

### Primary (HIGH confidence — read verbatim this session)
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analysisMonitoring.ts` — table, enum, snapshot columns, `ON DELETE SET NULL` FK, RLS policies.
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/workflows.ts` + `schema/galaxy/index.ts` — `versionKey`/`name`/`galaxy_id` (`galaxyItem`).
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts` — `insertAnalysisMonitoringEffect` (to extend), `updateAnalysisMonitoringEffect` pending-guard (to mirror).
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts` — `insertAnalysis` (inline monitoring insert to delegate), `deleteAnalysis` (finalize to add).
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` — sync terminal-writer (`outcome = 'pending'` guard) confirming success criterion 4.
- `packages/nuxt-galaxy/src/runtime/server/api/db/analyses.post.ts` — create caller holding the `workflows` row.
- `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[analysisId].delete.ts` — delete handler.
- `packages/nuxt-galaxy/test/server/**` (fixtures, analysisMonitoring/analyses/sync-analysis tests, delete API test) — test infra + patterns.
- `.planning/REQUIREMENTS.md` (WRIT-01/WRIT-02), `.planning/ROADMAP.md` (Phase 13), `13-CONTEXT.md`, `12-CONTEXT.md`.

### Secondary (MEDIUM confidence)
- None — no third-party docs were required; all authoritative content is in-repo.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all libraries pre-existing and confirmed in-repo.
- Architecture: HIGH — transaction + pending-guard patterns read verbatim from current source.
- Pitfalls: HIGH — derived directly from the FK `set null` semantics and D-06 SQL, both verified.
- Assumptions (A1/A2) flagged LOW where they depend on planner interpretation.

**Research date:** 2026-08-10
**Valid until:** 30 days (stable internal codebase; no external version drift).
