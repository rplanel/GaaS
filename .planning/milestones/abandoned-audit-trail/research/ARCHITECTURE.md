# Architecture Research: Append-Only Analysis Audit Trail

**Domain:** Galaxy-as-a-Service (GaaS) — server-side audit history for Galaxy analysis lifecycle events
**Researched:** 2026-08-10
**Confidence:** HIGH for the schema/Effect/Drizzle/evlog integration patterns (they are already the project baseline); MEDIUM for the exact column shape of the first audit table (tunable during implementation).

## Standard Architecture

### System Overview

The audit trail is a thin, append-only layer added *around* the existing analysis lifecycle. It does not replace the current mutable `analyses` table or `analysis_monitoring` summary; it records immutable facts about creation, state transitions, and deletion so operators can reconstruct history even after the analysis row is gone.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client / API                                 │
│  POST /api/db/analyses        DELETE /api/db/analyses/:id            │
│       │                                  │                           │
├───────┼──────────────────────────────────┼──────────────────────────┤
│       ▼                                  ▼                           │
│  ┌──────────────┐                 ┌──────────────┐                 │
│  │ analyses.post│                 │ analyses.delete│                 │
│  └──────┬───────┘                 └──────┬───────┘                 │
│         │                                │                           │
├─────────┼────────────────────────────────┼──────────────────────────┤
│         ▼                                ▼                           │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │              Effect programs (grizzle helpers)              │   │
│  │   runAnalysis ──┐    deleteAnalysis ──┐    syncAnalysisEffect│ │
│  │                  │                     │                      │ │
│  │   insertAnalysis │   deleteHistory     │   update analysis     │ │
│  │        +         │        +            │   state               │ │
│  │   insertAnalysis │   insertAnalysis    │        +              │ │
│  │   AuditEvent     │   AuditEvent        │   insertAnalysis      │ │
│  │   (created)      │   (deleted)         │   AuditEvent          │ │
│  │                  │                     │   (state_changed)     │ │
│  └──────────────────┴─────────────────────┴──────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                         Data Store                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────┐ │
│  │     analyses     │  │ analysis_audit_log│  │ analysis_monitoring│ │
│  │  (mutable)       │  │  (append-only)    │  │  (mutable summary) │ │
│  └──────────────────┘  └──────────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `analysis_audit_log` table | Append-only store of analysis lifecycle events | Drizzle table in `galaxy` schema; no `UPDATE`/`DELETE` paths; nullable FK to `analyses` with `onDelete: 'set null'` |
| `insertAnalysisAuditEventEffect` helper | Type-safe, error-tagged audit insert | `Effect.gen` + `Drizzle` insert in `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/audit.ts` |
| `runAnalysis` | Records the creation audit event | Calls helper immediately after `insertAnalysis` succeeds |
| `syncAnalysisEffect` | Records state transition audit events | Calls helper only when the effective state differs from the previously persisted state |
| `deleteAnalysis` | Records the deletion audit event | Calls helper *before* the `analyses` row is deleted, so the FK can be nulled without losing the record |
| `evlog` `audit()` / `log.audit()` | Secondary observability event | Emits a force-kept wide event to existing drains; the DB row remains the source of truth |

## Recommended Project Structure

```
packages/nuxt-galaxy/src/runtime/server/
├── db/schema/galaxy/
│   ├── analysisAuditLog.ts          # NEW: audit table schema
│   ├── analyses.ts                  # MODIFIED: (no direct change, but FK target)
│   └── index.ts                     # unchanged — table exports stay in source files
├── utils/grizzle/
│   ├── audit.ts                     # NEW: insertAnalysisAuditEventEffect + errors
│   ├── analyses.ts                  # MODIFIED: creation + deletion hooks
│   ├── sync/analysis.ts             # MODIFIED: state transition hook
│   └── ...
├── api/db/analyses.post.ts          # MODIFIED: pass galaxyInstanceUrl/workflow context
├── api/db/analyses/[analysisId].delete.ts  # unchanged surface, backend emits audit
└── tasks/galaxy/sync-analyses.ts    # unchanged surface; audit emitted inside sync effect
```

### Structure Rationale

- **Schema lives next to existing Galaxy tables.** `analysisAuditLog.ts` follows the same pattern as `analysisMonitoring.ts`, `syncLocks.ts`, etc.
- **Helper is grouped with other data-access effects.** `utils/grizzle/audit.ts` sits alongside `analyses.ts` and `analysisMonitoring.ts` so it shares the same `Drizzle` Context.Tag and error conventions.
- **Hooks are placed at the authoritative mutators.** Creation, sync-driven state change, and deletion are already centralized in `analyses.ts` and `sync/analysis.ts`; adding audit calls there keeps the surface area small.

## Data Flow

### Analysis Creation Flow

```
User POST /api/db/analyses
  → analyses.post.ts extracts supabaseUser.id
  → runAnalysis Effect
       → insertAnalysis (existing transaction, also inserts analysis_monitoring)
       → insertAnalysisAuditEventEffect({
             eventType: 'created',
             actorType: 'user',
             actorId: ownerId,
             ownerId,
             workflowId,
             historyId,
             galaxyInvocationId,
             galaxyInstanceUrl,
             newState: initialInvocationState,
         })
  → return { analysisId, inputIds }
```

### Scheduled Sync State-Transition Flow

```
galaxy:sync-analyses task
  → syncAnalysisEffect(analysisId, ownerId, ...)
       → fetch current persisted state
       → resolve effective state from Galaxy invocation / jobs summary
       → if effectiveState !== currentState:
              update analyses.state
              insertAnalysisAuditEventEffect({
                  eventType: 'state_changed',
                  actorType: 'system',
                  actorId: 'galaxy:sync-analyses',
                  ownerId,
                  workflowId,
                  historyId,
                  galaxyInvocationId,
                  previousState: currentState,
                  newState: effectiveState,
              })
       → sync jobs/outputs/history state
```

### Deletion Flow

```
User DELETE /api/db/analyses/:id
  → deleteAnalysis Effect
       → getHistoryAnalysis(analysisId, ownerId)
       → bt.deleteHistoryEffect(historyGalaxyId)
       → insertAnalysisAuditEventEffect({
             eventType: 'deleted',
             actorType: 'user',
             actorId: ownerId,
             ownerId,
             workflowId,
             historyId,
             galaxyInvocationId,
             previousState: persistedState,
         })
       → drizzle.delete(analyses).where(id, ownerId)
            (FK on analysis_audit_log.analysis_id is SET NULL,
             so the audit row survives)
```

## New vs Modified Components

| Component | Status | Why |
|-----------|--------|-----|
| `analysis_audit_log` table | **NEW** | Core append-only store |
| Drizzle migration for audit table | **NEW** | Generated with `drizzle-kit generate` |
| `insertAnalysisAuditEventEffect` helper | **NEW** | Single, reusable, error-tagged audit writer |
| `runAnalysis` | **MODIFIED** | Emits `created` event after analysis insert |
| `syncAnalysisEffect` | **MODIFIED** | Emits `state_changed` event when state actually changes |
| `deleteAnalysis` | **MODIFIED** | Emits `deleted` event before row deletion |
| `analyses.post.ts` | **MODIFIED** | Passes `galaxyInstanceUrl` and workflow/history references into `runAnalysis` |
| `analysis_monitoring` | **unchanged** | Still the terminal-outcome summary; audit log is separate |
| `tasks/galaxy/sync-analyses.ts` | **unchanged** | Audit is emitted one level deeper, inside `syncAnalysisEffect` |

## Architectural Patterns

### Pattern 1: Soft-Immune Audit Table

**What:** The audit table carries its own denormalized identifiers (`owner_id`, `galaxy_invocation_id`, `workflow_id`, `history_id`, `galaxy_instance_url`) and a nullable FK to `analyses` configured with `onDelete: 'set null'`. If the analysis row is deleted, the FK is nulled but every other field remains intact.

**When to use:** Whenever audit records must outlive the mutable entity they describe.

**Trade-offs:** Slight denormalization and the need for nullable joins; in exchange you get true immutability and survival of the parent record.

### Pattern 2: Effect-Wrapped Audit Insert

**What:** All audit writes route through a single helper that returns `Effect<{ insertedId: number }, InsertAnalysisAuditEventError, Drizzle>`. It follows the same dual-API convention as other `grizzle` helpers if needed (`insertAnalysisAuditEventEffect` + `insertAnalysisAuditEvent`).

**When to use:** Every audit write, so failures are typed and can be surfaced in the same `Effect` pipelines that already mutate analyses.

**Example:**

```typescript
// packages/nuxt-galaxy/src/runtime/server/utils/grizzle/audit.ts
import { eq } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { analysisAuditLog } from '../../db/schema/galaxy/analysisAuditLog'
import { Drizzle } from '../drizzle'
import { takeUniqueOrThrow } from './helper'

export class InsertAnalysisAuditEventError extends Data.TaggedError('InsertAnalysisAuditEventError')<{
  readonly message: string
}>() {}

export type AnalysisAuditEventType = 'created' | 'state_changed' | 'deleted'

export interface AnalysisAuditEventInput {
  analysisId?: number | null
  eventType: AnalysisAuditEventType
  actorType: 'user' | 'system'
  actorId: string
  ownerId: string
  workflowId: number
  historyId: number
  galaxyInvocationId: string
  galaxyInstanceUrl: string
  previousState?: string | null
  newState?: string | null
}

export function insertAnalysisAuditEventEffect(input: AnalysisAuditEventInput) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () =>
        useDrizzle
          .insert(analysisAuditLog)
          .values(input)
          .returning({ insertedId: analysisAuditLog.id })
          .then(takeUniqueOrThrow),
      catch: error =>
        new InsertAnalysisAuditEventError({ message: `Error inserting analysis audit event: ${error}` }),
    })
  })
}
```

### Pattern 3: Dual-Audit Event (DB + evlog)

**What:** Persist the canonical record in Postgres, then emit an evlog `audit()` (for scheduled tasks) or `log.audit()` (for request handlers) wide event. The DB row is the queryable source of truth; evlog provides force-kept, timestamped, drain-routed observability.

**When to use:** When the project already standardizes on evlog (as GaaS does) and audit events need to be searchable in both SQL and log drains.

**Trade-offs:** Two persistence paths instead of one. Mitigate by making the evlog event idempotent (evlog computes an `idempotencyKey`) and by treating DB insert failures as hard errors while evlog failures are logged but non-blocking.

**Example inside a scheduled task:**

```typescript
import { audit } from 'evlog'

// after the DB audit row is inserted
audit({
  action: 'analysis.state_changed',
  actor: { type: 'system', id: 'galaxy:sync-analyses' },
  target: { type: 'analysis', id: String(analysisId), ownerId, galaxyInvocationId },
  outcome: 'success',
  changes: { before: previousState, after: newState },
})
```

### Pattern 4: Actor Context Propagation

**What:** The caller supplies `actorType` and `actorId`; user actions use `{ type: 'user', id: ownerId }`, system actions use `{ type: 'system', id: 'galaxy:sync-analyses' }`. The `ownerId` column always stores the analysis owner for authorization and RLS.

**When to use:** Any audit event where the performer and the resource owner can differ.

**Why:** Separating actor from owner lets you answer both "who did this?" and "whose data is this?" without ambiguity.

## Build Order

1. **Design and implement `analysis_audit_log` schema + migration.** This is the foundation; every later step depends on it.
2. **Implement `insertAnalysisAuditEventEffect` helper + unit tests.** Establishes the typed error boundary and insert pattern.
3. **Wire creation audit into `runAnalysis`.** Requires passing `galaxyInstanceUrl` and workflow/history context from `analyses.post.ts`.
4. **Wire state-transition audit into `syncAnalysisEffect`.** Compare persisted state with effective state before updating; only emit when they differ.
5. **Wire deletion audit into `deleteAnalysis`.** Emit *before* the `analyses` row is deleted.
6. **Add RLS policies and append-only tests.** Verify that authenticated users can read their own rows, that no code path can update/delete audit rows, and that deletion of an analysis leaves the audit row intact with `analysis_id = NULL`.
7. **Add end-to-end integration tests** for create → sync transition → delete.
8. **Update `LOGGING-SPEC.md` / inline docs** to document the new audit event shape and any new allowlisted fields.
9. **Run quality gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `analyses.post.ts` → `runAnalysis` | Function call / Effect program | Pass `galaxyInstanceUrl` (from runtime config) plus workflow/history IDs |
| `runAnalysis` → `insertAnalysisAuditEventEffect` | Effect call | Emits `created` event after analysis insert succeeds |
| `syncAnalysisEffect` → `insertAnalysisAuditEventEffect` | Effect call | Emits `state_changed` event only when state actually changes |
| `deleteAnalysis` → `insertAnalysisAuditEventEffect` | Effect call | Emits `deleted` event before row deletion |
| Audit helper → `Drizzle` | `Effect.tryPromise` insert | Same Context.Tag pattern as other `grizzle` helpers |
| Audit helper → evlog | Optional `audit()` / `log.audit()` call | Secondary observability event; DB is source of truth |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Galaxy | No new integration | Reuses existing `getInvocationEffect` / `getInvocationJobsSummaryEffect` states |
| Supabase Auth | Reuse existing `getSupabaseUser` and `analyses.owner_id` | `ownerId` is the authenticated user identity captured in every audit row |
| Postgres / Drizzle | Direct insert via existing `Drizzle` layer | RLS policies should allow server-side service-role inserts and owner-scoped selects |

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0 – 1k users | Plain `analysis_audit_log` table with indexes on `owner_id`, `analysis_id`, `galaxy_invocation_id`, and `created_at`. |
| 1k – 100k users | Add a BRIN index on `created_at` and a periodic archive job that moves rows older than the retention window to cold storage (S3/Parquet). |
| 100k+ users | Partition by `created_at` month, keep hot partitions in Postgres, and route long-tail audit queries to the archive. |

### Scaling Priorities

1. **First bottleneck:** Unbounded table growth. Fix by defining a retention policy and archiving old partitions.
2. **Second bottleneck:** Owner-scoped audit queries scanning many rows. Fix by partitioning + query filters on `created_at`.

For the v1.3 milestone, only the 0–1k index set is required.

## Anti-Patterns

### Anti-Pattern 1: Hard FK with `onDelete: 'cascade'`

**What people do:** Define `analysis_id integer references analyses(id) on delete cascade`.
**Why it's wrong:** Deleting an analysis would silently remove every audit record, defeating the "survives analysis deletion" requirement.
**Do this instead:** Use `onDelete: 'set null'` or no FK, and store denormalized identifiers directly on the audit row.

### Anti-Pattern 2: Mutable Audit Rows

**What people do:** Allow `UPDATE` or `DELETE` on `analysis_audit_log`, or reuse rows for the latest state.
**Why it's wrong:** Breaks the append-only guarantee and forensic trust.
**Do this instead:** RLS policies should deny `UPDATE`/`DELETE`; application code only ever inserts. Add a `pgPolicy` that makes `UPDATE`/`DELETE` always false.

### Anti-Pattern 3: Audit Writes Only in API Handlers

**What people do:** Log creation in `analyses.post.ts` but miss state transitions that happen inside the scheduled sync task.
**Why it's wrong:** Most analysis state changes happen in `galaxy:sync-analyses`, not from user requests.
**Do this instead:** Emit audit events from `syncAnalysisEffect`, which is the canonical sync-state mutator.

### Anti-Pattern 4: Logging Secrets in Audit Context

**What people do:** Storing full `parameters`, `datamap`, `stderr`, or `invocation` objects in the audit row.
**Why it's wrong:** Audit records are long-lived and may be exposed to admin queries; they can contain Galaxy credentials, PII, or large streams.
**Do this instead:** Store only the allowlisted scalar identifiers and state values already permitted by `.planning/LOGGING-SPEC.md` (e.g., `analysisId`, `galaxyInvocationId`, `state`, `ownerId`).

## Sources

- `build-audit-logs` skill (evlog audit helpers, two-drain pattern, anti-patterns)
- `.planning/PROJECT.md` (v1.3 milestone goals and constraints)
- `.planning/LOGGING-SPEC.md` (surface conventions and sync trace field allowlist)
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts`
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analysisMonitoring.ts`
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts`
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts`
- `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts`
- `packages/nuxt-galaxy/src/runtime/server/api/db/analyses.post.ts`
- `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[analysisId].delete.ts`
- Vendored `evlog` source (`packages/evlog/src/audit.ts`) confirming `audit()`, `log.audit()`, `buildAuditFields`, and `AUDIT_SCHEMA_VERSION`

---
*Architecture research for: GaaS v1.3 Analysis Audit Trail*
*Researched: 2026-08-10*
