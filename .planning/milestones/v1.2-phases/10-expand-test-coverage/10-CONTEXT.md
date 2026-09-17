# Phase 10: expand-test-coverage - Context

**Gathered:** 2026-08-09
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase expands automated test coverage for the hardened Galaxy analysis sync path. It adds tests for lock contention (held lock skip and expired lock reclaim), Galaxy 503 retry behavior, partial output-sync DB failures, and batch summary counts — without introducing new user-facing features or changing the current `skipped: 0` task contract.

</domain>

<decisions>
## Implementation Decisions

### Lock contention tests (TEST-01)

- **D-01:** Primary coverage for lock contention lives at the scheduled-task level in `packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts`. A test case verifies that when `syncAnalysisEffect` returns early because the lock is held, the batch continues and reports the analysis as not processed (not failed). — **Reversibility:** reversible — test-only change.
- **D-02:** Expired-lock reclaim behavior is covered at the unit helper level by extending `packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts`. The test models the `acquire_sync_lock` RPC returning `false` when the lock is held and `true` once the lock is released/expired. The task-level test focuses on held-lock skip only. — **Reversibility:** reversible — test-only change.

### Galaxy 503 unavailability tests (TEST-02)

- **D-03:** Tests represent Galaxy 503 responses using `blendtype`'s `GalaxyApiError` with `statusCode: 503` (e.g., `new GalaxyApiError({ message: 'Service Unavailable', statusCode: 503 })`) in the mock Galaxy layer. — **Reversibility:** reversible — test-only change.
- **D-04:** `isTransientError` in `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` is enhanced to also inspect the error's `statusCode` via `extractStatusCode(error)` and treat HTTP 503/429 as transient, in addition to the existing message-string heuristic. This small implementation change is required to support the realistic error shape chosen in D-03. — **Reversibility:** reversible — localized classifier change.
- **D-05:** Two test cases are added for 503 behavior: (a) a 503 on the first invocation fetch triggers retry and succeeds on the next attempt, and (b) repeated 503s exhaust retries and mark the analysis failed while incrementing `sync_attempts`. These live in `packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts`. — **Reversibility:** reversible — test-only change.

### Partial failure tests (TEST-03)

- **D-06:** The canonical partial-failure scenario is an `analysis_outputs` insert failure inside `syncOutputDatasetEffect`. A unit test in `packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts` verifies the effect fails with `SyncOutputError` and does not leave a dangling dataset/output pair. — **Reversibility:** reversible — test-only change.
- **D-07:** A task-level test in `packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts` verifies that when one analysis fails due to an output-sync DB error, `releaseSyncLock` is still called (via the existing `Effect.addFinalizer`) and the batch continues to process the remaining analyses. — **Reversibility:** reversible — test-only change.

### Batch summary counts (TEST-04)

- **D-08:** The current task contract reports `skipped: 0` in all cases. Tests in `packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts` assert this contract across mixed happy-path and failure batches rather than changing implementation semantics. — **Reversibility:** reversible — test-only change.

### the agent's Discretion

- The implementer chooses the exact mock setup details (e.g., whether to add a new helper factory for 503 errors in `test/server/fixtures.ts`) as long as D-03/D-04 are satisfied.
- The implementer decides whether to add the batch-summary mixed-outcome cases as new `it()` blocks or extend existing ones, provided all `{ synced, failed, skipped }` combinations are covered.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning and requirements

- `.planning/ROADMAP.md` — Phase 10 scope, success criteria, and v1.2 milestone plan.
- `.planning/REQUIREMENTS.md` — TEST-01, TEST-02, TEST-03, TEST-04 and traceability.
- `.planning/PROJECT.md` — v1.2 milestone goals, green baseline, and TDD expectation.
- `.planning/LOGGING-SPEC.md` — Authority on evlog usage, severity, and secret redaction for sync paths and tests.
- `.planning/phases/08-consolidate-and-harden-the-server-driven-sync-path/08-CONTEXT.md` — Locked Phase 8 decisions: atomic lock RPC, retry/backoff config, sync-attempt columns, legacy cleanup.
- `.planning/phases/09-remove-client-side-sync-triggers-and-add-on-demand-path/09-CONTEXT.md` — Locked Phase 9 decisions: on-demand sync endpoint, Realtime display-only contract.

### blendtype errors

- `packages/blendtype/src/errors.ts` — `GalaxyApiError`, `extractStatusCode`, and error type guards.

### Sync implementation

- `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` — Scheduled task, batch summary shape, `skipped` contract.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` — `syncAnalysisEffect`, `isTransientError`, retry/backoff, sync-attempt tracking.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts` — `acquireSyncLock` / `releaseSyncLock` helpers.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts` — `syncOutputDatasetEffect`, output link persistence.

### Existing tests to extend

- `packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts` — Existing lock helper tests.
- `packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts` — Existing retry and state-transition tests.
- `packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts` — Existing output sync tests.
- `packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts` — Existing batch summary tests.
- `packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts` — Existing happy-path integration test.
- `packages/nuxt-galaxy/test/server/fixtures.ts` — Shared mock layers and factories.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets

- `createMockSupabaseForTask` and `createMockSupabaseForIntegration` in `sync-analyses.test.ts` and `sync-flow.test.ts` provide chainable Supabase mocks for task-level tests.
- `createMockSupabase` in `analysis.test.ts` and `output.test.ts` provides configurable query-result mocks for unit tests.
- `createRoutedGalaxyLayer`, `createMockGalaxyLayer`, and `createFailingGalaxyLayer` in `test/server/fixtures.ts` are the standard ways to mock `GalaxyFetch`.
- Existing retry tests in `analysis.test.ts` already use `createRetryingGalaxyLayer` and `createRetryingRoutedGalaxyLayer` for transient-error recovery.

### Established patterns

- Unit tests for sync helpers import the implementation under test directly and mock sibling helpers (`vi.mock` for `lock.ts`, `job.ts`, `output.ts`).
- Task-level tests mock `syncAnalysisEffect` and assert batch summaries.
- Effect tests wrap programs in `Effect.runPromise` or `Effect.runPromiseExit`.
- Logs and secrets are not asserted on raw objects; tests use structured expectations and avoid snapshotting full error payloads.

### Integration points

- New tests connect to the existing `galaxy:sync-analyses` task and `syncAnalysisEffect`/`syncOutputDatasetEffect` helpers; no new handlers, composables, or pages are added.
- The only implementation change is the `isTransientError` classifier enhancement in `analysis.ts`.

</code_context>

<specifics>
## Specific Ideas

- Add a helper like `create503GalaxyLayer` to `test/server/fixtures.ts` that returns `GalaxyApiError({ message: 'Service Unavailable', statusCode: 503 })` for configured routes.
- For the batch summary tests, cover at least: all success (`{ synced: 2, failed: 0, skipped: 0 }`), all failure (`{ synced: 0, failed: 2, skipped: 0 }`), and mixed (`{ synced: 1, failed: 1, skipped: 0 }`).
- For the held-lock task test, mock `syncAnalysisEffect` to return `Effect.void` on the held-lock path and assert the batch still reports the remaining analyses correctly.

</specifics>

<deferred>
## Deferred Ideas

- **Meaningful `skipped` count in batch summary** — Increment `skipped` when an analysis is skipped because the lock is held or it is already up-to-date. This is a behavioral change to `sync-analyses.ts` and possibly the on-demand sync response shape; deferred to a future phase focused on sync scheduling/observability improvements.

</deferred>

---

*Phase: 10-expand-test-coverage*
*Context gathered: 2026-08-09*
