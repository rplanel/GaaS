---
phase: 13-write-path-integrity
plan: 02
subsystem: database
tags: [drizzle, effect, grizzle, analysis-monitoring, delete-path, transaction, finalize]

requires:
  - phase: 13-write-path-integrity (13-01)
    provides: create-path snapshot + canonical monitoring helper on the same grizzle files
provides:
  - Delete path finalizes a stranded `pending` analysis_monitoring row to `cancelled` with `completed_at` set (WRIT-02)
  - `finalizeAnalysisMonitoringEffect` pending-guarded helper (analysisId + ownerId locator) returning the row or `undefined` on a 0-row no-op
  - `deleteAnalysis` runs finalize + delete in one transaction after a successful Galaxy history delete
affects: [14-stats-queries, 15-api-endpoints]

actuals:
  tokens: 4244      # chars/4 over the realized diff (16,976 chars) of the 3 changed files
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Delete-time finalization: a pending-guarded UPDATE (outcome='pending' as the sole concurrency gate) transitions a terminated analysis_monitoring row, run on the same transaction client as the sibling DELETE and entered only after the external Galaxy delete succeeds"

key-files:
  created: []
  modified:
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts
    - packages/nuxt-galaxy/test/server/utils/grizzle/analyses.test.ts

key-decisions:
  - "finalizeAnalysisMonitoringEffect requires a tx client (never yields Drizzle) so it can only run inside an existing transaction, keeping finalize + delete atomic (D-07)"
  - "The delete-time finalize is located by analysisId + ownerId with an outcome='pending' predicate: a real success/error written by the sync task is never overwritten to cancelled (D-09)"
  - "The finalize UPDATE runs before the analyses DELETE inside the same transaction, while analysis_id is still set (D-08: the ON DELETE SET NULL FK would null it after the delete)"
  - "The evlog 'monitoring outcome finalized' line fires only when a row was actually finalised, mirroring the sync task's 'monitoring outcome updated' (a no-op stays silent)"

requirements-completed: [WRIT-02]

coverage:
  - id: D1
    description: "Deleting an analysis finalizes a stranded pending monitoring row to cancelled with completed_at set, guarded on outcome='pending' and located by analysisId + ownerId"
    requirement: WRIT-02
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analyses.test.ts#finalizes only a pending row, guarded by outcome + analysisId + ownerId (D-08/D-09)"
        status: pass
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analyses.test.ts#should finalize the monitoring row instead of deleting it (migration-survival intent)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The finalize UPDATE and the analyses DELETE commit/roll back atomically in one transaction, executed only after the Galaxy history delete succeeds; a Galaxy-delete failure finalizes and deletes nothing"
    requirement: WRIT-02
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analyses.test.ts#does not finalize or delete when the Galaxy history delete fails (D-07, transaction unreached)"
        status: pass
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analyses.test.ts#should delete Galaxy history then finalize monitoring and delete the DB record in one transaction"
        status: pass
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analyses.test.ts#runs the finalize on the transaction client, not the root mock (distinct tx, D-04/D-07)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The finalize runs before the delete (while analysis_id is set) and never overwrites a real terminal outcome; 0-row matches are a silent no-op returning undefined, not a count"
    requirement: WRIT-02
    verification:
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analyses.test.ts#runs the finalize UPDATE before the analyses DELETE inside the same transaction (D-08)"
        status: pass
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analyses.test.ts#never overwrites a real terminal outcome (success) with cancelled (D-09)"
        status: pass
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analyses.test.ts#returns undefined (not a numeric count) when the pending-guarded update matches 0 rows"
        status: pass
      - kind: unit
        ref: "packages/nuxt-galaxy/test/server/utils/grizzle/analyses.test.ts#treats a 0-row finalize match as a no-op and still deletes the analysis without throwing"
        status: pass
    human_judgment: false

# Metrics
duration: 36min
completed: 2026-08-10
status: complete
---

# Phase 13 Plan 2: Write Path Integrity — Delete-Path Finalization Summary

**The analysis delete path now finalizes a stranded `pending` analysis_monitoring row to `cancelled` (with `completed_at` set), pending-guarded on `outcome='pending'` and located by `analysisId` + `ownerId`, running in the same DB transaction as the `analyses` DELETE and only after a successful external Galaxy history delete — so usage statistics never count phantom `pending` rows, while the sync task remains the sole terminal-state writer for all non-delete transitions (WRIT-02).**

## Performance

- **Duration:** 36 min
- **Started:** 2026-08-10T17:44:29Z
- **Completed:** 2026-08-10T18:20:34Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- **`finalizeAnalysisMonitoringEffect(analysisId, ownerId, tx)`** added to `analysisMonitoring.ts` — a pending-guarded UPDATE (`outcome = 'pending'` D-09, `analysisId` + `ownerId` locator D-08) setting `outcome: 'cancelled'` + `completedAt`. Accepts a **required** `tx` client (never `yield* Drizzle`), returns the updated row (`{ updatedId }`) or `undefined` on a 0-row no-op via `takeUniqueOrThrow`. Errors caught into a new `FinalizeAnalysisMonitoringError`.
- **`deleteAnalysis`** reworked in `analyses.ts` — after `bt.deleteHistoryEffect` succeeds (D-07, outside the DB transaction so a Galaxy failure finalizes nothing), it enters one `useDrizzle.transaction` that first calls the finalize helper then the `analyses` DELETE, ordering the finalize before the delete while `analysis_id` is still set (D-08). Any failure bubbles as `DeleteAnalysisError` and rolls back the whole transaction. Emits `monitoring outcome finalized` via `Effect.logInfo` in the deleteAnalysis Effect scope only when a row was actually finalised.
- **Test suite** reworked + expanded (deleteAnalysis describe block; targeted files 53 → 64 tests green): finalize-guard WHERE `eq` assertions, no-op `undefined` (not a count) semantics, ordered-before-delete, guard-against-overwrite for a `success` row, Galaxy-failure no-finalize (transaction unreached), and distinct-`tx` usage.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): Add pending-guarded `finalizeAnalysisMonitoringEffect` and wire it into `deleteAnalysis`'s one transaction** - `d7128838b7` (feat)
2. **Task 2: Expand delete-path tests for finalize guard, ordering, no-op semantics, and Galaxy-failure gating** - `31364c58c5` (test)

**Plan metadata:** committed with this SUMMARY + STATE/ROADMAP/REQUIREMENTS updates (docs commit).

## Files Created/Modified

- `src/runtime/server/utils/grizzle/analysisMonitoring.ts` - Added `FinalizeAnalysisMonitoringError` + `finalizeAnalysisMonitoringEffect` (pending-guarded, `analysisId`+`ownerId`, uses passed `tx`, returns row or `undefined`).
- `src/runtime/server/utils/grizzle/analyses.ts` - `deleteAnalysis` now runs finalize + delete in one `useDrizzle.transaction` after the Galaxy delete; emits `monitoring outcome finalized` on a real finalize; calls the canonical helper (DRY).
- `test/server/utils/grizzle/analyses.test.ts` - Reworked the deleteAnalysis suite + 8 new/updated tests covering guard, ordering, no-op, overwrite-protection, Galaxy gating, and distinct-tx.

## Decisions Made

- The finalize helper mandates a required `tx` and never yields `Drizzle`, so it can only be invoked from inside an existing transaction — this is what keeps the finalize + delete atomic (D-07).
- `outcome = 'pending'` is the sole concurrency gate (D-09): the sync task remains the only writer able to reach real terminal outcomes; deletion can only transition a row that is still `pending`.
- Finalize runs before the delete so `analysis_id` is still present (D-08), else the `ON DELETE SET NULL` FK would null it and strand the row.
- Oracle of truth for the finalize wiring: the MEDIUM-interop and Plan-2-example review findings — call the shared helper (DRY single pending-guard), order finalize before delete, and keep the Galaxy delete outside the DB transaction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Galaxy-failure test error-type expectation was inaccurate**
- **Found during:** Task 2 (Galaxy-failure no-finalize acceptance criterion)
- **Issue:** The plan's Task 2 action text said to assert `deleteAnalysis` fails with `DeleteAnalysisError` on a Galaxy-delete failure. But `bt.deleteHistoryEffect` sits *before* the `Effect.tryPromise` that catches into `DeleteAnalysisError`, so on Galaxy failure it propagates a blendtype `HistoryError`, never `DeleteAnalysisError`. Asserting `DeleteAnalysisError` would make the test fail/red.
- **Fix:** Asserted generic failure propagation (`expectFailure`) plus the WRIT-02-relevant behavior: the transaction is never entered and neither the finalize update nor the analyses delete is invoked, leaving the monitoring row untouched (D-07). This matches the plan's own research A1 ("transaction unreachable on Galaxy failure regardless of error tag") and the Task 2 acceptance criterion ("asserts no finalize/delete when `deleteHistoryEffect` throws").
- **Files modified:** `test/server/utils/grizzle/analyses.test.ts`
- **Verification:** Galaxy-failure test passes; full suite green.
- **Committed in:** `31364c58c5` (Task 2 commit)

### Tracer Gate

Task 1 was a `type="tracer"`. The tracer feedback gate was presented as a `checkpoint:human-verify` after commit `d7128838b7`; the user **approved** it before Task 2 (expansion) began.

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** The fix aligns the test with the actual error-propagation contract; no scope creep, WRIT-02 behavior unchanged.

## Issues Encountered

- None beyond the single deviation above. `pnpm vitest run ... --config vitest.config.server.ts` (matching the project's `test:server` script) was used for targeted server tests per the 13-01-established config fix; the plan's literal `pnpm vitest run test/server/...` would skip server tests under the default config.

## User Setup Required

None - no external service configuration required and no new packages added (T-13-02-SC accepted).

## Next Phase Readiness

- WRIT-02 satisfied: delete finalizes stranded `pending` rows to `cancelled`, guarded on `pending`, located by `analysisId` + `ownerId`, atomic with the analyses delete, gated after a successful Galaxy delete, and never overwrites a real terminal outcome. The sync task remains the sole terminal writer for all non-delete transitions.
- Full `pnpm test` green (64 client + 260 server, 3 skipped) and `pnpm typecheck` green; the existing sync pending-guard test (`sync/analysis.test.ts`) remains green as the concurrency-gate reference.
- Downstream **Phase 14** (stats queries) now reads accurate terminal outcomes — no phantom `pending` counts from deleted analyses.

---

*Phase: 13-write-path-integrity*
*Completed: 2026-08-10*

## Self-Check: PASSED

- All 3 modified files verified present on disk (`[ -f ]`).
- Task commits verified in git: `d7128838b7`, `31364c58c5`.
- Full package verification: `pnpm test` (64 client + 260 server, 3 skipped) green; `pnpm typecheck` green.
