# Technology Stack: v1.3 Analysis Audit Trail

**Project:** GaaS (Galaxy as a Service) — `nuxt-galaxy` Nuxt module  
**Researched:** 2026-08-10  
**Scope:** Minimal, append-only database audit trail for analysis lifecycle events.

## Recommended Stack

The v1.3 milestone adds **no new runtime dependencies**. The audit trail is implemented as a new Drizzle/PostgreSQL table plus ingestion helpers inside the existing `nuxt-galaxy` server layer, wired into the same Effect-TS + Drizzle code paths that already create, update, and delete analyses.

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Nuxt / Nitro** | `^4.3.0` (`catalog:nuxt`) | Server routes & scheduled tasks | Audit ingestion runs server-side; API handlers and `galaxy:sync-analyses` task are the only mutators. |
| **Effect-TS** | `^3.19.6` (`catalog:`) | Transactional audit writes | Existing `Drizzle` tag + `Layer` pattern; keep audit inserts composable and testable. |

### Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **PostgreSQL** | Supabase-hosted (Postgres 15+) | Append-only audit store | Existing `nuxt-galaxy` metadata store; supports JSONB, partial indexes, and immutable triggers. |
| **Drizzle ORM** | `^1.0.0-beta.16` (`catalog:`) | Schema + migrations | Already used for all application tables and RLS policies; same migration workflow applies. |
| **Drizzle-Kit** | `^1.0.0-beta.16` (`catalog:`) | Migration generation | Existing `drizzle.config.ts` covers `galaxy` and `galaxy_rbac` schemas. |
| **postgres-js** | `^3.4.7` (`catalog:`) | DB driver | Already the Drizzle driver in `server/utils/drizzle.ts`. |

### Infrastructure / Observability

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **evlog** | `^2.22.3` (`catalog:`) | Structured operational logs | Complements the DB audit trail with traceable event logs; do **not** replace DB audit with evlog events. |
| **Supabase Auth** | `@nuxtjs/supabase` `^2.0.4` | Actor identity | `auth.uid()` / `serverSupabaseUser` provides the canonical Supabase user UUID to denormalize into audit rows. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `drizzle-orm/pg-core` | `^1.0.0-beta.16` | `pgTable`/`pgPolicy`/`index`/`jsonb`/`uuid` | Defining the new audit table and RLS policies. |
| `drizzle-orm/supabase` | `^1.0.0-beta.16` | `authenticatedRole`, `authUid` | Owner-scoped SELECT policies. |
| `effect` | `^3.19.6` | `Effect.gen`, `Data.TaggedError`, transactions | Atomic analysis mutation + audit insert. |

## Schema Design

### Recommended: fully denormalized, no foreign keys

Create a new `galaxy.analysis_audit_log` table that **does not foreign-key** to `analyses`, `workflows`, `histories`, or `auth.users`. Use plain columns to store the identifiers that matter for forensics.

**Why denormalized?**

- The requirement is "soft-immune": audit rows must survive analysis deletion. A foreign key to `analyses.id` with `ON DELETE CASCADE` would cascade the deletion; `SET NULL` would erase the analysis correlation.
- `analyses.owner_id` references `auth.users.id` with `ON DELETE CASCADE`; deleting a Supabase user must not erase audit history.
- `analyses.history_id` references `histories.id` with `ON DELETE CASCADE`; history deletion must not erase audit history.
- `workflows` can be deleted or re-imported; the audit record should preserve the workflow reference at the time of the event.

This is the standard pattern for immutable audit logs: store the identity values at event time, not live joins.

### Proposed table shape

```typescript
// src/runtime/server/db/schema/galaxy/analysisAuditLog.ts
import {
  index,
  integer,
  jsonb,
  pgPolicy,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { authenticatedRole, authUid } from 'drizzle-orm/supabase'
import { galaxy, invocationStateEnum } from '../galaxy'

export const analysisAuditAction = galaxy.enum('analysis_audit_action', [
  'created',
  'state_changed',
  'deleted',
  'synced',
])

export const actorType = galaxy.enum('analysis_audit_actor_type', [
  'user',
  'system',
])

export const analysisAuditLog = galaxy.table(
  'analysis_audit_log',
  {
    id: serial('id').primaryKey(),
    // Immutable correlation keys — plain columns, NOT foreign keys.
    analysisId: integer('analysis_id').notNull(),
    analysisGalaxyId: varchar('analysis_galaxy_id', { length: 256 }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    workflowId: integer('workflow_id').notNull(),
    workflowGalaxyId: varchar('workflow_galaxy_id', { length: 256 }).notNull(),
    historyId: integer('history_id').notNull(),
    galaxyInstanceUrl: varchar('galaxy_instance_url', { length: 256 }).notNull(),

    // Event details
    action: analysisAuditAction('action').notNull(),
    actorType: actorType('actor_type').notNull(),
    fromState: invocationStateEnum('from_state'),
    toState: invocationStateEnum('to_state'),
    metadata: jsonb('metadata').default({}).notNull(),
    message: text('message'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index('idx_audit_analysis_id_created_at').on(table.analysisId, table.createdAt),
    index('idx_audit_owner_id_created_at').on(table.ownerId, table.createdAt),
    index('idx_audit_action').on(table.action),
    index('idx_audit_analysis_galaxy_id').on(table.analysisGalaxyId),
    pgPolicy('Users can view their own audit rows', {
      for: 'select',
      to: authenticatedRole,
      using: eq(table.ownerId, authUid),
    }),
    pgPolicy('Admins can view all audit rows', {
      for: 'select',
      to: authenticatedRole,
      using: sql`(SELECT galaxy_rbac.is_admin()) = TRUE`,
    }),
  ],
)
```

**Notes on the shape:**

- `analysisId` is the local `analyses.id`. It remains queryable after the analysis row is deleted because it is **not** a foreign key.
- `analysisGalaxyId` is the Galaxy invocation id (`analyses.galaxy_id`). This is the stable external identifier.
- `ownerId` is the Supabase auth UUID. This satisfies "authenticated Supabase user" without requiring a live `auth.users` row.
- `workflowId` / `workflowGalaxyId` satisfy "workflow reference"; `workflowGalaxyId` is the actual Galaxy workflow identifier and survives local workflow deletion.
- `galaxyInstanceUrl` satisfies "Galaxy instance". The instance URL is known at analysis creation time from the Galaxy layer / history chain and is more useful for operators than a synthetic `instances.id`.
- `fromState` / `toState` use the existing `invocation_state` enum and are `NULL` for non-transition actions such as `created` or `deleted`.
- `metadata` is `jsonb` for optional context (sync error summary, invocation snapshot id, request id). Keep it small and never put secrets or raw Galaxy payloads in it.

### RLS and mutability

- **No INSERT/UPDATE/DELETE policies for `authenticatedRole`.** Audit rows are written only by server-side code via the service-role database URL. This prevents users from tampering with their own audit history.
- **Owner-scoped SELECT** so users can only see their own events.
- **Admin SELECT** via `galaxy_rbac.is_admin()` (same pattern used elsewhere in the `galaxy` schema).

### Append-only enforcement (optional but recommended)

Add a PostgreSQL trigger that rejects `UPDATE` and `DELETE` on `analysis_audit_log`. This protects against accidental or malicious mutation even by service-role connections:

```sql
CREATE OR REPLACE FUNCTION galaxy.prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'analysis_audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER analysis_audit_log_immutable
BEFORE UPDATE OR DELETE ON galaxy.analysis_audit_log
FOR EACH ROW EXECUTE FUNCTION galaxy.prevent_audit_mutation();
```

Place this in a **custom migration** (not in the Drizzle schema file), following the project convention that PL/pgSQL functions live in custom migrations.

### Generated columns & partitioning: defer

- **Generated columns** are not needed. The event fields are explicit; deriving `action` from state transitions adds indirection without value.
- **Table partitioning** is overkill for v1.3. If audit volume grows, range-partition by `created_at` (e.g., monthly) later. For now, a composite index on `(analysis_id, created_at)` plus `(owner_id, created_at)` covers the expected query patterns.

## Integration Points with Existing Code

### Where to write audit records

| Code path | Event to record | How |
|-----------|-------------------|-----|
| `src/runtime/server/utils/grizzle/analyses.ts` — `insertAnalysis` | `created` | After analysis insert, inside the same Drizzle transaction. |
| `src/runtime/server/utils/grizzle/analyses.ts` — `updateAnalysisState` | `state_changed` | Before/after the `UPDATE`, in the same transaction, with `fromState` read from the existing row. |
| `src/runtime/server/utils/grizzle/analyses.ts` — `deleteAnalysis` | `deleted` | Before the `DELETE`, after fetching the analysis row. |
| `src/runtime/server/utils/grizzle/sync/analysis.ts` — `syncAnalysisEffect` | `state_changed` / `synced` | When the effective state differs from the persisted state; actor type = `'system'`. |

### Recommended helper

Add `insertAnalysisAuditEventEffect` in `src/runtime/server/utils/grizzle/analyses.ts` (or a new `src/runtime/server/utils/grizzle/audit.ts`):

```typescript
export class InsertAnalysisAuditError extends Data.TaggedError('InsertAnalysisAuditError')<{
  readonly message: string
}> {}

export function insertAnalysisAuditEvent(event: NewAnalysisAuditEvent) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle.insert(analysisAuditLog).values(event).returning(),
      catch: error => new InsertAnalysisAuditError({ message: String(error) }),
    })
  })
}
```

For actions that mutate the analysis, call this helper inside the same Drizzle transaction so analysis mutation and audit insert succeed or fail atomically.

### Actor identity

- **User-initiated actions** (`created`, `deleted`, user-scoped `sync` POST): actor type = `'user'`, `ownerId` from `getSupabaseUser(event)`.
- **Scheduled sync task**: actor type = `'system'`, `ownerId` from the analysis row being synced. The task already selects `owner_id` per analysis.

### Interaction with evlog

- evlog records **operational events** ("sync task started", "analysis state updated").
- `analysis_audit_log` records **forensic facts** ("analysis 123 transitioned from `running` to `completed` at 10:04 by user UUID").
- Do not remove or replace evlog calls. The DB audit trail is a complementary durability layer.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| **Audit storage** | PostgreSQL table in `galaxy` schema | Separate database / S3 / Axiom-only audit | Existing PG is queryable, backed up, and already hosts analysis metadata. A separate store adds ops overhead for v1.3. |
| **Referential integrity** | Fully denormalized | Foreign keys with `ON DELETE SET NULL` | Would lose the analysis correlation key when the parent analysis is deleted, defeating the soft-immune requirement. |
| **User identity** | `owner_id` UUID only | `owner_id` + denormalized `owner_email` | Email is PII and may change; `owner_id` is the stable Supabase identifier. Add email later if operators need human-readable display and crypto-shredding is acceptable. |
| **Append-only enforcement** | PostgreSQL immutable trigger | RLS only | RLS does not bind the service-role connection used by server-side code. A trigger enforces the invariant at the database level. |
| **Schema migration approach** | `drizzle-kit generate` + custom function migration | Hand-written SQL only | Keeps the table in the generated Drizzle schema; custom migration only for the immutable trigger, matching the existing migration split. |

## Installation / Implementation Steps

No new packages to install. The existing catalog versions are sufficient:

```bash
# Existing versions (already in pnpm-workspace.yaml)
drizzle-orm: ^1.0.0-beta.16
drizzle-kit: ^1.0.0-beta.16
postgres: ^3.4.7
effect: ^3.19.6
evlog: ^2.22.3
```

### Migration order

Follow the existing `src/runtime/server/db/README.md` workflow:

1. Add `analysisAuditLog` table to `src/runtime/server/db/schema/galaxy/analysisAuditLog.ts`.
2. Update `src/runtime/server/db/schema/galaxy/index.ts` exports if needed (avoid circular imports; import the table directly from its file, per project convention).
3. Generate the schema migration:
   ```bash
   cd packages/nuxt-galaxy
   pnpm drizzle:generate
   ```
4. Create a custom migration for the append-only trigger and function:
   ```bash
   pnpm supabase:migration:new analysis-audit-immutable
   # Edit migration.sql to add galaxy.prevent_audit_mutation() and trigger
   ```
5. Ensure the custom migration timestamp is **after** the Drizzle-generated migration that creates the table.
6. Run `pnpm supabase:migration:up` (or `pnpm drizzle:migrate`) locally and verify.
7. Regenerate Supabase types: `pnpm supabase:generate:types`.
8. Add server-side ingestion helpers and wire into `insertAnalysis`, `updateAnalysisState`, `deleteAnalysis`, and `syncAnalysisEffect`.
9. Add tests covering audit row creation on create/delete/state change and survival after analysis deletion.

## What NOT to Add

| Approach | Reason |
|----------|--------|
| **New npm dependencies** | Drizzle, postgres-js, Effect, and evlog already cover all needs. |
| **BullMQ / Redis / pgmq / Temporal** | Out of scope for v1.3; audit ingestion is synchronous within existing DB transactions. |
| **Hash-chain / HMAC signing** | Tamper-evidence is a compliance add-on. The immutable trigger + service-role-only writes provide the v1.3 guarantee. Revisit if SOC2/HIPAA audit requirements arise. |
| **Partitioning** | Unnecessary until audit volume justifies it. Indexes on `(analysis_id, created_at)` and `(owner_id, created_at)` handle expected query patterns. |
| **Generated columns** | No derived field is worth the extra indirection; store `action`, `from_state`, and `to_state` explicitly. |
| **UI / API endpoints for audit display** | Explicitly out of scope for v1.3. Only the data model and ingestion are needed. |
| **Replacing evlog with DB audit** | The two layers serve different audiences (operators vs. forensic auditors) and retention needs. Keep both. |

## Sources

- Project schema files: `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/{analyses,analysisMonitoring,workflows,histories,instances,users,relations,index}.ts`
- Project DB utilities: `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/{analyses.ts,sync/analysis.ts}`, `packages/nuxt-galaxy/src/runtime/server/utils/drizzle.ts`
- Migration workflow: `packages/nuxt-galaxy/src/runtime/server/db/README.md`
- Dependency versions: `pnpm-workspace.yaml`, `packages/nuxt-galaxy/package.json`
- Logging conventions: `.planning/LOGGING-SPEC.md`
- evlog audit patterns: `build-audit-logs` skill
- Supabase RLS / auth guidance: `supabase` skill
