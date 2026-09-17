---
wave: 1
depends_on:
  - .planning/phases/09-remove-client-side-sync-triggers-and-add-on-demand-path/09-02-PLAN.md
files_modified:
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
  - packages/nuxt-galaxy/test/server/fixtures.ts
  - packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts
  - packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts
  - packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts
  - packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts
  - packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts
autonomous: false
---

# Phase 10 Plan: expand-test-coverage

<planning_context>
This phase expands automated test coverage for the hardened Galaxy analysis sync path. The work is test-only, except for a localized classifier change in `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts`: `isTransientError` must also inspect the error's HTTP `statusCode` via `extractStatusCode(error)` and treat `503`/`429` as transient, in addition to the existing message-string heuristic.

Scope decisions from `10-CONTEXT.md`:
- **TEST-01 / D-01,D-02:** Lock contention is covered at the scheduled-task level (held lock does not abort the batch) and at the lock-helper level (expired lock can be reclaimed).
- **TEST-02 / D-03,D-04,D-05:** Galaxy 503 unavailability is modeled with `new GalaxyApiError({ message: 'Service Unavailable', statusCode: 503 })`; the `isTransientError` enhancement is required so the retry path recognizes the realistic error shape.
- **TEST-03 / D-06,D-07:** Partial output-sync failures are tested at unit level (`SyncOutputError` on `analysis_outputs` insert) and at integration/task level (lock is still released and the batch continues).
- **TEST-04 / D-08:** Batch summary tests assert the existing `{ synced, failed, skipped: 0 }` contract across mixed happy-path and failure outcomes without changing the task implementation.

Constraints: no new user-facing features, keep `skipped: 0` contract unchanged, no snapshotting of full error payloads, and no secrets in logs or fixtures.
</planning_context>

<task id="10-01" type="tracer" autonomous="false" reversibility="reversible" est_hours="3">
  <title>503 retry end-to-end tracer</title>
  <description>
    Implement the `isTransientError` status-code enhancement and add end-to-end and unit tests that exercise the full 503 path: a Galaxy `503` on the first invocation fetch is retried and succeeds; repeated `503`s exhaust retries and mark the analysis failed while incrementing `sync_attempts`. Add a reusable `create503GalaxyLayer` factory to `test/server/fixtures.ts` if it simplifies the mock setup.
  </description>
  <requirements>TEST-02</requirements>
  <files_modified>
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
    - packages/nuxt-galaxy/test/server/fixtures.ts
    - packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts
  </files_modified>
  <read_first>
    - packages/blendtype/src/errors.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
    - packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
    - packages/nuxt-galaxy/test/server/fixtures.ts
    - packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts
  </read_first>
  <acceptance_criteria>
    1. `isTransientError` returns `true` for `new GalaxyApiError({ message: 'Service Unavailable', statusCode: 503 })` and for `statusCode: 429`, and remains `false` for non-transient errors such as `statusCode: 400` or `404`.
    2. `extractStatusCode(error)` from `blendtype` is used; the existing message heuristic is preserved.
    3. The new end-to-end test passes: first invocation fetch returns 503, retry succeeds, output sync succeeds, and the task result equals `{ synced: 1, failed: 0, skipped: 0 }`.
    4. A unit test in `analysis.test.ts` passes for repeated 503 responses: retries are exhausted, the effect fails, the analysis is marked failed, and `sync_attempts` is incremented.
    5. No API keys, tokens, dataset contents, or real credentials appear in fixtures, logs, or assertions.
  </acceptance_criteria>
</task>

<task id="10-02" type="test" autonomous="false" reversibility="reversible" est_hours="2">
  <title>Lock contention tests</title>
  <description>
    Add expired-lock reclaim coverage to the lock-helper unit tests, and add a scheduled-task-level test that demonstrates a held lock does not abort the batch and does not record the analysis as failed, while preserving the current `skipped: 0` task contract.
  </description>
  <requirements>TEST-01</requirements>
  <files_modified>
    - packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts
    - packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts
  </files_modified>
  <read_first>
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
    - packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts
    - packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts
  </read_first>
  <acceptance_criteria>
    1. `lock.test.ts` contains a passing test where `acquireSyncLock` returns `false` while a lock is held and returns `true` once `releaseSyncLock` has run, modeling expired-lock reclaim.
    2. `sync-analyses.test.ts` contains a passing test where one analysis is held-lock-skipped and the batch continues; the result is not counted as a failure and the batch completes without throwing.
    3. No implementation changes are made to the `skipped: 0` contract or to the task summary logic.
  </acceptance_criteria>
</task>

<task id="10-03" type="test" autonomous="false" reversibility="reversible" est_hours="3">
  <title>Partial output-sync failure tests</title>
  <description>
    Cover the partial-failure path where a DB write inside `syncOutputDatasetEffect` fails. Add a unit test that fails the `analysis_outputs` insert and asserts `SyncOutputError` with no orphaned dataset/output pair. Add an integration- or task-level test that shows when one analysis fails because of an output-sync DB error, the lock is still released via the existing `Effect.addFinalizer` and the remaining analyses are processed.
  </description>
  <requirements>TEST-03</requirements>
  <files_modified>
    - packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts
    - packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts
  </files_modified>
  <read_first>
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
    - packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts
    - packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts
  </read_first>
  <acceptance_criteria>
    1. `output.test.ts` has a passing test where `analysis_outputs` insert returns an error; the effect fails with `SyncOutputError` whose message contains the insert failure, and the mock chain shows no dangling output row was committed.
    2. The integration/task-level test passes: a batch with two analyses fails the output-sync DB write for the first analysis, succeeds for the second, and the lock-release RPC (`sync_locks` delete) is observed for the failing analysis.
    3. The failing analysis is counted in `failed` and the succeeding analysis in `synced` with `skipped: 0`.
  </acceptance_criteria>
</task>

<task id="10-04" type="test" autonomous="false" reversibility="reversible" est_hours="1.5">
  <title>Batch summary count coverage</title>
  <description>
    Extend the scheduled-task tests in `sync-analyses.test.ts` to assert the `{ synced, failed, skipped: 0 }` shape across the remaining mixed-outcome combinations: all-success, all-failure, and mixed success/failure batches. Do not alter the implementation's `skipped` contract.
  </description>
  <requirements>TEST-04</requirements>
  <files_modified>
    - packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts
  </files_modified>
  <read_first>
    - packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
    - packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts
  </read_first>
  <acceptance_criteria>
    1. New test cases pass for: two successes (`{ synced: 2, failed: 0, skipped: 0 }`), two failures (`{ synced: 0, failed: 2, skipped: 0 }`), and one success plus one failure (`{ synced: 1, failed: 1, skipped: 0 }`).
    2. Assertions use explicit object equality, not snapshots of full error payloads.
    3. Error messages in assertions are truncated or static; no secrets are included.
  </acceptance_criteria>
</task>

<verify>
  1. Run the targeted nuxt-galaxy test suites:
     ```bash
     pnpm --filter ./packages/nuxt-galaxy vitest run \
       test/server/utils/grizzle/sync/analysis.test.ts \
       test/server/utils/grizzle/sync/lock.test.ts \
       test/server/utils/grizzle/sync/output.test.ts \
       test/server/tasks/galaxy/sync-analyses.test.ts \
       test/server/tasks/integration/sync-flow.test.ts
     ```
  2. Run the full nuxt-galaxy package tests:
     ```bash
     pnpm --filter ./packages/nuxt-galaxy test
     ```
  3. Verify no secrets in test output or fixtures by searching the touched files for `GALAXY_API_KEY`, `service_role`, `eyJ`, UUID-like tokens, or real hostnames:
     ```bash
     rg -n 'GALAXY_API_KEY|service_role|eyJ[0-9A-Za-z_-]*\.|-----BEGIN' packages/nuxt-galaxy/test packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
     ```
  4. Confirm the implementation change is limited to `isTransientError` in `analysis.ts` and that `git diff` shows only the expected classifier addition.
</verify>

<must_haves>
  <truths>
    - Lock contention tests pass: a held lock causes the analysis to be skipped; an expired lock is reclaimed by a new worker.
    - Galaxy unavailability tests pass: a 503 response triggers retry and eventual success; repeated 503s mark the analysis failed and increment `sync_attempts`.
    - Partial failure tests pass: a DB write failure inside output sync releases the lock and allows the batch to continue.
    - Task-level summary tests return correct `{ synced, failed, skipped }` counts for mixed happy-path and failure outcomes.
    - All new tests pass and contain no secrets in logs or snapshots.
    - D-04: `isTransientError` in `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` is enhanced to inspect the error's `statusCode` via `extractStatusCode(error)` and treat HTTP 503/429 as transient, in addition to the existing message-string heuristic.
  </truths>
</must_haves>

<threat_model>
  <risk severity="low" id="a">
    Secrets captured in test fixtures or logs (e.g., Galaxy API keys, Supabase service keys, JWTs, dataset contents).
    <mitigation>Use only fake UUIDs and example.org values in fixtures; never include real tokens or full payloads. Review all new test data and log assertions before committing.</mitigation>
  </risk>
  <risk severity="low" id="b">
    Tests accidentally exercise real Galaxy or Supabase endpoints and expose credentials.
    <mitigation>Every new test must provide a mocked `GalaxyFetch` layer and a mocked Supabase client; never fall back to live network calls.</mitigation>
  </risk>
  <risk severity="medium" id="c">
    The `isTransientError` classifier enhancement inadvertently treats non-transient HTTP errors (e.g., 400, 404, 500) as retryable.
    <mitigation>Only add explicit `503`/`429` handling through `extractStatusCode`; preserve the existing message heuristic; add unit tests proving 400/404/500 are not transient.</mitigation>
  </risk>
</threat_model>

<artifacts>
  - `.planning/phases/10-expand-test-coverage/10-PLAN.md` (this plan)
  - Updated `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` (`isTransientError` classifier)
  - Updated `packages/nuxt-galaxy/test/server/fixtures.ts` (e.g., `create503GalaxyLayer` helper)
  - Extended `packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts` (503 retry end-to-end tracer)
  - Extended `packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts` (expired-lock reclaim)
  - Extended `packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts` (503 retry unit coverage)
  - Extended `packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts` (partial DB failure)
  - Extended `packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts` (lock contention batch behavior and summary counts)
</artifacts>
