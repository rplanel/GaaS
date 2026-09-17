# Feature Research: Analysis Audit Trail

**Domain:** Append-only audit trail for Galaxy analysis lifecycle events
**Researched:** 2026-08-10
**Overall confidence:** MEDIUM

## Feature Landscape

### Table Stakes (Users Expect These)

These are the baseline capabilities a credible analysis audit trail must provide. Without them operators cannot reconstruct what happened to an analysis after the fact.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Dedicated audit event table | A separate, append-only store is required so the audit record outlives the analysis row | LOW | Add `analysis_audit_events` in the `galaxy` schema; keep it independent of `analyses` |
| Capture creation event | Operators need to know when an analysis first entered the GaaS DB and who created it | LOW | Hook inside `insertAnalysis` transaction so creation and audit are atomic |
| Capture every state transition | The analysis `state` column mutates during sync; each change must be auditable | LOW | Hook inside `updateAnalysisState` and sync terminal-outcome path |
| Capture deletion | The audit trail is the only record left after an analysis is deleted, so the delete itself must be logged | LOW | Hook inside `deleteAnalysis` before the parent row is removed |
| Survives analysis deletion | Audit rows must remain after `analyses` row is deleted; otherwise the feature fails its core purpose | LOW | `analysis_id` foreign key with `onDelete: 'set null'` or no FK; store `galaxy_invocation_id` redundantly |
| Authenticated actor attribution | Every event must answer "who did this" — either a Supabase user or the system | LOW | `actor_type` (`user` / `system` / `api` / `agent`) + `actor_id`; use stable Supabase `user.id`, not session id |
| Galaxy instance + workflow reference | An audit event without Galaxy/workflow context is unactionable | LOW | Store `galaxy_instance_url` (or `galaxy_id` if available) and `workflow_id` on every event |
| Immutable, append-only enforcement | Audit rows cannot be updated or deleted without breaking non-repudiation | LOW | RLS policies that forbid `update`/`delete`; application code only inserts |
| Timestamping | Forensic ordering requires a reliable event time | LOW | `occurred_at` from server `now()`; separate `recorded_at` if needed |
| Idempotency for retries | Sync retries and task re-runs must not create duplicate audit entries | LOW | Unique constraint on an idempotency key (hash of action + actor + target + coarse timestamp) |

### Differentiators (Competitive Advantage)

These capabilities are not required for v1.3 but would make the audit trail notably more useful and trustworthy.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Typed audit action catalog | Prevents typos in `action` strings that silently break SIEM rules and operator queries | LOW | Use `defineAuditCatalog('analysis', { CREATED: ..., STATE_CHANGED: ..., DELETED: ... })` from evlog |
| State diff snapshots | Operators can see exactly what changed in each transition, not just that it changed | MEDIUM | Store `previous_state` / `new_state` in v1; add full `auditDiff(invocationBefore, invocationAfter)` later |
| Denial logging | Failed authorization attempts are the events auditors care about most | LOW | Log owner-mismatch deletes / unauthorized sync triggers as `analysis.<action>.denied` |
| Correlation / causation IDs | Tie a user action (e.g., "delete analysis") to the resulting system reactions | LOW | `correlation_id` = request/task id; `causation_id` = previous audit event id for cascades |
| Dual-drain pipeline | Fast SQL queries today + tamper-evident compliance artifact tomorrow | MEDIUM | Primary Postgres table for queries; `auditOnly(signed(createFsDrain(...)))` as a compliance journal |
| Tamper-evident signatures | Prove an audit row was not altered after insertion | MEDIUM | Use evlog `signed({ strategy: 'hmac' })` or hash-chain if compliance requires it |
| Crypto-shredding for GDPR | Satisfy right-to-be-forgotten without breaking append-only immutability | HIGH | Encrypt PII fields (email, IP) with a per-user key; delete the key to "forget" |
| Retention policy enforcement | Long audit retention is required by most compliance frameworks | LOW | Document per-sink retention; enforce at sink layer (Postgres cron / Axiom policy / FS rotation) |

### Anti-Features (Commonly Requested, Often Problematic)

These may look desirable but create more risk than value for the v1.3 milestone.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| UI / query API in v1.3 | Stakeholders want to "see the log" immediately | Adds client auth, RLS, pagination, and design work that is explicitly out of scope for the milestone; distracts from immutable data model | Server-side data model + raw SQL/SQL editor access for operators; defer UI to a later milestone |
| Editable audit rows | Admins want to "fix" bad audit entries | Destroys non-repudiation and compliance value; any mutation invalidates the trail | Make the table append-only by policy and RLS; if a correction is needed, insert a compensating event |
| Cascade delete from `analyses` to audit | Keeps the database "clean" when an analysis is removed | Defeats the entire purpose of a history that survives deletion | Use `onDelete: 'set null'` or no FK on `analysis_id` |
| Embedding full invocation JSON in every audit event | More context seems better | Bloats the audit table with redundant, unversioned data; complicates retention and queries | Reference `galaxy_invocation_id` and store only the diffed / relevant fields |
| Auditing every sync poll or read-only view | "Log everything" feels safer | Drowns out state-changing events; observability logs already cover polls | Audit only creation, state transitions, terminal outcomes, deletions, and denials |
| Sampling or tail-sampling audit events | Reduces storage cost | Audit events are facts, not telemetry; sampling breaks compliance and forensics | Keep every audit event; control cost with retention policies and careful field selection |
| Using session id or JWT as `actor_id` | Easy to capture from the request | Sessions expire and tokens rotate; forensic queries become ambiguous | Use stable Supabase user UUID; correlate sessions via `context.request_id` / `context.trace_id` |
| Building a parallel audit pipeline from scratch | Full control over the format | Repeats the work evlog already does and drifts from project logging conventions | Use evlog's `log.audit()` / `audit()` helpers and the existing drain/enricher pipeline |

## Dependencies Between Features

```
Analysis Audit Event Schema + RLS
  ├─ requires existing analyses, workflows, owners tables
  ├─ enables Ingestion Hooks
  └─ enables Immutability Guarantees

Ingestion Hooks
  ├─ depends on Analysis CRUD (insertAnalysis, updateAnalysisState, deleteAnalysis)
  ├─ depends on Sync Effects (syncAnalysisEffect terminal-outcome path)
  ├─ depends on Actor Resolution (Supabase user id / system actor)
  └─ enables Append-Only Audit Records

Actor Resolution
  ├─ requires Supabase auth helpers (getSupabaseUser)
  └─ distinguishes user-initiated vs. scheduled-task events

Immutability Guarantees
  ├─ depends on Schema design (no update/delete paths)
  ├─ depends on RLS / Postgres policies
  └─ enables Surviving Analysis Deletion

UI / Query API (deferred)
  └─ depends on Ingestion Hooks + Immutability Guarantees

Dual-Drain / Tamper Evidence (deferred)
  └─ depends on evlog audit pipeline wiring
```

### Dependency Notes

- **Audit schema must be designed before ingestion hooks.** Changing the schema after hooks are wired forces migration rewrites and may lose early events.
- **Surviving deletion is a schema decision, not an application feature.** It is determined by the foreign-key behavior on `analysis_id` and by RLS that prevents deleting audit rows.
- **Sync-driven state transitions are user-visible lifecycle events.** The scheduled task is the actor, but the user who originally invoked the workflow is the logical owner; capture both `owner_id` and `actor_id` where they differ.
- **evlog audit helpers are optional but recommended.** They provide typed catalogs, idempotency, and integration with the existing logging pipeline; however, the core v1.3 feature can ship with direct inserts if needed.

## MVP Definition

### Launch With (v1.3)

Minimum viable audit trail — data model and ingestion only, no UI.

- [ ] **Audit event schema** — `analysis_audit_events` table with: `id`, `analysis_id` (nullable, `onDelete: 'set null'`), `owner_id`, `workflow_id`, `galaxy_invocation_id`, `galaxy_instance_url`, `action`, `previous_state`, `new_state`, `actor_type`, `actor_id`, `actor_email` (nullable), `reason` (nullable), `correlation_id`, `idempotency_key`, `occurred_at`, `recorded_at`
- [ ] **Append-only enforcement** — RLS forbids `update`/`delete`; application inserts only; add a test that asserts no update/delete paths exist
- [ ] **Creation audit hook** — insert `analysis.created` event atomically inside `insertAnalysis` transaction
- [ ] **State-transition audit hook** — insert `analysis.state_changed` event whenever `updateAnalysisState` runs, including sync-driven transitions
- [ ] **Deletion audit hook** — insert `analysis.deleted` event before the `analyses` row is removed
- [ ] **Actor resolution** — user-initiated actions use the authenticated Supabase user; scheduled-task actions use `actor_type: 'system'` / `actor_id: 'galaxy:sync-analyses'`
- [ ] **Idempotency** — unique constraint on `idempotency_key` so sync retries do not duplicate events
- [ ] **Indexes** — `(owner_id, occurred_at)`, `(analysis_id)`, `(action)`, `(galaxy_invocation_id)` for operator queries

### Add After Validation (v1.x)

Features to add once the core table and hooks are proven.

- [ ] **Typed audit catalog** — `defineAuditCatalog('analysis', ...)` and module augmentation for autocomplete
- [ ] **Denial logging** — `analysis.delete.denied` and similar events for authorization failures
- [ ] **Full state diff snapshots** — store `changes: auditDiff(before, after)` for invocation objects
- [ ] **Server query endpoint** — operator-only `/api/db/analyses/:id/audit` or admin list endpoint
- [ ] **Dual-drain wiring** — route audit events to both Postgres and a signed FS journal via evlog

### Future Consideration (v2+)

Defer until product-market fit and compliance requirements are clearer.

- [ ] **Customer-facing UI audit log** — paginated, filterable history in the wiki/UI layer
- [ ] **Tamper-evident hash-chain** — `signed({ strategy: 'hash-chain' })` with persisted state
- [ ] **Compliance sink (S3 Object Lock / Axiom dataset)** — separate, long-retention artifact
- [ ] **Crypto-shredding / GDPR right-to-be-forgotten** — per-user encryption key for PII fields
- [ ] **Anomaly detection / alerting** — failed deletes, unusual state transitions, ownership changes

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Immutable audit event table | HIGH | LOW | P1 |
| Creation / state-change / deletion hooks | HIGH | LOW | P1 |
| Survives analysis deletion | HIGH | LOW | P1 |
| Actor resolution (user + system) | HIGH | LOW | P1 |
| Idempotency / unique constraint | MEDIUM | LOW | P1 |
| Typed audit catalog | MEDIUM | LOW | P2 |
| State diff snapshots | MEDIUM | MEDIUM | P2 |
| Denial logging | MEDIUM | LOW | P2 |
| Correlation / causation IDs | MEDIUM | LOW | P2 |
| Server query endpoint | MEDIUM | MEDIUM | P2 |
| Dual-drain / signed journal | HIGH | MEDIUM | P3 |
| Tamper-evident signatures | HIGH | MEDIUM | P3 |
| Crypto-shredding | MEDIUM | HIGH | P3 |
| Customer-facing UI | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for v1.3 launch
- P2: Should have, add once core is validated
- P3: Nice to have / compliance-driven, defer until requirements are explicit

## Sources

| Source | What it informed | Confidence |
|--------|------------------|------------|
| `PROJECT.md` v1.3 milestone scope | Feature boundaries, UI out-of-scope, fields to capture (Supabase user, Galaxy instance, workflow) | HIGH |
| `build-audit-logs` skill & project conventions | Audit schema shape, actor/outcome/target model, dual-drain, redaction, denial coverage, `mockAudit` testing | HIGH |
| Existing `analyses.ts` and `analysisMonitoring.ts` schema + CRUD/sync utilities | Where to hook creation, state changes, and deletion; which identifiers are available | HIGH |
| evlog audit docs ([overview](https://www.evlog.dev/use-cases/audit/overview), [schema](https://www.evlog.dev/use-cases/audit/schema), [compliance](https://www.evlog.dev/use-cases/audit/compliance), [recording](https://www.evlog.dev/use-cases/audit/recording)) | Typed catalogs, idempotency, retention, GDPR crypto-shredding, `AuditFields` design | LOW (webfetch) |
| Wikipedia "Audit trail" | General definition and immutability expectations | LOW (webfetch) |

---
*Feature research for: append-only analysis audit trail*
*Researched: 2026-08-10*
