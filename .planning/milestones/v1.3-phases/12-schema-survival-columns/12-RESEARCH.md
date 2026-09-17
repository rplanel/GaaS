# Phase 12: Schema & Survival Columns - Research

**Researched:** 2026-08-10
**Domain:** Database schema / drizzle-kit migration / Supabase type generation
**Confidence:** HIGH

## Summary

Phase 12 extends the existing `galaxy.analysis_monitoring` table with three durable, nullable snapshot columns (`workflow_name`, `galaxy_workflow_id`, `workflow_version`) plus the two SCHE-02 composite indexes, in a single drizzle-kit migration that also idempotently backfills the new columns from the local `workflows` table. It then regenerates `src/runtime/types/database.ts` and adds migration + schema tests mirroring `analysisMonitoring.test.ts`. It is a pure schema/DDL phase — no write path, no API, no new dependencies.

All conventions are captured in-repo and were verified this session by reading the actual source files: the table to extend (`analysisMonitoring.ts`), the backfill source (`workflows.ts`), the `galaxyItem` column conventions (`index.ts`), the drizzle configs, the package.json scripts, the nuxt-galaxy AGENTS.md migration rules, and the existing test's assertion pattern. The drizzle-kit generate workflow and its `--name`/`--config`/`--custom` flags were verified against the local CLI (`drizzle-kit generate --help`) and the official migrations docs. No web/Context7 provider was needed beyond confirming the generate workflow, and no new external package is installed by this phase.

**Primary recommendation:** Edit `analysisMonitoring.ts` (three nullable varchars + two named composite indexes), generate with `drizzle-kit generate --config drizzle.config.galaxy.ts --name schema_survival_columns`, append the idempotent `UPDATE ... FROM galaxy.workflows` backfill to the same `migration.sql`, run the migration against local Supabase, then `pnpm supabase:generate:types` and extend `analysisMonitoring.test.ts`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHE-01 | `analysis_monitoring` gains nullable `workflow_name` and `galaxy_workflow_id` snapshot columns so per-workflow stats survive workflow deletion | Amended by D-01 to add a third nullable `workflow_version` column. Column types/lengths verified against `analysisMonitoring.ts:32-36` (existing varchar(256) conventions) and `index.ts:14-18` (`galaxy_id`/`name` = varchar(256)). |
| SCHE-02 | Add composite indexes `(owner_id, workflow_id)` and `(owner_id, started_at)` for the per-workflow and trend queries | Via `index()` in the table config array, mirroring `analysisMonitoring.ts:40-41` (`idx_analysis_monitoring_owner_outcome` pattern). Drizzle generates `CREATE INDEX "..." ON "galaxy"."analysis_monitoring" ("owner_id","workflow_id")`. |
| SCHE-03 | A migration backfills the new snapshot columns from existing data where available without guessing historical outcomes | Idempotent `UPDATE ... FROM galaxy.workflows w WHERE am.workflow_id = w.id` per D-06/D-07; no Galaxy API, no guessing. Join source `workflows.name`/`galaxy_id`/`version_key` verified in `workflows.ts:16-18` and `index.ts:14-18`. |
</phase_requirements>

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Snapshot Semantics
- **D-01 (amends SCHE-01):** Add a third nullable snapshot column `workflow_version` alongside the planned `workflow_name` and `galaxy_workflow_id`. This is required so same-name / different-version workflows remain distinguishable after the workflow is deleted. — **Reversibility:** one-way — rationales: (1) adding a column later triggers another additive migration, (2) backfill of version history cannot be reconstructed if the upstream workflow is already gone.
- **D-02:** `workflow_name` = the workflow display name (sourced from `workflows.name`).
- **D-03:** `galaxy_workflow_id` = the Galaxy string identifier (sourced from `workflows.galaxy_id`).
- **D-04:** `workflow_version` is sourced from `workflows.version_key` (the human tag version, e.g. `"2"`, matching the `my-workflow-2` slug convention), **not** `auto_version` (Galaxy's internal counter).
- **D-05:** All three snapshot columns are nullable. An unresolvable `workflow_name` stays NULL, which surfaces as the "unknown" bucket in per-workflow stats (consistent with Phase 14's planned explicit unknown bucket for orphaned ids).

### Backfill Orphan Policy
- **D-06:** Backfill resolves snapshot fields purely from the LOCAL `workflows` table via the `analysis_monitoring.workflow_id → workflows.id` join. No Galaxy API calls during the migration, no guessing of historical outcomes. If the workflow was already deleted (no join match), leave the snapshot fields NULL. — **Reversibility:** reversible.
- **D-07:** Backfill is per-column: fill each of `workflow_name`, `galaxy_workflow_id`, `workflow_version` independently from the matching workflow row; only leave a field NULL where that specific field has no known source. Partial fills are allowed.

### Index & Naming
- **D-08:** Add exactly the two composite indexes SCHE-02 specifies: `(owner_id, workflow_id)` and `(owner_id, started_at)`. Keep all three existing indexes (`idx_analysis_monitoring_owner_outcome`, `idx_analysis_monitoring_outcome`, `idx_analysis_monitoring_galaxy_invocation_id`) untouched. — **Reversibility:** reversible.
- **D-09:** Column lengths match the workflow-table conventions: `workflow_name` = `varchar(256)`, `galaxy_workflow_id` = `varchar(256)`, `workflow_version` = `varchar(255)` (matches `version_key`/`name_key` length).

### Migration Strategy
- **D-10:** One migration, structured DDL-then-backfill: add the three nullable columns + two composite indexes in the schema, generate with drizzle-kit, then append the idempotent backfill `UPDATE` (join to `workflows`) in the same migration SQL. — **Reversibility:** reversible (migration can be re-run / inspected; additive and non-destructive).
- **D-11:** After migration, regenerate Supabase types (`src/runtime/types/database.ts`) so the extended schema compiles (success criterion 4).
- **D-12:** Add schema + backfill migration tests mirroring the existing `analysisMonitoring.test.ts` pattern: assert the migration SQL contains the ADD COLUMN statements for all three snapshot columns and the two composite indexes; assert the backfill `UPDATE` joins to `workflows` and only populates known values; assert the Drizzle schema exposes the three nullable fields.

### the agent's Discretion
None — all four discussed areas were resolved explicitly. Researcher/planner have latitude only on mechanical details (exact index names, precise migration SQL shape, backfill WHERE-clause idempotency guards) that do not change the decisions above.

### Deferred Ideas (OUT OF SCOPE)
- **Galaxy API fallback during backfill** (resolving recently-deleted workflows live): rejected for this phase and not carried forward — migration stays offline and deterministic. If ever needed, revisit as a future phase.
- **Version-aware index / snapshot-column index**: explicitly deferred — not required for the SCHE-02 queries; can be added in Phase 14 if the query layer needs it.

None else — discussion stayed within phase scope.
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Snapshot column definitions | SQL schema (galaxy schema) | — | Columns live on `galaxy.analysis_monitoring`; owned by the database schema layer |
| Composite indexes | SQL schema (galaxy schema) | Database / Storage | `(owner_id, workflow_id)` / `(owner_id, started_at)` serve query-layer lookups (Phase 14) |
| Backfill data migration | Database / Storage (migration SQL) | — | Runs as a migration against the DB; offline, deterministic, no network |
| Supabase type regeneration | Build-time codegen | — | `supabase gen types` writes `src/runtime/types/database.ts`; compilation gate |
| RLS policies | SQL schema | — | Existing policies untouched; new nullable columns automatically covered by them |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^1.0.0-beta.16 (catalog:) | Declarative Postgres schema (`varchar`, `index`) | Existing ORM for `schema/galaxy/*`; `analysisMonitoring.ts` already imports it |
| drizzle-kit | ^1.0.0-beta.16 (catalog:) (installed 1.0.0-rc.4) | Generate migrations from schema diff | `pnpm drizzle:generate` is the established migration generator (`package.json:62`); supports `--name`, `--config`, `--custom` |
| Supabase CLI | catalog: (installed 2.109.1) | Regenerate TypeScript DB types | `pnpm supabase:generate:types` writes `src/runtime/types/database.ts` (`package.json:61`) |
| Vitest | catalog:testing (^4.1.0) | Migration + schema tests | Existing test runner; `vitest.config.server.ts` includes `test/server/**/*.test.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| null | null | null | null |

*(No new supporting libraries — this phase adds no dependencies.)*

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Append backfill to generated migration | Separate `--custom` empty migration for the backfill | D-10 locks the backfill into the same migration; a separate custom migration adds a second file with no benefit |
| `drizzle.config.galaxy.ts` for generate | default `drizzle.config.ts` (galaxy_rbac + galaxy) | Galaxy-only config keeps the diff scoped to the changed schema and avoids noise if rbac is out of sync |

**Installation:** None — all tools are already in `packages/nuxt-galaxy/package.json` (drizzle-orm, drizzle-kit, supabase under devDependencies/catalog).

**Version verification:** `drizzle-kit generate --help` (v1.0.0-rc.4 installed) confirms `--name`, `--config`, `--custom`, `--breakpoints` flags [VERIFIED: local CLI]. Supabase CLI 2.109.1 installed [VERIFIED: local]. Node v24.12.0, pnpm 10.27.0 [VERIFIED: local].

## Package Legitimacy Audit

> This phase installs **no new external packages** — it only edits existing schema/types/tests and uses drizzle-kit, drizzle-orm, and the Supabase CLI that are already pinned in `packages/nuxt-galaxy/package.json`. Therefore no package-install legitimacy gate is required. The two tools exercised directly (`drizzle-kit`, `supabase`) are existing catalog/devDependencies, not new installs.

| Package | Registry | Verdict | Disposition |
|---------|----------|---------|-------------|
| drizzle-orm | npm (catalog: ^1.0.0-beta.16) | OK (existing) | Already installed — no gate |
| drizzle-kit | npm (catalog: ^1.0.0-beta.16) | OK (existing) | Already installed — no gate |
| supabase (CLI) | npm (catalog:) | OK (existing) | Already installed — no gate |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
[Drizzle schema typescript]
  src/runtime/server/db/schema/galaxy/analysisMonitoring.ts   (source of truth)
  ├─ add workflowName / galaxyWorkflowId / workflowVersion  (nullable varchar)
  └─ add index (ownerId, workflowId) + (ownerId, startedAt)
                          │
                          │  drizzle-kit generate --config drizzle.config.galaxy.ts --name schema_survival_columns
                          v
              migrations/{ts}_schema_survival_columns/
                ├─ snapshot.json
                └─ migration.sql  ──ADD COLUMN x3 + CREATE INDEX x2 (from diff)
                          │        └─ [+ appended idempotent UPDATE ... FROM galaxy.workflows]
                          │
                          │  apply to LOCAL Supabase (db reset / migration up)
                          v
         galaxy.analysis_monitoring   ◄── backfill join ──   galaxy.workflows
              (workflow_id)       (workflows.id → name, galaxy_id, version_key)
                          │
                          │  pnpm supabase:generate:types
                          v
        src/runtime/types/database.ts  (compilation gate, SCHE success 4)
                          │
                          │  vitest (analysisMonitoring.test.ts extended)
                          v
        assert migration.sql (ADD COLUMN, CREATE INDEX, backfill UPDATE joins workflows)
                          + assert drizzle schema exposes 3 nullable fields
```

### Recommended Project Structure
No new directories. The only file changes:
```
packages/nuxt-galaxy/
├── src/runtime/server/db/schema/galaxy/analysisMonitoring.ts   # add 3 columns + 2 indexes
├── src/runtime/server/db/migrations/{ts}_schema_survival_columns/
│   └── migration.sql                                           # generated DDL + appended backfill
├── src/runtime/types/database.ts                               # regenerated (protected)
└── test/server/db/schema/galaxy/analysisMonitoring.test.ts      # extend with migration+schema tests
```

### Pattern 1: Additive Table Extension with drizzle-kit
**What:** Add nullable columns and named composite indexes to a `pgSchema` table, then generate a migration.
**When to use:** Any pure-schema extension of an existing galaxy-schema table.
**Example (drizzle schema edit; mirrors `analysisMonitoring.ts:32-36` + `:40-41`):**
```typescript
// Source: [VERIFIED: analysisMonitoring.ts:28-38, 39-45] — existing conventions reused verbatim
workflowName: varchar('workflow_name', { length: 256 }),        // nullable → no .notNull()
galaxyWorkflowId: varchar('galaxy_workflow_id', { length: 256 }), // nullable
workflowVersion: varchar('workflow_version', { length: 255 }),  // nullable; matches version_key len
// ... existing columns unchanged ...
table => [
  // existing indexes untouched:
  index('idx_analysis_monitoring_owner_outcome').on(table.ownerId, table.outcome),
  index('idx_analysis_monitoring_outcome').on(table.outcome),
  index('idx_analysis_monitoring_galaxy_invocation_id').on(table.galaxyInvocationId),
  // new composites (recommended names, matching the owner_outcome convention):
  index('idx_analysis_monitoring_owner_workflow').on(table.ownerId, table.workflowId),
  index('idx_analysis_monitoring_owner_started_at').on(table.ownerId, table.startedAt),
  // existing uniqueIndex + pgPolicy(...) all unchanged
]
```

**Generated migration SQL (expected shape, per drizzle-kit; reflects `20260428150456_round_shiva` and `20260720174256_large_shadow_king` formats):**
```sql
ALTER TABLE "galaxy"."analysis_monitoring" ADD COLUMN "workflow_name" varchar(256);--> statement-breakpoint
ALTER TABLE "galaxy"."analysis_monitoring" ADD COLUMN "galaxy_workflow_id" varchar(256);--> statement-breakpoint
ALTER TABLE "galaxy"."analysis_monitoring" ADD COLUMN "workflow_version" varchar(255);--> statement-breakpoint
CREATE INDEX "idx_analysis_monitoring_owner_workflow" ON "galaxy"."analysis_monitoring" ("owner_id","workflow_id");--> statement-breakpoint
CREATE INDEX "idx_analysis_monitoring_owner_started_at" ON "galaxy"."analysis_monitoring" ("owner_id","started_at");
```

### Pattern 2: Idempotent Backfill UPDATE (same migration, D-06/D-07/D-10)
**What:** Append a deterministic, re-runnable data-migration `UPDATE` to the generated migration that fills each snapshot column independently from the local `workflows` table.
**When to use:** Backfilling derived snapshot values from a still-present source table, offline, with NULL = "no known source".
**Example (append to `migration.sql`):**
```sql
-- Backfill snapshot columns from local workflows (SCHE-03, D-06, D-07) — offline, deterministic.
UPDATE galaxy.analysis_monitoring am
SET workflow_name      = COALESCE(am.workflow_name, w.name),
    galaxy_workflow_id = COALESCE(am.galaxy_workflow_id, w.galaxy_id),
    workflow_version   = COALESCE(am.workflow_version, w.version_key)
FROM galaxy.workflows w
WHERE am.workflow_id = w.id
  AND (am.workflow_name IS NULL OR am.galaxy_workflow_id IS NULL OR am.workflow_version IS NULL);
```
Idempotency: after the first run, matched rows have all three populated, so the `OR ... IS NULL` guard makes the `WHERE` false and the UPDATE is a no-op on re-run. No join match → row untouched → all three stay NULL (orphan → Phase 14 "unknown" bucket, D-05). Backfill values always come from NOT NULL source columns (`workflows.ts`: `name`/`version_key` notNull; `galaxy_id` notNull via `galaxyItem`), so a matched row always yields all three — no per-field NULL where a workflow exists.

### Pattern 3: Migration + Schema Test (mirror `analysisMonitoring.test.ts`)
**What:** Assert the generated/backfilled migration SQL and the Drizzle schema shape match the contract — no live DB required (file-based regex over `migration.sql`).
**When to use:** Validating additive migrations without a running database.
See **Code Examples** below for the exact assertions.

### Anti-Patterns to Avoid
- **Editing the generated DDL by hand:** only *append* the backfill; do not hand-rewrite the four ADD COLUMN / CREATE INDEX statements drizzle emitted. Regenerate instead.
- **Calling the Galaxy API in the migration:** violates SCHE-03/D-06 — the migration must be offline and deterministic.
- **Guessing/fabricating historical values** (e.g., defaulting `workflow_name` to `'unknown'` or a function): violates SCHE-03. Leave NULL.
- **Adding an FK or making columns NOT NULL:** `analysis_monitoring.workflow_id` is a plain `integer` with no FK (`analysisMonitoring.ts:31`); the join is logical, not enforced. Snapshot columns stay nullable (D-05).
- **Dropping/renaming existing indexes or policies:** D-08 mandates keeping the three existing indexes and all RLS policies untouched.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Generating DDL for added columns/indexes | Hand-written ALTER TABLE | `drizzle-kit generate` | Repo rule (AGENTS §Migration Rules: "ALWAYS use `drizzle-kit generate`"); keeps snapshot.json in sync |
| Regenerating DB TypeScript types | Hand-editing `src/runtime/types/database.ts` | `pnpm supabase:generate:types` | `database.ts` is a generated/protected file (AGENTS §Protected Files); it is the compilation gate |
| Idempotent UPDATE diff logic | Custom application code | Plain SQL `UPDATE ... FROM` with `IS NULL` guard | Backfill is a one-shot data migration; SQL in the migration file is the standard, reviewable mechanism |
| Composite index creation | `CREATE INDEX` by hand | `index()` in the table config | Matches existing convention (`analysisMonitoring.ts:40-45`); drizzle generates it in the same migration |

**Key insight:** This phase's job is exactly what the toolchain exists for — the schema diff, index DDL, and type generation are all generated, and the only hand-written piece is the deliberately-chosen, idempotent backfill `UPDATE`. Never fight the generators here.

## Runtime State Inventory

Not applicable — this is a greenfield *schema-extension* phase (additive DDL + a one-time data backfill migration), not a rename/refactor/migration of an existing identifier or code name. No stored keys, service config, OS registrations, secrets, or build artifacts carry renamed strings. The only existing runtime data (rows in `galaxy.analysis_monitoring`) is *updated in place* by the backfill, which is part of the phase rather than a rename side-effect.

## Common Pitfalls

### Pitfall 1: Type regeneration requires the migration to be applied locally
**What goes wrong:** `pnpm supabase:generate:types` fails or emits stale types if the new columns aren't yet in the local running Supabase Postgres (`supabase gen types --local` reads the live DB).
**Why it happens:** The script at `package.json:61` uses `--local`, which pulls from the running instance, not from migration files.
**How to avoid:** Sequence: generate migration → apply to local DB (`pnpm supabase:db:reset` or `supabase:migration:up` after `supabase start`) → then `pnpm supabase:generate:types`. Verify the three new columns appear in `src/runtime/types/database.ts`.
**Warning signs:** Typegen says types unchanged, or typecheck (criterion 4) fails on missing snapshot fields.

### Pitfall 2: Forgetting the backfill in the same migration (or regenerating over it)
**What goes wrong:** The migration ships with only the DDL; the backfill never runs, so existing rows keep NULL snapshots and SCHE-03/SCHE success 3 fail. Conversely, re-running `drizzle generate` for a *new* change regenerates a *new* folder, but a stray manual edit to the generated statements breaks the snapshot contract.
**Why it happens:** drizzle-kit only emits the schema diff — it will never write the data backfill.
**How to avoid:** Append the backfill to `/migrations/{name}/migration.sql` right after generate and review it once. Per D-10/D-12 this is the locked approach.
**Warning signs:** The migration SQL contains no `UPDATE ... FROM galaxy.workflows`.

### Pitfall 3: Index-name drift breaking the test / SCHE-02
**What goes wrong:** Composite index names don't match what the migration test greps for, or an existing index/policy is dropped.
**Why it happens:** Index names are discretionary; drizzle will auto-name if not specified (`analysisMonitoring_owner_id_workflow_id_idx`).
**How to avoid:** Give explicit names matching the `idx_analysis_monitoring_*` convention and hard-code those exact names in the test regex. Recommended: `idx_analysis_monitoring_owner_workflow`, `idx_analysis_monitoring_owner_started_at`.
**Warning signs:** Test failing on index-name regex; grep shows a drizzle auto-generated name.

### Pitfall 4: Backfill not idempotent on re-run
**What goes wrong:** A naive `UPDATE` re-writes or overwrites rows every run, or clobbers values a later phase wrote.
**Why it happens:** Missing `IS NULL` guard or missing join condition.
**How to avoid:** Use the `UPDATE ... FROM ... WHERE am.workflow_id = w.id AND (... IS NULL ...)` shape from Pattern 2, and `COALESCE` so a field with a value is never overwritten.
**Warning signs:** Re-running the migration changes row values.

### Pitfall 5: Length mismatch on `workflow_version`
**What goes wrong:** `workflow_version` is sized `varchar(255)` but someone sizes it 256, or sources it from `auto_version` instead of `version_key`.
**Why it happens:** The analysis table conventionally uses 256 for galaxy string ids but local keys use 255 (D-09; `workflows.ts:17-19`).
**How to avoid:** Lock `workflow_version` = `varchar(255)` matching `version_key`/`name_key`, and source it from `version_key` (D-04), never `auto_version`.
**Warning signs:** Test regex expects `varchar(255)`; a `varchar(256)` fails.

## Code Examples

Verified patterns from official sources and in-repo conventions:

### 1. Drizzle schema — three nullable varchars + two composites (edit `analysisMonitoring.ts`)
```typescript
// Source: [VERIFIED: analysisMonitoring.ts:32-45] — mirrors existing varchar(256)/index conventions
import { index, integer, pgPolicy, serial, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

// within the galaxy.table('analysis_monitoring', { ... }) second argument:
workflowName: varchar('workflow_name', { length: 256 }),
galaxyWorkflowId: varchar('galaxy_workflow_id', { length: 256 }),
workflowVersion: varchar('workflow_version', { length: 255 }),

// in the table config array, after the three existing indexes:
index('idx_analysis_monitoring_owner_workflow').on(table.ownerId, table.workflowId),
index('idx_analysis_monitoring_owner_started_at').on(table.ownerId, table.startedAt),
```
Note: field names (camelCase `workflowName` etc.) follow the existing `galaxyInvocationId`/`ownerId`/`startedAt` style (`analysisMonitoring.ts:31-36`).

### 2. Generate the migration
```bash
# from packages/nuxt-galaxy/. .env must define GALAXY_DRIZZLE_DATABASE_URL (drizzle.config.galaxy.ts:13)
pnpm drizzle-kit generate --config drizzle.config.galaxy.ts --name schema_survival_columns
# → creates src/runtime/server/db/migrations/{timestamp}_schema_survival_columns/{migration.sql,snapshot.json}
```

### 3. Idempotent backfill appended to the generated migration.sql
```sql
-- Source: join shape per CONTEXT D-06/D-07; idempotency guard per D-10/D-12
UPDATE galaxy.analysis_monitoring am
SET workflow_name      = COALESCE(am.workflow_name, w.name),
    galaxy_workflow_id = COALESCE(am.galaxy_workflow_id, w.galaxy_id),
    workflow_version   = COALESCE(am.workflow_version, w.version_key)
FROM galaxy.workflows w
WHERE am.workflow_id = w.id
  AND (am.workflow_name IS NULL OR am.galaxy_workflow_id IS NULL OR am.workflow_version IS NULL);
```

### 4. Regenerate Supabase types (criterion 4)
```bash
# requires local Supabase running with the new migration applied
pnpm supabase:generate:types
# → supabase gen types typescript --local --schema 'galaxy_rbac,galaxy' > src/runtime/types/database.ts  (package.json:61)
```

### 5. Migration + schema test (extend `analysisMonitoring.test.ts`)
```typescript
// Source: mirrors analysisMonitoring.test.ts:54-88 (readdirSync over migrations dir + regex asserts)
describe('analysisMonitoring survival columns', () => {
  const migrationsDir = join(process.cwd(), 'src/runtime/server/db/migrations')

  it('should ADD COLUMN all three nullable snapshot columns and the two composite indexes', () => {
    const entries = readdirSync(migrationsDir, { withFileTypes: true })
    const files = entries.filter(e => e.isDirectory())
      .map(e => join(migrationsDir, e.name, 'migration.sql'))
    const found = files.some((file) => {
      const c = readFileSync(file, 'utf8')
      return /alter\s+table\s+"galaxy"\."analysis_monitoring"\s+add\s+column\s+"workflow_name"\s+varchar\(256\)/i.test(c)
        && /add\s+column\s+"galaxy_workflow_id"\s+varchar\(256\)/i.test(c)
        && /add\s+column\s+"workflow_version"\s+varchar\(255\)/i.test(c)
        && /create\s+index\s+"idx_analysis_monitoring_owner_workflow"\s+on\s+"galaxy"\."analysis_monitoring"\s+\("owner_id","workflow_id"\)/i.test(c)
        && /create\s+index\s+"idx_analysis_monitoring_owner_started_at"\s+on\s+"galaxy"\."analysis_monitoring"\s+\("owner_id","started_at"\)/i.test(c)
    })
    expect(found).toBe(true)
  })

  it('should backfill via an UPDATE joining galaxy.workflows with known values only', () => {
    // ... read files as above ...
    const found = files.some((file) => {
      const c = readFileSync(file, 'utf8')
      return /update\s+galaxy\.analysis_monitoring\s+am/i.test(c)
        && /set\s+workflow_name\s*=\s*coalesce\(am\.workflow_name,\s*w\.name\)/i.test(c)
        && /set\s+galaxy_workflow_id\s*=\s*coalesce\(am\.galaxy_workflow_id,\s*w\.galaxy_id\)/i.test(c)
        && /set\s+workflow_version\s*=\s*coalesce\(am\.workflow_version,\s*w\.version_key\)/i.test(c)
        && /from\s+galaxy\.workflows\s+w/i.test(c)
        && /am\.workflow_id\s*=\s*w\.id/i.test(c)
        && /is\s+null/i.test(c)              // idempotency guard; never overwrites known values
        && !/galaxy\.(api|invocation)/i.test(c) // no guessing / no API calls
    })
    expect(found).toBe(true)
  })

  it('should expose the three nullable fields on the Drizzle schema', () => {
    expect(analysisMonitoring.workflowName).toBeDefined()
    expect(analysisMonitoring.galaxyWorkflowId).toBeDefined()
    expect(analysisMonitoring.workflowVersion).toBeDefined()
    // nullable: not .notNull() — assert via the column's notNull flag if needed
    expect((analysisMonitoring.workflowVersion as any).notNull).toBeFalsy()
  })
})
```
Run: `pnpm test:server` (from `packages/nuxt-galaxy`), or targeted `pnpm exec vitest run server/db/schema/galaxy/analysisMonitoring.test.ts --config vitest.config.server.ts`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-written ALTER TABLE migrations | `drizzle-kit generate` from schema diff (+ snapshot.json) | In-repo from day one (all migrations generated) | DDL is generated; only data logic is hand-written |
| Editing generated `database.ts` by hand | `supabase gen types` regenerates it | Per AGENTS §Protected Files | `database.ts` is treated as build output; regenerated after schema changes |

**Deprecated/outdated:**
- Hand-tuned migration SQL without a snapshot file — repo uses drizzle-kit-generated folders; keep it that way.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Recommended index names `idx_analysis_monitoring_owner_workflow` / `idx_analysis_monitoring_owner_started_at` (discretionary; D-08 only fixes the column pairs) | Index & Naming / Code Examples | If planner names them differently, the migration test regex must match the actual names |
| A2 | drizzle-kit emits `ADD COLUMN ... varchar(256);` (nullable → no NOT NULL) and `CREATE INDEX "idx..." ON ... ("owner_id","workflow_id")` for these declarations | Architecture Patterns | Test regexes are written to match this generated shape; if drizzle emits a different casing/format, adjust regexes (existing migrations confirm the format) |
| A3 | The type-regeneration step requires the migration applied to the local Supabase instance first (sequential), rather than `supabase:generate:types` reading schema from migration files | Environment / Pitfall 1 | If applied differently, planner should not up-front treat typegen as independent; keep it after the DB apply step |

**If this table is empty:** N/A — three mechanical/assumed items remain above; none contradict the locked decisions.

## Open Questions (RESOLVED)

1. **Exact applied-migration command for local typegen**
   - What we know: `pnpm supabase:generate:types` reads the live local DB (`--local`), so the migration must be applied first.
   - **RESOLVED** (in 12-02-PLAN Task 1): the drizzle-managed stream is applied via `pnpm drizzle:migrate` against local Supabase; `supabase:db:reset` would replay a different migration set and is declined. Mechanical setup step, not a design decision — no action.

2. **`workflow_version` value semantics on display**
   - What we know: D-04 locks source = `workflows.version_key`.
   - What's unclear: None functionally — Phase 14 decides how version is presented in stats; out of scope here.
   - Recommendation: No action this phase; only store the raw `version_key`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | drizzle-kit, vitest, typegen | ✓ | v24.12.0 | — (≥20 required, satisfied) |
| pnpm | workspace scripts | ✓ | 10.27.0 | — |
| drizzle-kit | `drizzle-kit generate` | ✓ | 1.0.0-rc.4 | — |
| Supabase CLI | `supabase:generate:types`, `db:reset` | ✓ | 2.109.1 | — |
| Docker | `supabase start` (local DB for typegen) | ✓ | 29.6.2 | — |
| `GALAXY_DRIZZLE_DATABASE_URL` | drizzle.config configs | ✓ (package `.env` present) | — | schema-only generate may still need it because `drizzle.config.galaxy.ts:13` reads `GALAXY_DRIZZLE_DATABASE_URL!`; `.env` exists in package |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Type regeneration requires the local Supabase instance running (`supabase start`). If docker/Supabase is unavailable, the generated `database.ts` cannot be refreshed by the CLI; safe fallback: reconstruct the three new columns' types by hand in `database.ts` (still generated-compatible) and flag for later `supabase:generate:types`. This is the only environment-sensitive step.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` — section required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.0 (catalog:testing) |
| Config file | `packages/nuxt-galaxy/vitest.config.server.ts` (includes `test/server/**/*.test.ts`; pool: threads) |
| Quick run command | `pnpm exec vitest run server/db/schema/galaxy/analysisMonitoring.test.ts --config vitest.config.server.ts` (from `packages/nuxt-galaxy`) |
| Full suite command | `pnpm test` (= `vitest run && vitest run --config vitest.config.server.ts` per `package.json:47`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHE-01 | Drizzle schema exposes 3 nullable snapshot fields | unit (file-based) | vitest analysisMonitoring.test.ts | ❌ extend existing |
| SCHE-02 | Migration SQL adds 2 composite indexes | unit (file-based regex) | vitest analysisMonitoring.test.ts | ❌ extend existing |
| SCHE-03 | Backfill UPDATE joins worksflows, known values only, idempotent | unit (file-based regex) | vitest analysisMonitoring.test.ts | ❌ extend existing |

### Sampling Rate
- **Per task commit:** quick run command above
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full `pnpm test` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/server/db/schema/galaxy/analysisMonitoring.test.ts` — add the migration + schema assertions from Code Example 5 (REQ SCHE-01/02/03)
- [ ] A running local Supabase (`supabase start`) + applied migration as a prerequisite for the manual `supabase:generate:types` verification step (criterion 4) — no automated test; verify by running the CLI and confirming the three columns in `database.ts`

*(No framework-install gap: Vitest is already configured.)*

## Security Domain

> `security_enforcement` not set to false in config → treated as enabled. This phase is schema-only; it adds columns/indexes to an existing RLS-protected table and does not add auth, sessions, or external input handling.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Existing Supabase auth untouched |
| V3 Session Management | no | Untouched |
| V4 Access Control | partial — must preserve existing RLS | Do not modify the 4 `pgPolicy()` entries in `analysisMonitoring.ts:46-66`; backfill runs as migration/service role, outside RLS |
| V5 Input Validation | no | No user input; backfill values come from known DB columns |
| V6 Cryptography | no | No secrets handled |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Backfill UPDATE writing rows not owned by the caller | Tampering / Elevation | Run in migration context (service role / migration runner), not as an end user; the migration is additive and offline |
| Accidentally dropping RLS during column add | Tampering | Never remove/replace existing `pgPolicy` entries; drizzle-kit only emits ADD COLUMN/CREATE INDEX, not policy changes |
| Exposing secrets in migration | Information disclosure | Migration contains only column DDL + one UPDATE referencing `workflows.*` — no env, no secrets (evlog guidance: never log secrets applies during execution) |

## Sources

### Primary (HIGH confidence)
- In-repo source (Read this session): `analysisMonitoring.ts`, `workflows.ts`, `index.ts`, `package.json`, `drizzle.config.galaxy.ts`, `drizzle.config.ts`, `test/server/db/schema/galaxy/analysisMonitoring.test.ts`, `vitest.config.server.ts`, `analyses.ts`, `.planning/config.json`
- Migration SQL samples (Read this session): `migrations/20260720174256_large_shadow_king`, `20260428150456_round_shiva`, `20260808071319_smart_tyrannus`, `20260722205417_analysis_files_dataset_owner_select`, `20260720174100_rbac_is_admin_function`
- Local CLI: `drizzle-kit generate --help` (v1.0.0-rc.4) — `--name`, `--config`, `--custom` flags
- Official docs: https://orm.drizzle.team/docs/migrations — drizzle-kit generate/migrate codebase-first workflow

### Secondary (MEDIUM confidence)
- CONTEXT.md locked decisions D-01…D-12 (authoritative for this phase)
- REQUIREMENTS.md §"Schema & Survival" (SCHE-01/02/03), ROADMAP.md Phase 12 success criteria
- nuxt-galaxy/AGENTS.md §Migration Rules, §Protected Files, §Database Seeding

### Tertiary (LOW confidence)
- Index-name recommendations A1 (discretionary, not locked)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tooling verified in-repo (package.json) and locally (CLI versions)
- Architecture: HIGH — migration mechanics and SQL shapes verified against actual migrations and docs
- Pitfalls: HIGH — grounded in the file-based migration test pattern and typegen dependency

**Research date:** 2026-08-10
**Valid until:** 2026-09-10 (stack is repo-pinned; none fast-moving)
