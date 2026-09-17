---
phase: 12-schema-survival-columns
verified: 2026-08-10T17:45:00Z
status: passed
score: 6/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: null
gaps: []
deferred: []
behavior_unverified_items: []
human_verification: []
---

# Phase 12: Schema Survival Columns — Verification Report

**Phase Goal:** The `analysis_monitoring` schema carries the durable fields and indexes that make per-workflow and trend statistics survive workflow deletion.
**Verified:** 2026-08-10T17:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | The `analysis_monitoring` Drizzle schema exposes three nullable snapshot fields (`workflowName` varchar(256), `galaxyWorkflowId` varchar(256), `workflowVersion` varchar(255)) with no `.notNull()`, and all four RLS `pgPolicy()` entries plus the three existing indexes remain untouched | ✓ VERIFIED | `src/runtime/server/db/schema/galaxy/analysisMonitoring.ts:38-44` declares the three varchars with no `.notNull()`; `git show 60b6f4c712 -- analysisMonitoring.ts` diff is **purely additive** (only `+` lines, no `-` lines) — existing columns, the 3 prior indexes, uniqueIndex, and 4 policies unchanged |
| 2   | The generated migration SQL contains exactly three ADD COLUMN statements (`workflow_name`/`galaxy_workflow_id`/`workflow_version`) and exactly two CREATE INDEX statements `idx_analysis_monitoring_owner_workflow` (`owner_id`,`workflow_id`) and `idx_analysis_monitoring_owner_started_at` (`owner_id`,`started_at`) | ✓ VERIFIED | `migration.sql:1-3` are the 3 ADD COLUMN, `:4-5` the 2 CREATE INDEX with exact names. `grep -c "ADD COLUMN"` = 3, `grep -c "CREATE INDEX"` = 2 (confirmed exact, no extra statements) |
| 3   | The same migration SQL contains an idempotent backfill UPDATE that inner-joins `galaxy.workflows` on `am.workflow_id = w.id`, uses COALESCE for each of the three snapshot fields from `w.name`/`w.galaxy_id`/`w.version_key`, guards with IS NULL so re-runs/Phase-13 writes are never clobbered, and does not reference `galaxy.api`/`galaxy.invocation` | ✓ VERIFIED | `migration.sql:6-13` the backfill `UPDATE galaxy.analysis_monitoring am ... FROM galaxy.workflows w WHERE am.workflow_id = w.id AND (... IS NULL OR ...)` with per-column `COALESCE(am.<col>, w.<src>)`; no `.api`/`.invocation` reference |
| 4   | `analysisMonitoring.test.ts` contains assertions for the migration DDL, the backfill shape, and the three nullable schema fields, and the targeted vitest run passes | ✓ VERIFIED | `test/.../analysisMonitoring.test.ts:100-143` has the three survival-column blocks (DDL regex 100-115, backfill regex + negative api/invocation guard 117-135, nullable schema exposure 137-143). Targeted run: 6 passed (3 new + 3 pre-existing) |
| 5   | `src/runtime/types/database.ts` regenerated and exposes `workflow_name`, `galaxy_workflow_id`, `workflow_version` as nullable `string \| null` columns | ✓ VERIFIED | `database.ts:143/150/151` (Row), `158/165/166` (Insert), `173/180/181` (Update) all type the three columns `string \| null` |
| 6   | `pnpm typecheck` passes with the regenerated types (schema-push / success criterion 4 / D-11) | ✓ VERIFIED | `pnpm typecheck` (vue-tsc module + playground) exit 0 |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected    | Status | Details |
| -------- | ----------- | ------ | ------- |
| `src/runtime/server/db/schema/galaxy/analysisMonitoring.ts` | three nullable snapshot varchars + two named composites, existing preserved | ✓ VERIFIED | Additive-only diff confirmed via git; lengths 256/256/255 match backfill sources |
| `src/runtime/server/db/migrations/20260810152411_schema_survival_columns/migration.sql` | 3 ADD COLUMN + 2 CREATE INDEX + idempotent backfill | ✓ VERIFIED | plus `snapshot.json` present in migration folder |
| `test/server/db/schema/galaxy/analysisMonitoring.test.ts` | three survival-column assertion blocks | ✓ VERIFIED | all 6 tests pass |
| `src/runtime/types/database.ts` | three nullable `string \| null` snapshot columns | ✓ VERIFIED | Row/Insert/Update all type the columns as nullable |

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| Drizzle schema field names ↔ migration column names | camelCase `workflowName`/`galaxyWorkflowId`/`workflowVersion` ↔ snake_case `workflow_name`/`galaxy_workflow_id`/`workflow_version` | DDL + test regexes use snake_case; schema fields camelCase | WIRED | lengths match sources exactly |
| Drizzle index names ↔ migration `CREATE INDEX` | `idx_analysis_monitoring_owner_workflow` / `idx_analysis_monitoring_owner_started_at` | drizzle-kit emitted names; test greps exact strings | WIRED | migration content + test both confirmed |
| Backfill idempotency contract | backfill values ↔ `galaxy.workflows.name/galaxy_id/version_key` | COALESCE + IS NULL guard; no api/invocation | WIRED | is null + coalesce present; offline |
| Migration-apply → typegen ordering | migration → `database.ts` | typegen reads live DB | WIRED | database.ts reflects applied schema (nullable) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| SCHE-01 | 12-01, 12-02 | nullable `workflow_name`, `galaxy_workflow_id` snapshot columns so per-workflow stats survive deletion | ✓ SATISFIED | schema columns + database.ts nullable types |
| SCHE-02 | 12-01, 12-02 | composite indexes `(owner_id, workflow_id)` and `(owner_id, started_at)` | ✓ SATISFIED | two named CREATE INDEX in migration + schema |
| SCHE-03 | 12-01 | migration backfills snapshot columns from existing data without guessing historical outcomes | ✓ SATISFIED | idempotent offline backfill from local `workflows` |

All three phase requirement IDs (SCHE-01, SCHE-02, SCHE-03) are declared in plan frontmatter and satisfied. No orphaned requirements (traceability maps all three to Phase 12).

### Anti-Patterns Found

No debt markers (TBD/FIXME/XXX/placeholder) and no stub patterns found in the modified files.

### Review Findings Ruling (WR-01, WR-02)

The independent review (12-REVIEW.md) surfaced two WARNINGS (0 critical). Both are **advisory quality items, not must-have failures** — neither violates a must-have contract:

| Finding | Severity (review) | Ruling | Justification |
| ------- | ----------------- | ------ | ------------- |
| WR-01: backfill not delimited by `--> statement-breakpoint` after the CREATE INDEX, merging it into one executed chunk | Warning | **ADVISORY — not a must-have failure** | The must-have contract (truths 2/3) requires the two CREATE INDEX statements and the backfill to be *present*; it does not require breakpoint markers. The migrator runs the chunk as a single multi-statement query, and 12-02 applied it with exit 0 (no failure). This is a formatting/robustness convention deviation (couples the backfill to the preceding CREATE INDEX), tracked for improvement — no functional defect in the delivered artifacts. |
| WR-02: nullability test asserts `.notNull()` falsy only for `workflowVersion`, not all three | Warning | **ADVISORY — not a must-have failure** | The truth "three nullable fields with no `.notNull()`" (truth 1) is **verified directly from the schema source** — all three columns are declared without `.notNull()` (lines 42-44). The PLAN's own Test-C spec explicitly required `notNull`-falsy only on `workflowVersion` (12-01-PLAN.md:140); the test matches plan intent. The gap is test-coverage depth on the nullable contract, advisory — the underlying schema truth is independently confirmed. |

Both items are recommended hardening for the test-contract / migration-format conventions but do **not** block the phase goal. If the operator wishes to accept these deviations formally, they are documentation-level improvements; no must-have was missed.

### Gaps Summary

No blocking gaps. The phase goal — `analysis_monitoring` carrying the durable snapshot fields plus the per-workflow/trend indexes such that statistics survive workflow deletion — is fully achieved: schema, generated offline migration with idempotent backfill, regenerated nullable types, green migration test, and passing typecheck.

---

_Verified: 2026-08-10T17:45:00Z_
_Verifier: the agent (gsd-verifier)_
