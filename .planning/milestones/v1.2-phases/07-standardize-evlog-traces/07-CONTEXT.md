# Phase 7: standardize-evlog-traces - Context

**Gathered:** 2026-08-07
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds structured evlog traces to the server-driven Galaxy analysis sync path. It does not change the sync contract, lock semantics, or retry behavior — it only makes the existing boundaries observable. Every sync boundary must emit an `Effect.log*` call that is routed through the existing `runTaskEffect` / `runGalaxyEffect` bridge into evlog, carrying consistent trace annotations and avoiding secrets or sensitive data.

</domain>

<decisions>
## Implementation Decisions

### Log-level policy

- **D-01:** Use a high-signal severity policy for sync boundaries:
  - `Effect.logInfo` for task start/end, analysis state transitions, history state updates, and terminal outcomes.
  - `Effect.logDebug` for lock acquire/release, Galaxy invocation fetch, jobs-summary fetch, job sync, dataset fetch, dataset download/upload, and pagination offsets.
  - `Effect.logError` for all failure paths (lock errors, Galaxy fetch errors, DB write errors, ownership mismatch).
  - This keeps production logs readable while preserving a complete reconstructible trace at debug level.
  — **Reversibility:** reversible — changing severity later is a search/replace across log calls.

### Trace annotations

- **D-02:** Always include the six trace IDs as flat top-level log context fields, using `null` when an ID is not yet known: `analysisId`, `ownerId`, `galaxyInvocationId`, `historyId`, `jobId`, `datasetId`. Do not nest them under a wrapper object and do not omit unknown keys. This matches OBSERVE-02 exactly and gives downstream log parsers a stable schema.
  — **Reversibility:** costly — many call sites will reference these keys; switching to a nested shape would require touching every boundary log.

### Task finalizer wide event

- **D-03:** The scheduled task must call `taskLog.emit({ status, synced, failed, skipped, durationMs, errors })` exactly once per run, including on early-return paths. `durationMs` is wall-clock from `run()` start to `emit()` call. `errors` is an array of `{ analysisId: number | null, message: string }` objects, one per failed analysis, with each `message` truncated to 500 characters. Single-analysis payload runs use the same shape.
  — **Reversibility:** costly — the wide-event schema is what operators and dashboards will consume; changing it later requires coordination.

### Sensitive-data guardrails

- **D-04:** Beyond evlog's configured redaction, define an explicit allowlist of loggable fields per boundary. Never log raw Galaxy response objects, dataset streams, full `stderr`, dataset `peek` content, or full error objects. Log only scalar identifiers, states, counts, durations, and short sanitized messages. Add a new "Sync trace field allowlist" section to `.planning/LOGGING-SPEC.md` documenting the rule.
  — **Reversibility:** reversible — the guardrails are documented conventions and bounded field selection.

### the agent's Discretion

- The implementer decides the exact message strings and the helper used to attach the flat trace context, as long as the severity policy and field schema are respected.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning and requirements

- `.planning/ROADMAP.md` — Phase 7 scope, success criteria, and v1.2 milestone plan.
- `.planning/REQUIREMENTS.md` — OBSERVE-01, OBSERVE-02, OBSERVE-03, OBSERVE-04.
- `.planning/PROJECT.md` — v1.1 green baseline, evlog conventions, and current milestone goals.
- `.planning/LOGGING-SPEC.md` — Authority on which surface uses which logger, wide-event shape, severity usage, and secret-redaction rules.
- `.planning/phases/06-audit-and-freeze-the-sync-contract/06-CONTEXT.md` — Locked Phase 6 decisions: canonical sync path, legacy helper deferral, freeze/sign-off rules.

### Sync path code

- `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts` — `runTaskEffect` / `runGalaxyEffect` bridge that routes `Effect.log*` into evlog.
- `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` — Nitro scheduled task; final `taskLog.emit` must be added here.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` — `syncAnalysisEffect`: lock, invocation fetch, state transition, job/output iteration.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts` — `syncJobEffect`: job upsert against Supabase.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts` — `syncOutputDatasetEffect`: dataset fetch, stream download, storage upload, output link.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts` — `acquireSyncLock` / `releaseSyncLock` boundaries.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets

- `runTaskEffect` in `evlog-effect.ts` is already wired for the scheduled task and should remain the execution bridge.
- `Effect.annotateLogs({ analysisId: String(analysisId) })` is already used in `syncAnalysisEffect`; extend the same pattern to include all six trace IDs.
- `createRequestLogger` from `evlog` is already used in `galaxy:sync-analyses` for the task-level wide event.

### Established patterns

- The canonical sync path is Supabase-based and lives in `grizzle/sync/`. Legacy Drizzle helpers remain in place but are out of scope for this phase.
- Client-side refresh is display-only via Supabase Realtime; no direct Galaxy sync triggers exist in the client layers.
- `Effect.logDebug` is routed to evlog's global `log.debug` when no request-scoped debug method is available (see `evlog-effect.ts`).

### Integration points

- `packages/nuxt-galaxy/src/module.ts` registers the scheduled task and wires the `evlog/nuxt` drain.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts` provides the service-role Supabase client used by the canonical sync path.
- `packages/nuxt-galaxy/src/runtime/server/utils/galaxy.ts` provides the lazy Galaxy layer used by both legacy and canonical paths.

</code_context>

<specifics>
## Specific Ideas

- Replace the current ad-hoc logs in `sync-analyses.ts` (e.g., `yield* Effect.logInfo('task started', payload)`) with structured messages that do not log the raw payload object.
- Remove the two `Effect.log('[sync-output] ...')` calls in `output.ts` and replace them with `Effect.logDebug` using the flat trace-ID schema.
- Ensure `taskLog.emit` is called on every exit path, including the single-analysis early return and the `catchAll` terminal error path.
- When annotating child effects (`syncJobEffect`, `syncOutputDatasetEffect`), merge the parent's trace context with the child-specific IDs (`jobId`, `datasetId`) rather than replacing it.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 7 scope.

</deferred>

---

*Phase: 07-standardize-evlog-traces*
*Context gathered: 2026-08-07*
