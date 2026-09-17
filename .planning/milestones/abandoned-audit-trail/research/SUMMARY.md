# Project Research Summary

**Project:** GaaS v1.3 Analysis Audit Trail
**Domain:** Append-only, forensic audit log for Galaxy analysis lifecycle events
**Researched:** 2026-08-10
**Confidence:** MEDIUM-HIGH

## Executive Summary

The v1.3 milestone adds an append-only database audit trail to the existing `nuxt-galaxy` Nuxt module. The goal is not to build a new observability pipeline, but to record immutable facts about analysis creation, state transitions, and deletion so operators can reconstruct history after an analysis row has been removed. Experts implement this by keeping the audit store physically independent of the mutable entity table: a PostgreSQL table with denormalized identifiers, no cascading foreign keys, strict RLS policies that forbid `UPDATE`/`DELETE`, and inserts that happen inside (or alongside) the existing analysis CRUD transactions.

The recommended approach is to add a single new Drizzle table in the existing `galaxy` schema, a reusable `insertAnalysisAuditEventEffect` helper in the `grizzle` data-access layer, and targeted hooks inside `insertAnalysis`, `updateAnalysisState`, `deleteAnalysis`, and `syncAnalysisEffect`. The canonical record lives in Postgres; evlog remains a secondary observability drain. This keeps the milestone bounded: no new npm dependencies, no UI, and no external stores, while satisfying the "survives analysis deletion" requirement.

The biggest risks are schema-level mistakes that break immutability (cascade deletes, mutable rows, inline failures that block the main flow, and write amplification from the 30-second sync task). These are mitigated by designing the table with `onDelete: 'set null'` or no foreign key, adding RLS deny policies plus an optional append-only trigger, emitting audit events only on real state changes, and isolating audit-write failures from the main Effect success path.

## Key Findings

### Recommended Stack

No new runtime dependencies are required. The audit trail reuses the existing Nuxt/Nitro server layer, Effect-TS, Drizzle ORM/Kit, postgres-js, Supabase Auth, and evlog. The only new artifacts are a Drizzle schema file, a generated migration, a custom migration for the append-only trigger, a small `grizzle` helper, and hook calls in existing mutators.

**Core technologies:**
- **Nuxt / Nitro** (`catalog:nuxt`) — server routes and the `galaxy:sync-analyses` scheduled task are the only mutators; audit ingestion runs server-side.
- **Effect-TS** (`catalog:`) — keeps audit inserts composable, typed, and testable inside existing `Effect.gen` pipelines.
- **PostgreSQL (Supabase-hosted)** — existing metadata store; supports JSONB, partial indexes, immutable triggers, and row-level security.
- **Drizzle ORM + Drizzle-Kit** (`catalog:`) — schema definition and migration generation; same workflow already used for `analyses`, `analysis_monitoring`, etc.
- **evlog** (`catalog:`) — secondary observability drain via `audit()` / `log.audit()`; complements but does not replace the DB audit record.

### Expected Features

**Must have (table stakes):**
- Dedicated `analysis_audit_log` table in the `galaxy` schema — append-only and independent of `analyses`.
- Creation, state-transition, and deletion hooks inside existing CRUD/sync helpers.
- Survival of audit rows after analysis deletion (no cascading FK).
- Actor resolution for user actions (Supabase auth UUID) and system actions (`galaxy:sync-analyses`).
- Immutable enforcement via RLS deny policies and an optional append-only trigger.
- Idempotency so sync retries do not duplicate events.

**Should have (competitive):**
- Typed audit action catalog via evlog `defineAuditCatalog`.
- Denial logging for authorization failures.
- State diff snapshots limited to changed fields.
- Correlation/causation IDs tying user actions to system reactions.

**Defer (v2+):**
- Customer-facing UI audit log, tamper-evident hash-chain, compliance sink (S3 Object Lock / Axiom), crypto-shredding, anomaly detection, and partitioning.

### Architecture Approach

The audit layer is a thin wrapper around the existing analysis lifecycle. A new `analysis_audit_log` table stores denormalized identifiers (`analysis_id`, `analysis_galaxy_id`, `owner_id`, `workflow_id`, `history_id`, `galaxy_instance_url`), event metadata (`action`, `actor_type`, `actor_id`, `from_state`, `to_state`, `metadata`, `message`), and timestamps. A nullable FK to `analyses` with `onDelete: 'set null'` lets the record survive deletion. A single `insertAnalysisAuditEventEffect` helper in `src/runtime/server/utils/grizzle/audit.ts` is called from `runAnalysis` (created), `syncAnalysisEffect` (state_changed), and `deleteAnalysis` (deleted). evlog emits a secondary wide event without replacing the Postgres source of truth.

**Major components:**
1. **`analysis_audit_log` table** — immutable, append-only store of lifecycle facts.
2. **`insertAnalysisAuditEventEffect` helper** — typed Effect program that inserts audit rows.
3. **`runAnalysis` / `syncAnalysisEffect` / `deleteAnalysis`** — modified to emit audit events at the authoritative mutation points.
4. **RLS policies + immutable trigger** — enforce append-only behavior at the database layer.

### Critical Pitfalls

1. **Cascade delete on `analysis_id`** — A normal FK with `onDelete: 'cascade'` would silently remove audit history when an analysis is deleted, defeating the core requirement. Use `onDelete: 'set null'` or no FK, and store `analysis_galaxy_id` redundantly.
2. **Audit failures breaking the main flow** — Inserting audit rows inline in the primary success path can cause user-visible failures. Isolate audit writes with `Effect.forkDaemon`, `Effect.ignore`, or a transactional outbox so analysis mutations succeed even if audit logging is degraded.
3. **Mutable audit rows** — Any `UPDATE`/`DELETE` path or `updated_at` column undermines non-repudiation. RLS policies should deny `UPDATE`/`DELETE`, and an optional Postgres trigger should reject mutation attempts.
4. **Write amplification from sync polling** — Logging every sync poll would generate millions of rows. Emit audit events only when the effective state differs from the persisted state, and use an idempotency key.
5. **PII/secrets in immutable JSON** — `parameters`, invocation payloads, and emails must not be stored raw in audit rows. Apply the same redaction rules as `LOGGING-SPEC.md`; store only allowlisted scalar changes.
6. **Layer boundary violations** — `@gaas/wiki` must not import `nuxt-galaxy` internals. Keep audit types/helpers server-side or expose them through `@gaas/ui` abstractions.

## Implications for Roadmap

### Phase 1: Schema & Immutability Foundation
**Rationale:** Every later step depends on the table shape and its immutability guarantees. If the schema is wrong, hooks have to be rewritten and early events may be lost.
**Delivers:** `analysis_audit_log` Drizzle schema, generated migration, custom migration for the append-only trigger, owner/admin RLS policies, and indexes.
**Addresses:** Dedicated audit table, survival after deletion, immutable enforcement, timestamping.
**Avoids:** Cascade-delete history, mutable rows, missing RLS.
**Research flag:** Standard patterns; no extra research needed beyond confirming enum/field names against existing schema files.

### Phase 2: Audit Insert Helper & Unit Tests
**Rationale:** A single typed Effect helper establishes the error boundary and insert pattern before wiring it into multiple mutators.
**Delivers:** `insertAnalysisAuditEventEffect` in `utils/grizzle/audit.ts`, unit tests for success/failure, and dual evlog emission.
**Addresses:** Typed insert, Effect-TS composability, evlog dual-drain.
**Avoids:** Inline audit writes scattered across call sites.
**Research flag:** Standard pattern; minimal research.

### Phase 3: Creation & Deletion Hooks
**Rationale:** User-initiated lifecycle events are the simplest to instrument and validate before adding the more complex sync-driven transitions.
**Delivers:** `created` event inside `insertAnalysis` transaction and `deleted` event inside `deleteAnalysis` (before the row is removed).
**Addresses:** Creation audit hook, deletion audit hook, actor resolution for users.
**Avoids:** Audit failures breaking creation/deletion, missing deletion record.
**Research flag:** Standard; confirm `galaxyInstanceUrl` and workflow/history context are available in `analyses.post.ts`.

### Phase 4: Sync State-Transition Hooks
**Rationale:** Most analysis state changes happen in the scheduled sync task, so this is the highest-value hook but requires careful guards against duplicate/no-op events.
**Delivers:** `state_changed` event in `syncAnalysisEffect` only when effective state differs from persisted state; `actor_type: 'system'`.
**Addresses:** State-transition audit hook, idempotency, system actor resolution.
**Avoids:** Write amplification, duplicate retry events.
**Research flag:** Higher risk; may need a short spike to confirm state comparison semantics and idempotency key format in the sync loop.

### Phase 5: Immutability, Boundary & End-to-End Validation
**Rationale:** Once hooks exist, verify the invariants that make the audit trail trustworthy: rows survive deletion, no code path can update/delete them, and layer boundaries are respected.
**Delivers:** Tests for survival after analysis deletion, RLS mutation rejection, no wiki→nuxt-galaxy internal imports, and a full create → sync transition → delete integration test.
**Addresses:** Append-only enforcement, deletion survival, layer isolation.
**Avoids:** Mutable rows, cascade deletes, boundary violations.
**Research flag:** Standard; use existing test helpers and MSW/Effect Layer mocks.

### Phase 6: Documentation & Retention Planning
**Rationale:** Operators and future developers need to know the audit event shape, redaction rules, and retention expectations.
**Delivers:** Updates to `LOGGING-SPEC.md`, inline schema docs, and a documented retention/partitioning strategy (implementation deferred).
**Addresses:** Observability integration, compliance posture.
**Avoids:** PII leaks, undefined retention.
**Research flag:** Standard; align with evlog audit docs.

### Phase Ordering Rationale

The order mirrors the dependency chain discovered in the research: schema first (everything depends on it), helper next (single reusable primitive), then user-initiated hooks (simpler), then sync hooks (most complex), then invariant tests, then docs. Grouping by mutation type keeps code reviews focused and makes it easy to roll back individual hooks if a problem is found. Deferring UI, tamper-evidence, and partitioning keeps v1.3 achievable while preserving those options for later milestones.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (Sync State-Transition Hooks):** Needs confirmation of the exact state comparison, idempotency key, and how sync retries interact with partial updates.
- **Phase 5 (End-to-End Validation):** Needs verification of the best way to test RLS deny policies and immutable triggers in the existing local Supabase/Drizzle test harness.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Schema):** Follows existing Drizzle/Supabase patterns in `nuxt-galaxy`.
- **Phase 2 (Helper):** Effect-TS + Drizzle insert pattern is already established across `grizzle` helpers.
- **Phase 3 (Creation/Deletion Hooks):** Direct extensions of existing `runAnalysis`/`deleteAnalysis` flows.
- **Phase 6 (Documentation):** Pure docs/retention planning; no technical research required.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Reuses existing project dependencies and migration workflow; no new packages needed. |
| Features | MEDIUM | Boundaries are clear from `PROJECT.md`, but exact field set (e.g., `actor_email`, `reason`) needs implementation-level validation. |
| Architecture | HIGH | Patterns are already the project baseline; exact column shape is tunable during implementation. |
| Pitfalls | HIGH | Most pitfalls are well-documented in the `build-audit-logs` skill and map directly to the existing codebase. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Exact column shape:** `STACK.md` and `ARCHITECTURE.md` differ on whether to use a nullable FK to `analyses` (`onDelete: 'set null'`) or fully denormalized plain columns. Decide during Phase 1 schema design and document the rationale.
- **Audit-write failure semantics:** Research suggests both transactional outbox and fire-and-forget isolation. Choose the failure-isolation strategy during Phase 2 and test it explicitly.
- **Idempotency key format:** Needs finalization in Phase 4 to prevent duplicate sync events; should be deterministic from action + target + coarse timestamp.
- **evlog integration depth:** Decide whether to adopt `defineAuditCatalog` and `log.audit.deny()` in v1.3 or keep direct inserts and defer typed catalog/denial logging.
- **Retention/partitioning policy:** Document expected retention window and trigger criteria for a future archiving phase; no implementation needed yet.

## Sources

### Primary (HIGH confidence)
- `.planning/PROJECT.md` — v1.3 milestone scope, UI out-of-scope, required fields.
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts` — existing `analyses` table and cascade patterns.
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analysisMonitoring.ts` — precedent for soft-immune child table with `onDelete: 'set null'`.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/{analyses.ts,sync/analysis.ts}` — hook insertion points.
- `.planning/LOGGING-SPEC.md` — secret-redaction rules and wide-event shape.
- `AGENTS.md` — layer boundary rules (`@gaas/wiki` cannot import `nuxt-galaxy` internals).

### Secondary (MEDIUM confidence)
- `build-audit-logs` skill — evlog audit helpers, two-drain pattern, redaction, denial coverage, anti-patterns.
- Vendored `evlog` source — `audit()`, `log.audit()`, `buildAuditFields`, `AUDIT_SCHEMA_VERSION`.
- `pnpm-workspace.yaml` / `packages/nuxt-galaxy/package.json` — dependency versions and catalogs.

### Tertiary (LOW confidence)
- evlog audit docs (webfetch) — typed catalogs, retention, GDPR crypto-shredding.
- Wikipedia "Audit trail" — general immutability expectations.

---
*Research completed: 2026-08-10*
*Ready for roadmap: yes*
