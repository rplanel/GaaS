---
phase: 06-audit-and-freeze-the-sync-contract
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/06-audit-and-freeze-the-sync-contract/06-SYNC-CONTRACT.md
  - docs/content/2.concepts/2.sync-contract.md
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/histories.ts
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/jobs.ts
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/input.ts
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/output.ts
autonomous: false
requirements:
  - AUDIT-01
  - AUDIT-02
  - AUDIT-03
user_setup: []
estimate:
  tokens: 50000
  raw_tokens: 25000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - Every legacy synchronize*Effect definition and remaining call site is marked with `// LEGACY-SYNC: remove in Phase 8` and inventoried with status dead/redirected/running plus mutated tables.
    - The canonical server-driven sync contract document captures inputs, outputs, lock semantics, TTL rationale, PAGE_SIZE, terminal-state rules, and a Mermaid sequence diagram.
    - The evlog trace audit report contains at least three concrete gaps with file and line references.
    - The contract document is mirrored under `docs/content/2.concepts/2.sync-contract.md`.
    - A user sign-off checkpoint is recorded before any Phase 8 code changes.
  artifacts:
    - .planning/phases/06-audit-and-freeze-the-sync-contract/06-SYNC-CONTRACT.md
    - docs/content/2.concepts/2.sync-contract.md
    - LEGACY-SYNC comments in packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts
    - LEGACY-SYNC comments in packages/nuxt-galaxy/src/runtime/server/utils/grizzle/histories.ts
    - LEGACY-SYNC comments in packages/nuxt-galaxy/src/runtime/server/utils/grizzle/jobs.ts
    - LEGACY-SYNC comments in packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/input.ts
    - LEGACY-SYNC comments in packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/output.ts
  key_links:
    - galaxy:sync-analyses task -> syncAnalysisEffect -> syncJobEffect -> syncOutputDatasetEffect -> acquireSyncLock/releaseSyncLock -> runTaskEffect/evlogEffectLogger
    - Legacy helpers isolated in packages/nuxt-galaxy/src/runtime/server/utils/grizzle/ and reachable only from synchronizeAnalysesEffect and test mocks.
---

<objective>
Audit the current Galaxy analysis sync workflow, freeze the canonical server-driven sync contract in a written document, inventory and mark every legacy `synchronize*Effect` helper, and document concrete evlog trace gaps. This phase produces documentation and lightweight code comments only; schema changes, lock rewrites, retry logic, and deletion of legacy helpers are explicitly deferred to Phase 7/8.

Purpose: Give Phase 8 a locked reference for the desired sync behavior and a clean list of legacy code to remove, while surfacing observability gaps for Phase 7.
Output: `06-SYNC-CONTRACT.md`, its mirror in `docs/content/2.concepts/2.sync-contract.md`, and `// LEGACY-SYNC: remove in Phase 8` comments at legacy sync sites.
</objective>

<execution_context>
@/home/rplanel/.config/opencode/gsd-core/workflows/execute-plan.md
@/home/rplanel/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/STATE.md
@.planning/LOGGING-SPEC.md
@.planning/phases/06-audit-and-freeze-the-sync-contract/06-CONTEXT.md
@.planning/phases/06-audit-and-freeze-the-sync-contract/06-PATTERNS.md
</context>

## Unresolved Probe Assumptions

The spec-less probe report lists five unresolved edge probes for AUDIT-01/AUDIT-02/AUDIT-03. This plan treats them as manual-review assumptions:

- **Adjacency (AUDIT-01):** When two sync helpers are equal/overlapping in responsibility, the inventory will classify whether the legacy helper is superseded by a canonical one (redirected) rather than merged.
- **Empty/single-element input (AUDIT-01):** The inventory will explicitly note when a legacy helper has zero external callers (dead) or a single caller, and when the scheduled task receives no payload (full batch) versus a single `analysisId`.
- **Ordering (AUDIT-01):** The inventory table will preserve source-file order and mark the call graph direction so equal-status entries remain stable.
- **Unclassified (AUDIT-02/AUDIT-03):** These are manual review items; the contract and gap sections are produced by direct code inspection and, where available, a sample of `.evlog/logs` events.

## Locked Decisions

- D-01: Single sync contract document + inline comments. Implemented by Task 1 and Task 2.
- D-02: Contract includes a Mermaid sequence diagram and is mirrored under `docs/content/2.concepts/`. Implemented by Task 1 and Task 2.
- D-03: Legacy Drizzle helpers remain in place during Phase 6 and are listed as "to be removed in Phase 8". Implemented by Task 2.
- D-04: Small observability-only fixes without behavior change may be applied during the audit. Task 2 is authorized to make these case by case.
- D-05: The contract is frozen after user review; Phase 8 code changes require an explicit ACK. Implemented by Task 3.

<tasks>

<task type="tracer">
  <name>Tracer: Freeze the canonical server-driven sync contract</name>
  <files>.planning/phases/06-audit-and-freeze-the-sync-contract/06-SYNC-CONTRACT.md</files>
  <read_first>
    - packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts
    - packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts
    - packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/syncLocks.ts
    - packages/nuxt-galaxy/src/module.ts
  </read_first>
  <action>
    Trace the canonical server-driven sync path end-to-end, from the `galaxy:sync-analyses` Nitro scheduled task through `syncAnalysisEffect`, `syncJobEffect`, `syncOutputDatasetEffect`, lock helpers, and the evlog bridge. Create `06-SYNC-CONTRACT.md` (per D-01 and D-02) with a "Canonical server-driven sync contract" section that documents:
    - Operation `galaxy:sync-analyses`, its cron schedule from `module.ts`, payload shape `{ analysisId?: number }`, and task-level result shape `{ synced, failed, skipped, error? }`.
    - The exact call chain and the Galaxy layer (`useGalaxyLayer`) and service-role Supabase client (`createServiceRoleSupabaseClient`) injected at the task boundary.
    - Inputs/outputs of `syncAnalysisEffect`, `syncJobEffect`, and `syncOutputDatasetEffect`, including mutated tables (`analyses`, `histories`, `jobs`, `datasets`, `analysis_outputs`, `analysis_monitoring`, `storage.objects`).
    - Lock semantics: `acquireSyncLock` read-delete-insert flow, hard-coded `ttlSeconds = 900`, unique `analysis_id` constraint, and the non-atomic race window between the select and insert.
    - Paging rules: `PAGE_SIZE = 20`, ordering by `id`, filter on `is_sync.eq.false` or `state.in.(new,requires_materialization,ready,scheduled,cancelling)`.
    - Terminal-state rules: `isInvocationTerminalState`, jobs-summary derived outcome mapping via `deriveInvocationOutcomeFromJobsSummary`, `is_sync` flag setting, and history state update to `ok`/`running`.
    - Error handling: per-analysis `Effect.tapError` + `Effect.match`, top-level `Effect.catchAll`, and `taskLog.emit({ status })`.
    - evlog integration: `runTaskEffect`, `evlogEffectLogger`, severity mapping, and `Effect.annotateLogs({ analysisId: String(analysisId) })`.
    Add a Mermaid `sequenceDiagram` showing the happy path from scheduled task through lock acquire, Galaxy invocation fetch, job/output sync, terminal state, lock release, and task summary emit. Do not modify any production code in this task.
  </action>
  <verify>
    <automated>
      test -f .planning/phases/06-audit-and-freeze-the-sync-contract/06-SYNC-CONTRACT.md \
        && grep -q 'sequenceDiagram' .planning/phases/06-audit-and-freeze-the-sync-contract/06-SYNC-CONTRACT.md \
        && grep -q 'Canonical server-driven sync contract' .planning/phases/06-audit-and-freeze-the-sync-contract/06-SYNC-CONTRACT.md \
        && grep -q 'syncAnalysisEffect' .planning/phases/06-audit-and-freeze-the-sync-contract/06-SYNC-CONTRACT.md
    </automated>
  </verify>
  <done>The canonical contract document exists and contains the operation, call chain, inputs/outputs, lock/TTL/batch/terminal-state rules, and a sequence diagram.</done>
  <acceptance_criteria>`06-SYNC-CONTRACT.md` is created with the canonical contract section and sequence diagram; no source files are modified in this task.</acceptance_criteria>
</task>

<task type="auto">
  <name>Inventory legacy sync helpers, add LEGACY-SYNC comments, and audit evlog trace gaps</name>
  <files>
    .planning/phases/06-audit-and-freeze-the-sync-contract/06-SYNC-CONTRACT.md
    docs/content/2.concepts/2.sync-contract.md
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/histories.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/jobs.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/input.ts
    packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/output.ts
  </files>
  <read_first>
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/histories.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/jobs.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/input.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/output.ts
    - packages/ui/app/pages/analyses/[analysisId].vue
  </read_first>
  <action>
    Per D-01, D-03, D-04, and D-05:
    - Inventory every legacy `synchronize*Effect` definition and every remaining call site in `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/`. For each row record: helper name, `file:line`, callers, status (`dead` if no callers outside tests/mocks, `redirected` if superseded by a canonical helper, `running` if still invoked from a live code path), and tables/data mutated (e.g., `analyses`, `histories`, `jobs`, `datasets`, `analysis_inputs`, `analysis_outputs`, `storage.objects`).
    - Add `// LEGACY-SYNC: remove in Phase 8` on the line immediately before each legacy function definition and before each internal call site that references a legacy helper. Do not add comments to test files.
    - Search `packages/ui`, `packages/wiki`, and `playground` for any direct Galaxy sync triggers, polling, or calls to `syncAnalysisEffect` / `galaxy:sync-analyses`. Record findings in the inventory; expected result is none (display-only Realtime refresh on `[analysisId].vue`).
    - Populate the "Legacy sync inventory" table in `06-SYNC-CONTRACT.md` with the collected rows.
    - Audit the current canonical sync path for evlog trace gaps. Identify at least three concrete gaps with `file:line` references, for example: missing structured log when `acquireSyncLock` returns false due to a held lock; `syncOutputDatasetEffect` partial upload path lacking a compensating log before/after `updateStorageObjectOwner`; Galaxy fetch errors that carry only the message string without `galaxyInvocationId`; missing annotation of `ownerId` or `historyId` in child-effect logs; top-level `catchAll` not emitting `durationMs` or `skipped` in `taskLog.emit`. Add these to the "evlog trace audit gaps" section of `06-SYNC-CONTRACT.md`.
    - Mirror the completed `06-SYNC-CONTRACT.md` to `docs/content/2.concepts/2.sync-contract.md` with docs-compatible frontmatter (`title`, `description`) and relative links preserved.
    - If during the audit you find small observability-only fixes that carry no behavior change (e.g., adding an annotation, clarifying an error message), apply them per D-04. Do not make schema changes, lock rewrites, helper deletions, or retry logic changes.
  </action>
  <verify>
    <automated>
      TAG_COUNT=$(grep -rhc '// LEGACY-SYNC: remove in Phase 8' packages/nuxt-galaxy/src/runtime/server/utils/grizzle/ --include='*.ts' | awk '{s+=$1} END {print s}') \
        && test "$TAG_COUNT" -ge 8 \
        && grep -q 'Legacy sync inventory' .planning/phases/06-audit-and-freeze-the-sync-contract/06-SYNC-CONTRACT.md \
        && grep -q 'evlog trace audit gaps' .planning/phases/06-audit-and-freeze-the-sync-contract/06-SYNC-CONTRACT.md \
        && GAP_COUNT=$(grep -c '^### Gap' .planning/phases/06-audit-and-freeze-the-sync-contract/06-SYNC-CONTRACT.md || true) \
        && test "$GAP_COUNT" -ge 3 \
        && test -f docs/content/2.concepts/2.sync-contract.md \
        && grep -q 'title:' docs/content/2.concepts/2.sync-contract.md
    </automated>
  </verify>
  <done>All legacy helpers and call sites are tagged and inventoried; the client surface has no sync triggers; at least three evlog gaps are documented with file:line references; the docs mirror exists.</done>
  <acceptance_criteria>The inventory table is complete, the LEGACY-SYNC comment count matches the inventory rows, at least three concrete evlog gaps are documented, and the docs mirror is present with frontmatter.</acceptance_criteria>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Sign-off: frozen sync contract and audit findings</name>
  <files>
    .planning/phases/06-audit-and-freeze-the-sync-contract/06-SYNC-CONTRACT.md
    docs/content/2.concepts/2.sync-contract.md
  </files>
  <what-built>
    D-05 sign-off checkpoint. The `06-SYNC-CONTRACT.md` document and its docs mirror, containing:
    1. The canonical server-driven sync contract with inputs, outputs, lock semantics, TTL, batch size, terminal-state rules, and a Mermaid sequence diagram.
    2. The legacy sync inventory with `// LEGACY-SYNC: remove in Phase 8` tags and dead/redirected/running status.
    3. The evlog trace audit report with at least three concrete gaps.
  </what-built>
  <how-to-verify>
    - Open `.planning/phases/06-audit-and-freeze-the-sync-contract/06-SYNC-CONTRACT.md`.
    - Confirm the canonical contract accurately reflects `galaxy:sync-analyses` -> `syncAnalysisEffect` -> `syncJobEffect` -> `syncOutputDatasetEffect` and the lock helper flow.
    - Confirm every legacy `synchronize*Effect` helper and call site in `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/` is tagged with `// LEGACY-SYNC: remove in Phase 8`.
    - Confirm the client surface (`packages/ui`, `packages/wiki`, `playground`) has no direct sync triggers.
    - Confirm the evlog audit gaps are concrete and reference specific files/lines.
    - Confirm no schema changes, lock rewrites, helper deletions, or retry logic were introduced in this phase.
  </how-to-verify>
  <resume-signal>Type "approved" to freeze the contract and unlock Phase 8, or describe required changes.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client -> Supabase Realtime | Untrusted client receives display-only state refresh; no sync mutation crosses this boundary. |
| Scheduled task -> Galaxy API | Internal service-role task calls external Galaxy; API key must never be logged. |
| Scheduled task -> Supabase | Internal service-role task uses secret key; key and JWTs must never be logged. |
| Galaxy dataset -> Storage | Dataset bytes pass through sync path; content must never be logged. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-06-01 | Information Disclosure | evlog logs in sync paths/tests | high | mitigate | During the audit (Task 2), scan `sync-analyses.ts`, `sync/*.ts`, `evlog-effect.ts`, and related tests for logged Galaxy API keys (`apiKey`), Supabase service keys (`secretKey`, `serviceKey`), JWTs, and dataset blobs. Document redaction expectations in the contract; any findings are logged as gaps for Phase 7 (OBSERVE-04). |
| T-06-02 | Elevation of Privilege / Unauthorized trigger | Client-side sync triggers | high | mitigate | Inventory client pages/composables in `packages/ui`, `packages/wiki`, and `playground` (Task 2). Confirm `packages/ui/app/pages/analyses/[analysisId].vue` uses Supabase Realtime only for display refresh. Document in the contract that only the `galaxy:sync-analyses` scheduled task may mutate sync state. |
| T-06-03 | Tampering / Denial of Service | `sync_locks` acquisition | high | mitigate | Document the current read-delete-insert non-atomic window and the hard-coded 900-second TTL in the contract. Defer atomic upsert / configurable TTL to Phase 8 (REFACTOR-02). |
| T-06-04 | Repudiation | Missing sync trace logs | medium | mitigate | Identify at least three concrete evlog trace gaps (Task 2) and list them in the contract; deferred to Phase 7 (OBSERVE-01/02/03). |
| T-06-05 | Information Disclosure | Legacy Drizzle helpers still expose data paths | medium | accept | Legacy helpers are kept as reference per D-03 and are not exposed by live callers; removal is deferred to Phase 8 (REFACTOR-01). The inventory marks them dead/redirected. |
</threat_model>

<verification>
1. `06-SYNC-CONTRACT.md` exists and contains a Mermaid sequence diagram, canonical contract, legacy inventory, and evlog trace audit gaps.
2. `docs/content/2.concepts/2.sync-contract.md` is a mirror with docs frontmatter.
3. `grep -rh '// LEGACY-SYNC: remove in Phase 8' packages/nuxt-galaxy/src/runtime/server/utils/grizzle/ --include='*.ts'` returns at least 8 matches and the count matches the inventory rows.
4. `grep -c '^### Gap' 06-SYNC-CONTRACT.md` returns at least 3.
5. No modifications are made to schema files (`packages/nuxt-galaxy/src/runtime/server/db/schema/`) or to `sync_locks` helpers.
6. Run targeted lint on the touched package to ensure comment additions do not introduce lint errors:
   - `pnpm --filter ./packages/nuxt-galaxy lint`
7. Run docs typecheck to ensure the mirrored markdown does not break the docs build:
   - `pnpm --filter ./docs typecheck`
8. The human sign-off checkpoint in Task 3 is approved before Phase 8 begins.
</verification>

<success_criteria>
- `06-SYNC-CONTRACT.md` is created and approved, with a canonical server-driven sync contract, a Mermaid sequence diagram, a complete legacy sync inventory, and at least three concrete evlog trace gaps.
- Every legacy `synchronize*Effect` definition and remaining call site is marked with `// LEGACY-SYNC: remove in Phase 8`.
- The contract is mirrored to `docs/content/2.concepts/2.sync-contract.md`.
- No schema changes, lock rewrites, helper deletions, or retry logic are introduced.
- The user explicitly signs off on the frozen contract, satisfying D-05 and unlocking Phase 8.
</success_criteria>

<output>
Create `.planning/phases/06-audit-and-freeze-the-sync-contract/06-01-SUMMARY.md` when done.

Artifacts this phase produces:
- `.planning/phases/06-audit-and-freeze-the-sync-contract/06-SYNC-CONTRACT.md` — frozen sync contract, legacy inventory, and evlog trace audit report.
- `docs/content/2.concepts/2.sync-contract.md` — team-facing docs mirror.
- `// LEGACY-SYNC: remove in Phase 8` inline comments at legacy sync helper definitions and call sites in `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/`.
</output>
