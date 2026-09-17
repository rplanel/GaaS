# Phase 12: Schema & Survival Columns - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-10
**Phase:** 12-schema-survival-columns
**Areas discussed:** Snapshot semantics, Backfill orphan policy, Index & naming details, Migration strategy

---

## Snapshot Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Workflow display name + Galaxy workflow string ID | workflow_name = display name; galaxy_workflow_id = Galaxy string ID | |
| Workflow name + local workflow_id mirror | Eager-duplicate existing provenance fields | |
| You decide | Let researcher/planner determine mapping | |

**User's choice:** Free-text — emphasized workflow **version** matters: "I want to be able to differentiate between same workflow but different version."
**Notes:** This drove adding a third nullable snapshot column `workflow_version` (amends SCHE-01).

### Version representation
| Option | Description | Selected |
|--------|-------------|----------|
| Snapshot version as part of name string | Name like "RNA-Seq Pipeline (v3)" or rely on galaxy id | |
| Separate workflow_version snapshot column | Store version structurally | ✓ |
| Use workflow_id int + galaxy_workflow_id | No version column; rely on local + galaxy ids | |
| You decide | Let planner determine | |

**User's choice:** Add a separate `workflow_version` snapshot column.
**Notes:** Structural, not embedded in the display name.

### Version source
| Option | Description | Selected |
|--------|-------------|----------|
| version_key (human tag version) | User-facing version, e.g. "2", matches my-workflow-2 slug | ✓ |
| auto_version (Galaxy counter) | Galaxy's internal monotonic counter | |
| version_key, auto_version kept live | Human version snapshot + internal version reachable live | |
| You decide | Let researcher determine | |

**User's choice:** `version_key` (human tag version).
**Notes:** The version users actually think/reference in tags.

### Name NULL behavior
| Option | Description | Selected |
|--------|-------------|----------|
| Nullable, NULL = unknown | Unresolvable name stays NULL → "unknown" bucket | ✓ |
| Nullable but fallback marker | Explicit placeholder for absent name | |

**User's choice:** Nullable, NULL = unknown.
**Notes:** Aligns with Phase 14's planned explicit unknown bucket.

---

## Backfill Orphan Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Local join only, NULL if gone | Backfill purely from local workflows join; no Galaxy API, NULL when workflow already deleted | ✓ |
| Local join + Galaxy API fallback | Try resolving missing workflows live via API | |
| All-or-nothing per row | Only fill row's snapshot if all resolvable | |

**User's choice:** Local join only, NULL if gone.
**Notes:** Offline, deterministic, idempotent; rejects guessing historical outcomes (SCHE-03).

### Backfill granularity
| Option | Description | Selected |
|--------|-------------|----------|
| Per-column backfill | Fill each snapshot field independently; partial fills allowed | ✓ |
| All-or-nothing per row | Set all three only when all resolvable | |

**User's choice:** Per-column backfill.
**Notes:** Doesn't discard resolvable name/galaxy id because only version is missing.

---

## Index & Naming Details

| Option | Description | Selected |
|--------|-------------|----------|
| Two composites, keep existing | Exactly (owner_id, workflow_id) + (owner_id, started_at); keep 3 existing indexes | ✓ |
| Add version-aware index too | Also index snapshot/version for Phase 14 breakdowns | |
| You decide | Let planner decide full index set | |

**User's choice:** Two composites, keep existing.

### Column types
| Option | Description | Selected |
|--------|-------------|----------|
| Match workflow table lengths | varchar(256)/varchar(256)/varchar(255) | ✓ |
| text for workflow_name | Avoid truncation, diverge from convention | |
| You decide | Let planner finalize | |

**User's choice:** Match workflow-table lengths.

---

## Migration Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| One migration, DDL then backfill | Add columns+indexes, drizzle-kit generate, append backfill UPDATE, regen types | ✓ |
| Two migrations (schema + backfill) | Separate additive schema and data migrations | |
| You decide | Let planner structure | |

**User's choice:** One migration, DDL then backfill.

### Test coverage
| Option | Description | Selected |
|--------|-------------|----------|
| Add schema+backfill migration tests | Assert ADD COLUMNs, composites, backfill join, nullable fields, types compile | ✓ |
| Minimal test additions | Rely on type regen + existing suite | |

**User's choice:** Add schema+backfill migration tests.
**Notes:** Mirrors existing analysisMonitoring.test.ts migration assertion pattern.

---

## the agent's Discretion

None — all four discussed areas were resolved explicitly. Agent retained latitude only on mechanical details (exact index names, migration SQL shape, idempotency guards).

## Deferred Ideas

- **Galaxy API fallback during backfill** — rejected; offline deterministic migration preferred. Revisit only as a future phase.
- **Version-aware index / snapshot-column index** — deferred to Phase 14 if the query layer needs it.
