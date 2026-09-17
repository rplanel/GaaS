# Phase 6: Audit and Freeze the Sync Contract - Context

**Gathered:** 2026-08-07
**Status:** Ready for planning

## Phase Boundary

This phase audits the current Galaxy analysis sync workflow, documents every legacy and current sync call site, freezes the canonical server-driven sync contract, and identifies evlog trace gaps. It is **documentation and light observability cleanup only**; schema changes, lock rewrites, retry logic, and deletion of legacy helpers are deferred to Phase 8 (refactor) and Phase 7 (evlog traces).

## Implementation Decisions

### Audit deliverable

- **D-01:** The Phase 6 deliverable is a single sync contract document plus inline code comments marking legacy call sites and discovered gaps. — **Reversibility:** reversible
- **D-02:** The contract document includes a Mermaid sequence diagram of the server-driven sync flow and is mirrored under `docs/` for team reference in addition to `.planning/phases/06/`. — **Reversibility:** reversible

### Legacy sync helpers

- **D-03:** The legacy Drizzle-based helpers (`synchronizeAnalysisEffect`, `synchronizeJobEffect`, `synchronizeHistoryEffect`, and the old output/input helpers) remain in place during Phase 6 as a reference for the audit. They are explicitly listed in the inventory as "to be removed in Phase 8". — **Reversibility:** reversible

### Gap triage

- **D-04:** If the audit finds issues that improve observability (better log annotations, clearer errors, severity corrections, stale comments) and do not risk behavior change, they may be fixed within Phase 6. There is no hard line limit; use judgment and scope each fix case by case. Larger refactors remain deferred. — **Reversibility:** reversible

### Freeze / sign-off

- **D-05:** The contract is frozen when this CONTEXT.md and the contract document capture acceptance criteria and canonical references. Phase 8 planning may proceed from these locked inputs. Before Phase 8 executes any code changes, an explicit user ACK is required confirming the audit has been reviewed. — **Reversibility:** reversible

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning and requirements

- `.planning/ROADMAP.md` — Phase 6 scope, success criteria, and v1.2 milestone plan.
- `.planning/REQUIREMENTS.md` — AUDIT-01, AUDIT-02, AUDIT-03 and traceability to later phases.
- `.planning/PROJECT.md` — v1.1 baseline, evlog conventions, and current milestone goals.
- `.planning/LOGGING-SPEC.md` — Authority on which surface uses which logger, wide-event shape, severity usage, and secret-redaction rules.

### Legacy (Drizzle-based) sync path

- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts` — `synchronizeAnalysisEffect`, `synchronizeAnalysesEffect`, `synchronizeJobsEffect`, state transitions, and terminal-state handling.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/histories.ts` — `synchronizeHistoryEffect` and input dataset sync orchestration.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/jobs.ts` — `synchronizeJobEffect` and output dataset orchestration.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/input.ts` — `synchronizeInputDatasetEffect`.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/output.ts` — `synchronizeOutputDatasetEffect`.

### Canonical (Supabase-based) sync path

- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` — `syncAnalysisEffect`: lock acquisition, invocation fetch, state derivation, job/output iteration.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts` — `syncJobEffect`: job upsert against Supabase.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts` — `syncOutputDatasetEffect`: dataset fetch, stream download, storage upload, output link.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts` — `acquireSyncLock` / `releaseSyncLock`: current read-delete-insert lock implementation.
- `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` — `galaxy:sync-analyses` Nitro scheduled task, paging, single-analysis payload path.

### Data model and logging bridge

- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts` — `analyses` table schema (currently lacks `sync_attempts`, `last_sync_error_at`, `next_sync_at`).
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/syncLocks.ts` — `sync_locks` table schema and RLS policy note.
- `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts` — `runGalaxyEffect` / `runTaskEffect` bridge that routes `Effect.log*` into evlog request/task loggers.

### Client surface

- `packages/ui/app/pages/analyses/[analysisId].vue` — Analysis detail page; uses Supabase Realtime subscriptions on `histories`, `jobs`, and `analysis_outputs` for display refresh only.

## Existing Code Insights

### Reusable assets

- `runTaskEffect` in `evlog-effect.ts` is already wired for the scheduled task and should remain the execution bridge for any sync Effect program.
- `createRequestLogger` from `evlog` is already used in `galaxy:sync-analyses` and is the pattern for task-level wide events.

### Established patterns

- Two parallel sync implementations currently exist: the legacy Drizzle-based helpers in `grizzle/` and the newer Supabase-based helpers in `grizzle/sync/`. The scheduled task uses the Supabase path.
- Client-side refresh is display-only via Supabase Realtime; no direct Galaxy sync triggers were found in `@gaas/ui`, `@gaas/wiki`, or `playground`.
- Effect logging is already routed through evlog; gaps are likely around annotations, boundaries, and error branches rather than missing infrastructure.

### Integration points

- `packages/nuxt-galaxy/src/module.ts` registers the scheduled task and wires the `evlog/nuxt` drain.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts` provides the service-role Supabase client used by the canonical sync path.
- `packages/nuxt-galaxy/src/runtime/server/utils/galaxy.ts` provides the lazy Galaxy layer used by both legacy and canonical paths.

## Specific Ideas

- The contract document should include a sequence diagram showing: scheduled task → lock acquire → analysis fetch → Galaxy invocation fetch → jobs/outputs sync → terminal state → lock release → task summary emit.
- Inline comments should mark each legacy `synchronize*Effect` definition and each remaining call site with a consistent tag such as `// LEGACY-SYNC: remove in Phase 8`.

## Deferred Ideas

None — discussion stayed within Phase 6 scope.
