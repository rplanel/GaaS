---
phase: 07-standardize-evlog-traces
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts
  - .planning/LOGGING-SPEC.md
autonomous: true
requirements:
  - OBSERVE-01
  - OBSERVE-02
  - OBSERVE-03
  - OBSERVE-04
estimate:
  tokens: 52000
  raw_tokens: 34000
  tasks: 3
  confidence: medium
must_haves:
  truths:
    - "Every sync boundary in the canonical path emits an Effect.logInfo, Effect.logDebug, or Effect.logError call routed through evlog-effect.ts"
    - "All sync logs carry flat top-level analysisId, ownerId, galaxyInvocationId, historyId, jobId, datasetId fields using string or null values per D-02"
    - "The galaxy:sync-analyses task emits taskLog.emit exactly once per run with status, synced, failed, skipped, durationMs, and an errors array on every exit path per D-03"
    - "Empty analysis page returns are logged with offset 0 and row count 0"
    - "Single-analysis runs and batch runs use the same taskLog.emit wide-event schema"
    - "Error messages in the errors array are truncated to 500 characters"
  artifacts:
    - packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts
    - .planning/LOGGING-SPEC.md
  key_links:
    - "Effect.log* in sync files -> evlog-effect.ts bridge -> evlog request/task logger"
    - "taskLog.emit in sync-analyses.ts -> evlog wide-event drain"
    - "Parent annotations in analysis.ts merge with child annotations in job.ts/output.ts"
  prohibitions:
    - "Never log raw Galaxy response objects, dataset streams, full stderr/stdout, dataset peek content, or full error objects in sync paths"
    - "Never log Galaxy API keys, Supabase service keys, JWTs, or session tokens in sync paths or tests"
  flagged_assumptions:
    - statement: "Duration measurement uses wall-clock Date.now() difference and is reported as integer milliseconds"
      verification: backstop
    - statement: "Concurrent scheduled task runs each create a fresh createRequestLogger with unique requestId and do not share mutable result counters"
      verification: backstop
    - statement: "Child effects merge parent trace context with child-specific IDs rather than replacing it"
      verification: explicit
---

<objective>
Make the canonical server-driven Galaxy analysis sync path fully observable through structured evlog traces without changing sync behavior, lock semantics, or retry logic.

Purpose: Operators and developers can reconstruct a complete cross-service trace for every analysis sync from a single set of log entries, and the scheduled task reports a consistent outcome wide event on every run.
Output: Structured boundary logs and a finalizer wide event across the sync path, plus an updated logging spec that documents the sync trace field allowlist.
</objective>

<execution_context>
@/home/rplanel/.config/opencode/gsd-core/workflows/execute-plan.md
@/home/rplanel/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/LOGGING-SPEC.md
@.planning/phases/07-standardize-evlog-traces/07-CONTEXT.md
@.planning/phases/07-standardize-evlog-traces/07-PATTERNS.md
@.planning/phases/06-audit-and-freeze-the-sync-contract/06-CONTEXT.md

@packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts
@packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
@packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
@packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
@packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts
@packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts
</context>

<tasks>

<task type="tracer">
  <name>End-to-end structured trace for single-analysis sync</name>
  <files>
    packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts
  </files>
  <read_first>
    packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts
    packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts
    .planning/LOGGING-SPEC.md
    .planning/phases/07-standardize-evlog-traces/07-CONTEXT.md
    .planning/phases/07-standardize-evlog-traces/07-PATTERNS.md
  </read_first>
  <requirements>
    - OBSERVE-01
    - OBSERVE-02
  </requirements>
  <action>
    Wire structured evlog traces through the single-analysis sync path while preserving existing behavior. Follow the analog patterns in 07-PATTERNS.md: analysis.ts already uses `Effect.annotateLogs` + `Effect.scoped`; extend that pattern to job.ts and output.ts, and keep the Effect→evlog bridge conventions from evlog-effect.ts.

    In sync-analyses.ts per D-01 and D-03:
    - Add a one-line comment reference to the `## Sync trace field allowlist` section in `.planning/LOGGING-SPEC.md` near the top of the task file.
    - Replace `yield* Effect.logInfo('task started', payload)` with `yield* Effect.logInfo('task started', { analysisId: payload?.analysisId ?? null })` so the raw payload object is never logged.
    - Replace `yield* Effect.logInfo('syncing single analysis', analysisId)` with `yield* Effect.logInfo('syncing single analysis', { analysisId })`.
    - Replace `yield* Effect.logError('analysis not found or error', analysisId, error)` with `yield* Effect.logError('analysis not found or error', { analysisId, message: error?.message ?? String(error) })`; do not pass the raw error object.
    - Ensure the single-analysis early-return path returns `{ synced: 0, failed: 1, skipped: 0, errors: [{ analysisId, message: 'Analysis not found' }] }`.
    - Record `const start = Date.now()` before `runTaskEffect` and compute `durationMs = Date.now() - start` for the final emit.

    In analysis.ts per D-01 and D-02:
    - Add a one-line comment reference to the `## Sync trace field allowlist` section in `.planning/LOGGING-SPEC.md` near the top of the file.
    - Extend the final `Effect.annotateLogs` to include all six trace IDs as flat top-level fields with string or null values: `{ analysisId: String(analysisId), ownerId, galaxyInvocationId: null, historyId: null, jobId: null, datasetId: null }`.
    - Add `yield* Effect.logDebug('fetching invocation', { galaxyInvocationId: analysis.galaxy_id })` before the Galaxy invocation fetch.
    - Add `yield* Effect.logDebug('invocation state', { state: invocation.state, steps: invocation.steps?.length ?? 0 })` after the fetch.
    - Add `yield* Effect.logDebug('derived outcome from jobs summary', { derivedOutcome })` when a derived outcome exists.
    - Add `yield* Effect.logInfo('updated state', { state: effectiveState, isSync: isTerminal })` after the analyses table update.
    - Add `yield* Effect.logError('ownership mismatch', { analysisId, ownerId })` on the ownership mismatch failure path.

    In lock.ts per D-01 and D-02:
    - Add a one-line comment reference to the `## Sync trace field allowlist` section in `.planning/LOGGING-SPEC.md` near the top of the file.
    - Wrap `acquireSyncLock` and `releaseSyncLock` bodies with `Effect.annotateLogs({ analysisId: String(analysisId), ownerId: null, galaxyInvocationId: null, historyId: null, jobId: null, datasetId: null })`.
    - Add `yield* Effect.logDebug('acquiring sync lock', { analysisId })` at the start of `acquireSyncLock`.
    - Add `yield* Effect.logDebug('releasing sync lock', { analysisId })` at the start of `releaseSyncLock`.

    In job.ts per D-01 and D-02:
    - Add a one-line comment reference to the `## Sync trace field allowlist` section in `.planning/LOGGING-SPEC.md` near the top of the file.
    - Wrap the function body with `Effect.annotateLogs({ analysisId: String(analysisId), ownerId, galaxyInvocationId: null, historyId: null, jobId: galaxyJobId, datasetId: null })`.
    - Add `yield* Effect.logDebug('syncing job', { galaxyJobId, stepId })` at the start.
    - Add `yield* Effect.logDebug('job upsert complete', { dbJobId, state: galaxyJob.state })` before each return.
    - Add `yield* Effect.logError` on the select, fetch, update, and insert failure paths.
    - Do not log `galaxyJob.stderr` or `galaxyJob.stdout` payloads.

    In output.ts per D-01, D-02, and D-04:
    - Add a one-line comment reference to the `## Sync trace field allowlist` section in `.planning/LOGGING-SPEC.md` near the top of the file.
    - Replace the two `Effect.log('[sync-output] ...')` calls with `yield* Effect.logDebug('dataset download started', { analysisId, ownerId, galaxyInvocationId: null, historyId: historyGalaxyId, jobId, datasetId: galaxyDatasetId })` and `yield* Effect.logDebug('dataset download returned', { hasStream: stream !== null, analysisId, ownerId, galaxyInvocationId: null, historyId: historyGalaxyId, jobId, datasetId: galaxyDatasetId })`.
    - Add `Effect.annotateLogs` around the download section with the six trace IDs, using `null` for unknown IDs.
    - Add `yield* Effect.logDebug('dataset upsert complete', { datasetId: galaxyDatasetId, state: galaxyDataset.state })` before return.
    - Add `yield* Effect.logError` on existing and history query failure paths.
    - Do not log `galaxyDataset.peek`, `galaxyDataset.misc_blurb`, stream contents, or the raw `invocation` object.
  </action>
  <acceptance_criteria>
    - `pnpm --filter ./packages/nuxt-galaxy typecheck` passes with no errors in the modified files.
    - `grep -n "Effect.logInfo('task started', payload)" packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` returns zero matches.
    - `grep -n "\[sync-output\]" packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts` returns zero matches.
    - Every `Effect.annotateLogs` call in the five modified files references the six trace ID keys `analysisId`, `ownerId`, `galaxyInvocationId`, `historyId`, `jobId`, `datasetId`.
  </acceptance_criteria>
  <verify>
    <automated>
      pnpm --filter ./packages/nuxt-galaxy typecheck && \
      test 0 -eq $(grep -n "Effect.logInfo('task started', payload)" packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts 2>/dev/null | wc -l) && \
      test 0 -eq $(grep -n "\[sync-output\]" packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts 2>/dev/null | wc -l) && \
      for f in packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts; do
        if grep -q "Effect.annotateLogs" "$f"; then
          grep -q "analysisId" "$f" && grep -q "ownerId" "$f" && grep -q "galaxyInvocationId" "$f" && grep -q "historyId" "$f" && grep -q "jobId" "$f" && grep -q "datasetId" "$f" || { echo "missing trace ID in $f"; exit 1; }
        fi
      done
    </automated>
  </verify>
  <done>
    The single-analysis sync path emits structured logs at every boundary and carries the full six-ID trace context, with no raw payloads or ad-hoc string logs remaining.
  </done>
</task>

<task type="auto">
  <name>Batch loop traces, task finalizer, and logging spec allowlist</name>
  <files>
    packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
    .planning/LOGGING-SPEC.md
  </files>
  <read_first>
    packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
    .planning/LOGGING-SPEC.md
    .planning/phases/07-standardize-evlog-traces/07-CONTEXT.md
    .planning/phases/07-standardize-evlog-traces/07-PATTERNS.md
  </read_first>
  <requirements>
    - OBSERVE-01
    - OBSERVE-03
  </requirements>
  <action>
    Expand the structured trace to the batch path and document the field allowlist. Use the pattern-mapper analog notes for sync-analyses.ts as the source-of-truth entry point.

    In sync-analyses.ts per D-01 and D-03:
    - Replace the batch `Effect.logDebug('page query', { offset, rows: page.data?.length ?? 0, error: page.error?.message ?? 'none' })` with `yield* Effect.logDebug('page query', { offset, rowCount: page.data?.length ?? 0, errorMessage: page.error?.message ?? null })`; do not use the sentinel string `'none'` for missing errors.
    - Add `yield* Effect.logInfo('batch finished', { synced, failed })` after the loop.
    - Ensure the batch `catchAll` path returns `{ synced: 0, failed: 1, skipped: 0, errors: [{ analysisId: null, message: String(error).slice(0, 500) }] }`.
    - Ensure every per-analysis failure (including `analysis not found`) appends an `{ analysisId, message: String(error).slice(0, 500) }` entry to a task-level `errors` array.
    - Refactor the run function so `taskLog.emit({ status: result.failed > 0 ? 500 : 200, synced: result.synced, failed: result.failed, skipped: result.skipped, durationMs, errors: result.errors })` is invoked exactly once for both single-analysis and batch runs, even when the Effect program catches all errors internally. Use `const start = Date.now()` before `runTaskEffect` and compute `durationMs` from the returned result.

    In LOGGING-SPEC.md per D-04:
    - Add a new top-level section `## Sync trace field allowlist` between `## Secret-redaction rules` and `## Effect logDebug path`.
    - List allowed field categories: scalar identifiers (`analysisId`, `ownerId`, `galaxyInvocationId`, `historyId`, `jobId`, `datasetId`), states (`state`, `isSync`, `derivedOutcome`), counts (`synced`, `failed`, `skipped`, `steps`, `rowCount`), durations (`durationMs`), and sanitized short messages (`message` truncated to 500 characters).
    - List forbidden categories: raw Galaxy response objects, dataset streams or stream buffers, full `stderr`/`stdout`, dataset `peek` content or `misc_blurb`, full error objects, and any secret or credential value.
  </action>
  <acceptance_criteria>
    - `grep -c "taskLog.emit" packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` equals 1.
    - The `taskLog.emit` call passes an object literal containing keys `status`, `synced`, `failed`, `skipped`, `durationMs`, and `errors`.
    - `grep -A 20 "## Sync trace field allowlist" .planning/LOGGING-SPEC.md` contains both an allowed list and a forbidden list.
    - `pnpm --filter ./packages/nuxt-galaxy lint` passes.
  </acceptance_criteria>
  <verify>
    <automated>
      test 1 -eq $(grep -c "taskLog.emit" packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts) && \
      grep -A 5 "taskLog.emit" packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts | grep -q "status" && \
      grep -A 5 "taskLog.emit" packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts | grep -q "synced" && \
      grep -A 5 "taskLog.emit" packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts | grep -q "failed" && \
      grep -A 5 "taskLog.emit" packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts | grep -q "skipped" && \
      grep -A 5 "taskLog.emit" packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts | grep -q "durationMs" && \
      grep -A 5 "taskLog.emit" packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts | grep -q "errors" && \
      grep -A 20 "## Sync trace field allowlist" .planning/LOGGING-SPEC.md | grep -qi "allowed" && \
      grep -A 20 "## Sync trace field allowlist" .planning/LOGGING-SPEC.md | grep -qi "forbidden" && \
      pnpm --filter ./packages/nuxt-galaxy lint
    </automated>
  </verify>
  <done>
    The batch loop and single-analysis path share one finalizer shape, and the logging spec documents the sync trace field allowlist.
  </done>
</task>

<task type="auto">
  <name>Secret and sensitive-data scan across sync paths and tests</name>
  <files>
    packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts
  </files>
  <read_first>
    packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts
    .planning/LOGGING-SPEC.md
    .planning/phases/07-standardize-evlog-traces/07-PATTERNS.md
  </read_first>
  <requirements>
    - OBSERVE-04
  </requirements>
  <action>
    Verify that no secrets or sensitive dataset content are logged in the sync path or its tests.

    Run a static scan across the five sync files and any test/snapshot files under tracked `packages/nuxt-galaxy/src/` and `packages/nuxt-galaxy/test/` paths (excluding generated directories `.nuxt/`, `node_modules/`, `.output/`, `dist/`) for forbidden patterns:
    - `Effect\.log.*,\s*payload\s*\)` (raw payload object passed as a log argument; safe scalar references like `payload?.analysisId` are allowed)
    - `Effect\.log.*galaxyJob\.stderr`
    - `Effect\.log.*galaxyJob\.stdout`
    - `Effect\.log.*galaxyDataset\.peek`
    - `Effect\.log.*galaxyDataset\.misc_blurb`
    - `Effect\.log.*,\s*stream\s*\)` (raw stream value or buffer passed as a log argument; `hasStream: stream !== null` is allowed)
    - `Effect\.logError\('task error',\s*error\)` or similar raw error object as the only context
    - `console\.(log|warn|error)` inside the sync files
    - `Effect\.log.*(GALAXY_API_KEY|SUPABASE_SERVICE_KEY|service_role|jwt|token)`

    Review any test snapshots for the sync path and redact or truncate captured error messages, dataset metadata, or response bodies so that no secret or dataset content is persisted.
    If the scan finds any violations, fix them in the same task by removing the forbidden field from the log call or replacing it with an allowlisted scalar.
  </action>
  <acceptance_criteria>
    - The static scan returns zero matches for all forbidden patterns in the five sync files and related test/snapshot files.
    - `pnpm --filter ./packages/nuxt-galaxy test` passes (use `pnpm --filter ./packages/nuxt-galaxy vitest run --pool=threads` if the default forks pool fails).
    - `pnpm --filter ./packages/nuxt-galaxy typecheck` passes.
  </acceptance_criteria>
  <verify>
    <automated>
      cd packages/nuxt-galaxy && \
      patterns=(
        "Effect\\.log.*,\\s*payload\\s*\\)"
        "Effect\\.log.*galaxyJob\\.stderr"
        "Effect\\.log.*galaxyJob\\.stdout"
        "Effect\\.log.*galaxyDataset\\.peek"
        "Effect\\.log.*galaxyDataset\\.misc_blurb"
        "Effect\\.log.*,\\s*stream\\s*\\)"
        "Effect\\.logError\\('task error',\\s*error\\)"
        "console\\.(log|warn|error)"
        "Effect\\.log.*(GALAXY_API_KEY|SUPABASE_SERVICE_KEY|service_role|jwt|token)"
      ) && \
      scan_files=() && \
      for f in src/runtime/server/tasks/galaxy/sync-analyses.ts src/runtime/server/utils/grizzle/sync/*.ts; do [ -f "$f" ] && scan_files+=("$f"); done && \
      while IFS= read -r -d '' f; do
        case "$f" in
          */.nuxt/*|*/node_modules/*|*/.output/*|*/dist/*) continue ;;
        esac
        scan_files+=("$f")
      done < <(find src -type f \( -name '*.ts' -o -name '*.snap' \) -print0 2>/dev/null) && \
      while IFS= read -r -d '' f; do
        case "$f" in
          */.nuxt/*|*/node_modules/*|*/.output/*|*/dist/*) continue ;;
        esac
        scan_files+=("$f")
      done < <(find test -type f \( -name '*.ts' -o -name '*.snap' \) -print0 2>/dev/null) && \
      for p in "${patterns[@]}"; do
        matches=$(grep -n -E "$p" "${scan_files[@]}" 2>/dev/null || true)
        if [ -n "$matches" ]; then echo "PATTERN $p:"; echo "$matches"; exit 1; fi
      done && \
      pnpm vitest run --pool=threads
    </automated>
  </verify>
  <done>
    No Galaxy API keys, Supabase service keys, JWTs, dataset contents, or full error objects are logged in the sync path or its tests.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Effect program -> evlog-effect.ts bridge | Untrusted/error-bearing values cross from sync logic into the logging bridge; the bridge must not leak secrets from error messages or annotations. |
| taskLog.emit -> wide-event drain | Finalizer outcome crosses from the scheduled task into persistent/observable storage; must not include raw payloads or secrets. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-07-01 | Information Disclosure | sync-analyses.ts, analysis.ts, job.ts, output.ts, lock.ts | high | mitigate | Enforce D-04 allowlist: log only scalar identifiers, states, counts, durations, and sanitized messages. Never log raw Galaxy responses, dataset streams, full stderr/stdout, dataset peek content, or full error objects. Use evlog's configured redaction as a safety net. Verify with the static scan in Task 3. |
| T-07-02 | Information Disclosure | taskLog.emit finalizer in sync-analyses.ts | high | mitigate | Emit only the D-03 shape (`status`, `synced`, `failed`, `skipped`, `durationMs`, `errors[].{analysisId,message}`). Truncate each message to 500 characters. Do not include stack traces, raw errors, or payload objects. |
| T-07-03 | Information Disclosure | Effect annotations in child effects (job.ts, output.ts) | medium | mitigate | Merge parent trace IDs with child-specific IDs via `Effect.annotateLogs`; never replace the full context with only child IDs, which could make cross-cutting trace reconstruction impossible but does not directly leak data. Review annotations for accidental secret inclusion. |
</threat_model>

<verification>
- `pnpm --filter ./packages/nuxt-galaxy typecheck` passes after Tasks 1 and 3.
- `pnpm --filter ./packages/nuxt-galaxy lint` passes after Task 2.
- `pnpm --filter ./packages/nuxt-galaxy vitest run --pool=threads` passes after Task 3.
- Static scan in Task 3 returns zero matches for forbidden secret/sensitive patterns in sync files and tests.
- Every `Effect.annotateLogs` call in the modified sync files references the six trace ID keys.
- `taskLog.emit` is called exactly once in sync-analyses.ts and passes `status`, `synced`, `failed`, `skipped`, `durationMs`, and `errors`.
</verification>

<success_criteria>
- The canonical sync path emits structured `Effect.logInfo`, `Effect.logDebug`, or `Effect.logError` at task start/end, lock acquire/release, invocation fetch, state transition, dataset download/upload, and all error paths (OBSERVE-01).
- All sync logs carry flat top-level `analysisId`, `ownerId`, `galaxyInvocationId`, `historyId`, `jobId`, and `datasetId` fields, using `null` when an ID is not yet known (OBSERVE-02).
- The scheduled task finalizer emits `taskLog.emit` exactly once per run with `status`, `synced`, `failed`, `skipped`, `durationMs`, and an `errors` array on every exit path (OBSERVE-03).
- A static scan and test snapshot review confirm that no Galaxy API keys, Supabase service keys, JWTs, or dataset contents are logged in sync paths or tests (OBSERVE-04).
</success_criteria>

<output>
Create `.planning/phases/07-standardize-evlog-traces/07-01-SUMMARY.md` when done.
</output>

## Artifacts this phase produces

This phase modifies existing functions and documentation; it does not introduce new exported symbols or CLI flags.

- **Updated log calls and annotations in:**
  - `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` — structured `Effect.logInfo`/`Effect.logDebug`/`Effect.logError` calls (with `yield*`) and a single `taskLog.emit` finalizer with the D-03 wide-event shape.
  - `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` — six-ID `Effect.annotateLogs` and boundary logs at invocation fetch, state derivation, analysis update, monitoring update, history update, and error paths.
  - `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts` — `Effect.logDebug` at lock acquire/release boundaries and six-ID `Effect.annotateLogs`.
  - `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts` — six-ID `Effect.annotateLogs` and boundary logs at job sync start/complete/error paths.
  - `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts` — `Effect.logDebug` replacements for ad-hoc `[sync-output]` logs and six-ID annotations.
- **Updated documentation:**
  - `.planning/LOGGING-SPEC.md` — new `## Sync trace field allowlist` section documenting allowed and forbidden sync trace fields.
- **New planning artifact:**
  - `.planning/phases/07-standardize-evlog-traces/07-COVERAGE.md` — declaration that this phase introduces no new external API integration.
