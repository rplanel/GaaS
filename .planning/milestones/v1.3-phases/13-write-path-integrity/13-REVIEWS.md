---
phase: 13
reviewers: [opencode-big]
reviewed_at: 2026-08-10T17:02:00Z
plans_reviewed: [13-PLAN-01.md, 13-PLAN-02.md]
---

# Cross-AI Plan Review — Phase 13

> Single reviewer this run: `opencode-big` (OpenCode adapter, model `litellm/big`). Because the executing
> context is itself OpenCode, this is an independent review from a **different model**, not a different tool.
> Consensus below reflects one source-grounded reviewer; cross-model agreement is not yet available.

## OpenCode Review (opencode-big)

I'll review both plans against the actual source code. Let me start by reading the key files referenced in the plans.
# Cross-AI Plan Review — Phase 13: Write Path Integrity

## Summary

Both plans are soundly anchored to the existing codebase: they use the Phase 12 snapshot columns already present on `analysis_monitoring`, eliminate the duplicate monitoring-insert path, and correctly rely on the `outcome = 'pending'` guard as the sole concurrency gate between delete-finalize and the sync task. The main implementation risk is not the design but the **Effect/transaction interop**: the helpers return Effects, yet the plans keep the existing `useDrizzle.transaction(async (tx) => …)` async-callback style. The implementation must explicitly run the helper Effect inside that callback and ensure the helper actually uses the passed `tx` client rather than yielding `Drizzle`. If that detail is missed, the atomicity claims in D-04 and D-07 break.

## Strengths

- **Correctly builds on Phase 12 schema**: `workflow_name`, `galaxy_workflow_id`, and `workflow_version` are already nullable columns (`packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analysisMonitoring.ts:42-44`), so no migration is needed.
- **Preserves the FK semantics**: the schema has `analysisId: integer('analysis_id').references(() => analyses.id, { onDelete: 'set null' })` (`analysisMonitoring.ts:29`), so finalizing by `analysisId` *before* the `analyses` DELETE is the right ordering.
- **Mirrors the sync task's pending guard**: `updateAnalysisMonitoringOutcome` in `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts:113-115` uses `.eq('outcome', 'pending')`; the finalize helper plans to do the equivalent `eq(analysisMonitoring.outcome, 'pending')`, satisfying D-09.
- **Single canonical insert helper**: removing the inline `.insert(analysisMonitoring)` in `insertAnalysis` (`analyses.ts:126-137`) and delegating to `insertAnalysisMonitoringEffect` removes the duplicate write path.
- **Owner-scoped security preserved**: both finalize and delete keep `ownerId` in the WHERE, and RLS policies already restrict update/insert on `analysis_monitoring` to `owner_id = auth.uid()` (`analysisMonitoring.ts:70-75`).
- **Galaxy delete stays outside the DB transaction**: keeping `bt.deleteHistoryEffect` before the transaction matches the current ordering in `analyses.ts:94-101` and satisfies D-07.

## Concerns

- **MEDIUM — Effect/transaction interop is unspecified**: The helpers return `Effect.Effect<…>`, but `insertAnalysis` and `deleteAnalysis` are currently written as `Effect.tryPromise` wrappers around `useDrizzle.transaction(async (tx) => { … })`. The plan says "invoke it so the tx is used" but does not show *how* to run the helper Effect inside an async callback. The implementation must either (a) call `await helperEffect.pipe(Effect.runPromise)` and ensure the helper uses the `tx` argument directly (no `yield* Drizzle`), or (b) restructure to a fully Effect-based transaction. Without this, the helper could acquire a separate Drizzle connection and atomicity is lost.
- **MEDIUM — Plan 2 example contradicts the helper approach**: The research/code example in Plan 2 shows inline `tx.update(analysisMonitoring).set({...})` rather than calling `finalizeAnalysisMonitoringEffect(..., tx)`. The task text says to call the helper. The implementer should not inline the SQL; otherwise DRY and the single-guard abstraction are weakened.
- **LOW — `WorkflowSnapshot` is mutable-sounding**: The type name is fine, but because these fields are frozen at write (D-10), consider naming the runtime argument `workflowSnapshot` (already planned) and documenting immutability.
- **LOW — finalize helper return semantics**: The plan says "return the updated row count via a null-tolerant read". Drizzle's `.returning()` returns the updated rows, not a count. The helper should return the row or `undefined` when no row matched (0-row no-op). This is minor but the tests should assert the no-op case, not a numeric count.
- **LOW — no observability logging**: The delete-finalize path currently has no evlog emission. The sync path logs `'monitoring outcome updated'` (`sync/analysis.ts:126`). Consider a single log line in `deleteAnalysis` after finalize for symmetry, though this is not strictly required.

## Suggestions

- Add an explicit implementation note to both plans: "When `tx` is provided, the helper must not `yield* Drizzle`; it must use `tx` directly. Inside `insertAnalysis`/`deleteAnalysis`, run the helper with `await helper(..., tx).pipe(Effect.runPromise)`."
- Update Plan 2's example code to show `await finalizeAnalysisMonitoringEffect(analysisId, ownerId, tx).pipe(Effect.runPromise)` followed by `tx.delete(analyses)…`.
- In `analyses.test.ts`, add an assertion that the finalize `update` mock call is ordered *before* the `delete` mock call when both are executed inside the same transaction.
- Add a test where the mock `tx` client is a distinct object from the root mock and assert the helper's insert/update is invoked on that `tx` object, not on the root `Drizzle` service.
- Consider renaming `finalizeAnalysisMonitoringEffect` to `cancelPendingAnalysisMonitoringEffect` to make the pending→cancelled semantics self-documenting.

## Risk Assessment

**MEDIUM**

The design is correct and the requirements (WRIT-01, WRIT-02) are well-covered. The risk is entirely in the mechanical implementation of running Effect helpers inside existing async Drizzle transactions. If the implementer accidentally lets the helper yield `Drizzle` or runs it without propagating `tx`, the atomicity guarantees in D-04 and D-07 fail. The proposed tests will catch this if they assert on the `tx` client, but the plans should make the pattern explicit before execution.

---

## Consensus Summary

> Note: only one reviewer (source-grounded, weighted at full weight) contributed this run; there is no
> cross-reviewer agreement to synthesize yet. The single voice is summarized for the planner.

### Agreed Strengths
- Design builds correctly on the Phase 12 nullable snapshot columns — no migration required.
- Pending-guard finalization mirrors the sync task's guard, keeping the sync task the sole terminal-state writer (WRIT-02).
- Removing the inline monitoring insert and delegating to `insertAnalysisMonitoringEffect` eliminates the duplicate write path (WRIT-01).
- Owner-scoped WHERE + existing RLS preserve security; Galaxy delete stays outside the DB transaction.

### Agreed Concerns (highest priority)
1. **MEDIUM — Effect/transaction interop**: helpers return Effects but the plans keep async `useDrizzle.transaction(...)` callbacks; must run the helper with the `tx` client (no `yield* Drizzle`) or atomicity (D-04/D-07) breaks.
2. **MEDIUM — Plan 2 example vs helper**: example shows inline `tx.update` instead of the helper; implementer must call `finalizeAnalysisMonitoringEffect(...)` for DRY and the single-guard abstraction.
3. **LOW — finalize return semantics**: `.returning()` returns rows, not a count; tests should assert the no-op case rather than a numeric count.

### Divergent Views
- None — only one reviewer this run.

---

To incorporate this feedback into planning:

  /gsd-plan-phase 13 --reviews
