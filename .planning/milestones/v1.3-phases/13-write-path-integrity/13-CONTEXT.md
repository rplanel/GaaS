# Phase 13: Write Path Integrity - Context

**Gathered:** 2026-08-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the write path complete for the `analysis_monitoring` durability contract: every newly-persisted analysis snapshots its workflow provenance at creation, and deleting an analysis finalizes any stranded `pending` monitoring row. This phase is server-only (no UI), touches the analysis create + delete grizzle paths, and compiles against the Phase 12 schema contract.

**In scope:** snapshotting `workflow_name`, `galaxy_workflow_id`, `workflow_version` onto the monitoring row at creation (WRIT-01); finalizing a stranded `pending` row to `cancelled` at delete time (WRIT-02); converging the monitoring-insert write path; migration-free (uses Phase 12 columns only). **Out of scope:** stats query helpers (Phase 14), API endpoints (Phase 15), full test phase (Phase 16).

</domain>

<decisions>
## Implementation Decisions

### Snapshot at Creation (WRIT-01)
- **D-01:** The write path snapshots **all three** columns — `workflow_name`, `galaxy_workflow_id`, and `workflow_version` — at creation, not just the two named in WRIT-01. This keeps the milestone contract consistent with Phase 12 D-01 (version is first-class, so same-name/different-version workflows stay distinguishable after deletion). — **Reversibility:** reversible — additive field capture; no published contract change.
- **D-02:** Provenance is resolved **at the caller** (the analysis creation path) from the LOCAL `workflows` table via `workflowId`, consistent with Phase 12 D-06 (no Galaxy API calls for provenance). The three resolved fields (`workflowName`, `galaxyWorkflowId`, `workflowVersion` from `workflows.name`, `workflows.galaxy_id`, `workflows.version_key`) are passed into the monitoring insert as explicit arguments. — **Reversibility:** reversible.
- **D-03:** `insertAnalysisMonitoringEffect` becomes the **single canonical monitoring-insert helper**, extended to accept the three snapshot fields. `insertAnalysis`'s inline monitoring insert is removed and delegates to it, eliminating the duplicate write path. — **Reversibility:** reversible — internal refactor; call sites are in-repo.
- **D-04:** Provenance resolution + monitoring insert run inside the **same DB transaction** as the `analyses` insert (atomic). A row can never be persisted with fabricated provenance — an unresolvable field stays NULL only. — **Reversibility:** reversible.
- **D-05:** Each snapshot field resolves **independently**; any field with no source stays NULL. NULL fields surface as the "unknown" bucket downstream — identical to Phase 12 D-05/D-07 orphan semantics.

### Delete-Time Finalization (WRIT-02)
- **D-06:** Finalization is added **inside `deleteAnalysis`**: `UPDATE analysis_monitoring SET outcome = 'cancelled', completed_at = now() WHERE analysis_id = ? AND owner_id = ? AND outcome = 'pending'`. — **Reversibility:** reversible — idempotent row update.
- **D-07:** The finalize + `analyses` DELETE run in **one DB transaction** (both commit or roll back together). The transaction runs only **after** the external Galaxy history delete succeeds; if the Galaxy delete fails, the error bubbles as `DeleteAnalysisError` and nothing is finalized. — **Reversibility:** reversible.
- **D-08:** The monitoring row is located for finalization by `analysisId` + `ownerId` (while `analysis_id` is still set — before the `set null` cascade nulls it). — **Reversibility:** reversible.
- **D-09:** The `outcome = 'pending'` predicate is the **sole concurrency gate** between delete-finalize and the sync task. The sync task writes terminal outcomes through the same `pending`-guarded WHERE (`updateAnalysisMonitoringEffect`), so only one writer wins; a real `success`/`error` recorded by sync is never overwritten by deletion.

### Edge Semantics
- **D-10:** The snapshot is **frozen at write** — captured once, never re-resolved on later rename/re-version of the workflow. This preserves the "stats survive deletion" intent and keeps the monitoring row immutable to later user edits. — **Reversibility:** costly — retroactively changing the interpretation of already-snapshotted stats would misrepresent past data.

### the agent's Discretion
None asked explicitly — all four discussed areas were resolved with a recommendation the user accepted. Resolver/planner retains latitude only on mechanical details: exact transaction boundaries in `deleteAnalysis`, precise SQL shape, and how the create-path caller obtains `workflows.name/galaxy_id/version_key` (join vs lookup) without changing the decisions above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Write Path Integrity requirements
- `.planning/REQUIREMENTS.md` §"Write Path Integrity" — WRIT-01 (snapshot at creation), WRIT-02 (delete-time finalization, pending-guarded).

### Roadmap & prior-phase contract
- `.planning/ROADMAP.md` §"Phase 13: Write Path Integrity" — goal, success criteria, depends-on.
- `.planning/phases/12-schema-survival-columns/12-CONTEXT.md` — the snapshot-column contract this phase writes against (D-01..D-05, D-08, index/length conventions). **MUST read** before planning.

### Existing schema & patterns (codebase)
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analysisMonitoring.ts` — the table written to; its snapshot columns (`workflow_name`, `galaxy_workflow_id`, `workflow_version`) and the `analysis_id ON DELETE SET NULL` FK that strands rows on delete.
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/workflows.ts` — provenance source (`name`, `galaxy_id` via `galaxyItem`, `version_key`).
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts` — `insertAnalysis` (inline monitoring insert to replace with `insertAnalysisMonitoringEffect`), `deleteAnalysis` (finalization to add), and the create-analysis Effect wrapper that resolves `workflowId`.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts` — `insertAnalysisMonitoringEffect` (canonical insert to extend), `updateAnalysisMonitoringEffect` (pending-guarded terminal-state writer pattern to mirror).
- `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[analysisId].delete.ts` — the delete API handler that calls `deleteAnalysis`.
- `packages/nuxt-galaxy/test/server/db/schema/galaxy/analysisMonitoring.test.ts` — existing test pattern for schema/policy assertions to mirror for the write-path tests.

### Module conventions
- `packages/nuxt-galaxy/AGENTS.md` — Effect/DI patterns, migration rules (Phase 12 added no new migration here; Phase 13 should not either).
- No external specs beyond the above — requirements and conventions are fully captured here and in the referenced files.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `insertAnalysisMonitoringEffect` (`utils/grizzle/analysisMonitoring.ts`): the canonical monitoring insert to extend with the three snapshot fields; already takes `analysisId`, `ownerId`, `workflowId`, `name`, `galaxyInvocationId`.
- `updateAnalysisMonitoringEffect`: demonstrates the `outcome = 'pending'` guarded update the delete-finalize should mirror for concurrency safety.
- `analysisMonitoring` schema snapshot columns: already present (from Phase 12); this phase only populates them on the write path.

### Established Patterns
- Effect.gen + Drizzle transactions + `takeUniqueOrThrow` for single-row inserts/updates.
- `Data.TaggedError` error types (`InsertAnalysisError`, `DeleteAnalysisError`, `InsertAnalysisMonitoringError`) with unique symbols and message payloads.
- External Galaxy calls happen before DB transactions in `deleteAnalysis` (`deleteHistoryEffect` then DB delete) — finalize must slot into the DB transaction that follows.

### Integration Points
- Create path: the analysis-creation Effect wrapper (`utils/grizzle/analyses.ts`) has `workflowId` in hand; it resolves provenance and passes it into `insertAnalysisMonitoringEffect`.
- Delete path: `deleteAnalysis` (called by `[analysisId].delete.ts`) is where the finalize UPDATE + analyses DELETE transaction is added.
- Sync task remains the sole terminal-outcome writer for all non-delete transitions; delete-finalize only handles the `pending → cancelled` strand.

</code_context>

<specifics>
## Specific Ideas

- The user emphasized workflow **version** as first-class (carried from Phase 12 D-01) — this is why the write path snapshots `workflow_version`, not just the two columns WRIT-01 names.
- The user accepted freezing the snapshot at write: a renamed/re-versioned workflow must not retroactively change already-persisted stats.
- The user accepted making finalization atomic with the analyses delete (same DB transaction) but only after the external Galaxy delete succeeds.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No todos were folded or reviewed for this phase.

</deferred>

---

*Phase: 13-Write Path Integrity*
*Context gathered: 2026-08-10*
