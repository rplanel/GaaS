# Phase 9: Remove Client-Side Sync Triggers and Add On-Demand Path - Context

**Gathered:** 2026-08-09
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase removes any remaining client-side Galaxy sync triggers and adds a server-owned, on-demand way to request a single-analysis sync. The scheduled task `galaxy:sync-analyses` remains the only sync-state mutator; the new path simply enqueues that task for a specific `analysisId` without bypassing the lock table. Supabase Realtime stays a display-only refresh mechanism.

</domain>

<decisions>
## Implementation Decisions

### On-demand sync endpoint

- **D-01:** Expose the on-demand path as `POST /api/db/analyses/:id/sync`. Resource-oriented route that reuses the existing `/api/db/analyses` handler family. — **Reversibility:** costly — route path becomes part of the public API contract.
- **D-02:** Auth is **owner-only** for Phase 9. The handler uses `getSupabaseUser(event)`, fetches the analysis row, and rejects with 403 if the caller is not `analyses.owner_id`. An admin override is deferred (see Deferred Ideas). — **Reversibility:** reversible — auth check is local to the handler.
- **D-03:** The handler validates that the analysis exists and that the caller owns it before enqueueing. Returns 404 for missing analyses and 403 for ownership failures. — **Reversibility:** reversible.
- **D-04:** The handler enqueues the canonical task via Nitro `runTask('galaxy:sync-analyses', { payload: { analysisId } })` and returns immediately. It does **not** run `syncAnalysisEffect` inline and does **not** check `sync_locks` before enqueueing; the task already owns lock acquisition/skip logic. — **Reversibility:** reversible.
- **D-05:** Response is `202 Accepted` with JSON body `{ analysisId, status: 'queued', task: 'galaxy:sync-analyses' }`. The body gives the client a clear async signal without reporting lock state. — **Reversibility:** costly — response shape is consumed by the UI.
- **D-06:** Handler-level logging uses the standard evlog request logger (`const log = useLogger(event)`) and emits an `info` log containing `analysisId` and the caller user id. Follows `.planning/LOGGING-SPEC.md` for server routes. — **Reversibility:** reversible.

### Client trigger cleanup

- **D-07:** No client-side Galaxy sync triggers remain outside the scheduled task. The only client refresh mechanism is `useSupabaseRealtime`, which re-fetches displayed Supabase rows and must not mutate sync state.
- **D-08:** Add a new, distinct **"Sync now"** `UButton` on the analysis detail page (`packages/ui/app/pages/analyses/[analysisId].vue`) next to the existing "Run Again" icon. The two actions must remain visually/functionally separate: "Sync now" triggers `POST /api/db/analyses/:id/sync`; "Run Again" is left untouched for a future rerun phase. — **Reversibility:** reversible.
- **D-09:** The "Sync now" button uses a fire-and-forget pattern: call the endpoint and show a brief success toast. Do not poll or wait for completion; Realtime will refresh the view when the task updates the database. — **Reversibility:** reversible.

### Realtime contract documentation

- **D-10:** Document the "display-only" contract in code comments/JSDoc in three places:
  - `packages/nuxt-galaxy/src/runtime/app/composables/useSupabaseRealtime.ts` — state that the composable refreshes displayed state only and must not trigger Galaxy sync.
  - Analysis pages that subscribe to `histories`, `jobs`, and `analysis_outputs` — note that subscriptions are for display refresh only.
  - `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` — note that this task is the sole mutator of sync state.
- **D-11:** Create a user-facing docs page at `docs/content/2.concepts/sync-contract.md` that explains the contract and includes a Mermaid sequence diagram showing: scheduled task / on-demand enqueue → lock → Galaxy → DB → Realtime → UI. — **Reversibility:** reversible.

### the agent's Discretion

- The implementer chooses the exact icon for the new "Sync now" button as long as it is visually distinct from "Run Again" (e.g., `i-lucide:refresh-cw` vs `i-lucide:refresh-ccw`).
- The implementer chooses the exact toast library/utility already in use in `@gaas/ui`.
- The implementer decides whether the new handler lives at `runtime/server/api/db/analyses/[id]/sync.post.ts` or another route file, as long as the registered route is `POST /api/db/analyses/:id/sync`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning and requirements

- `.planning/ROADMAP.md` — Phase 9 scope, success criteria, and v1.2 milestone plan.
- `.planning/REQUIREMENTS.md` — CLIENT-01, CLIENT-02, CLIENT-03 and traceability.
- `.planning/PROJECT.md` — v1.2 milestone goals and green baseline.
- `.planning/LOGGING-SPEC.md` — Authority on evlog usage, severity, and secret redaction for server routes and scheduled tasks.
- `.planning/phases/06-audit-and-freeze-the-sync-contract/06-CONTEXT.md` — Locked Phase 6 decisions: canonical sync path, legacy helper deferral, Realtime display-only finding.
- `.planning/phases/07-standardize-evlog-traces/07-CONTEXT.md` — Locked Phase 7 decisions: log severity policy, flat six-ID trace schema, task finalizer wide event.
- `.planning/phases/08-consolidate-and-harden-the-server-driven-sync-path/08-CONTEXT.md` — Locked Phase 8 decisions: atomic lock RPC, retry/backoff, module sync options, legacy cleanup.

### Server-side sync path

- `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` — Canonical scheduled task that already accepts `{ analysisId }` in its payload and respects `sync_locks`.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` — `syncAnalysisEffect`: lock, invocation fetch, state transition, job/output iteration.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts` — `acquireSyncLock` / `releaseSyncLock`.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts` — `getSupabaseUser`, service-role client creation.

### Client-side refresh surface

- `packages/nuxt-galaxy/src/runtime/app/composables/useSupabaseRealtime.ts` — Composable used for display-only Realtime refresh.
- `packages/ui/app/pages/analyses/[analysisId].vue` — Analysis detail page where the new "Sync now" button is added.
- `packages/ui/app/components/analysis/AnalysisHistoryPanel.vue` — Uses `useSupabaseRealtime` for histories/jobs/outputs refresh.
- `packages/ui/app/components/analysis/AnalysisListPanel.vue` — Uses `useSupabaseRealtime` for the analyses list refresh.

### Module wiring and patterns

- `packages/nuxt-galaxy/src/module.ts` — Registers the `galaxy:sync-analyses` task and runtime config.
- `packages/nuxt-galaxy/src/runtime/server/api/db/analyses.post.ts` — Existing owner-scoped analysis handler pattern to mirror.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets

- `galaxy:sync-analyses` already supports a single-analysis payload, so the on-demand path does not need a new task or effect pipeline.
- `runTask` (Nitro experimental tasks) is the natural enqueue primitive for the new handler.
- `useLogger(event)` from `evlog` is the standard server-route logger.
- `getSupabaseUser` + service-role Supabase client are already used for owner checks in analysis handlers.
- The existing `refresh-ccw` "Run Again" icon in `pages/analyses/[analysisId].vue` is currently a no-op and must not be confused with the new sync action.

### Established patterns

- Server handlers in `runtime/server/api/db/` use `defineEventHandler`, `readBody`, and `runGalaxyEffect` or direct `evlog` logging.
- The `@gaas/ui` layer uses Nuxt UI components (`UButton`, `UTooltip`) and toast utilities.
- The module exposes sync configuration under `runtimeConfig.galaxy.sync`; the on-demand path does not need new config.

### Integration points

- New handler registers under `runtime/server/api/db/analyses/[id]/sync.post.ts` (or equivalent) and is added via `addServerHandler` in `module.ts` (or auto-discovered by Nitro file routing if placed in the correct directory).
- The client calls the endpoint from `pages/analyses/[analysisId].vue` or a small wrapper composable.
- Tests should cover the handler and at least one integration path verifying that a held lock is respected (i.e., the task skips rather than duplicating work).

</code_context>

<specifics>
## Specific Ideas

- Use a distinct icon such as `i-lucide:refresh-cw` for "Sync now" and keep `i-lucide:refresh-ccw` for "Run Again" (or leave it unchanged).
- The 202 response body should remain small and stable: `{ analysisId: number, status: 'queued', task: 'galaxy:sync-analyses' }`.
- Consider adding a small composable like `useSyncAnalysis(analysisId)` in `@gaas/ui` or `nuxt-galaxy` if the pattern is reused, but Phase 9 only needs the detail page button.
</specifics>

<deferred>
## Deferred Ideas

- **Admin override for on-demand sync** — Deferred to a later RBAC-focused phase. Phase 9 implements owner-only auth.
- **Real "Run Again" functionality** — Rerunning a workflow with the same inputs is a new user-facing capability and belongs in its own phase.
- **Client polling until sync completion** — Intentionally avoided; the design relies on Realtime for display updates.
- **List-level manual sync button** — Not needed for Phase 9; can be added later if operators want bulk/manual sync from the analyses list.

</deferred>

---

*Phase: 09-remove-client-side-sync-triggers-and-add-on-demand-path*
*Context gathered: 2026-08-09*
