# Pitfalls Research: Analysis Audit Trail

**Domain:** Append-only entity audit trail for Galaxy analysis lifecycle events
**Researched:** 2026-08-10
**Confidence:** HIGH (GaaS codebase + evlog audit skill); MEDIUM (general industry patterns not cross-checked against live post-mortems)

## Critical Pitfalls

### Pitfall 1: Foreign-Key Cascade Deletes the Audit History

**What goes wrong:**
The `analyses` table owns rows in `analysis_inputs`, `analysis_outputs`, `jobs`, and `analysis_monitoring` via `onDelete: 'cascade'`. If the audit table references `analyses.id` with a normal foreign key and the user deletes their analysis, PostgreSQL silently removes every audit record that was supposed to be append-only and immortal. The v1.3 goal — "audit records remain when the parent analysis is deleted" — is violated at the schema level.

**Why it happens:**
Drizzle's `.references(() => analyses.id)` defaults to no action, but reviewers often add `{ onDelete: 'cascade' }` reflexively to keep the schema "clean." Because the existing child tables all use cascade, the new audit table is likely to be copied from the same pattern without considering immutability.

**How to avoid:**
- Do **not** foreign-key `analysis_audit.analysis_id` to `analyses.id` with a cascading delete.
- Prefer `onDelete: 'set null'` plus a separate immutable `analysis_galaxy_id` column (denormalized from `analyses.galaxy_id`) so the audit row still identifies the target even after the analysis row is gone.
- Alternatively, use no foreign key at all for the audit table and enforce referential integrity through application-level checks or a separate `analysis_snapshots` table.

**Warning signs:**
- Migration contains `references(() => analyses.id, { onDelete: 'cascade' })` for the audit table.
- Test deletes an analysis and then asserts the audit count did not change; if this test is missing, the pitfall is present.

**Phase to address:** **v1.3 schema design** (first phase of the milestone).

---

### Pitfall 2: Audit Writes Are Inline, Failures Break the Main Flow

**What goes wrong:**
An audit record is inserted synchronously inside the same Effect program that creates or updates an analysis. If the audit insert fails (disk full, RLS mismatch, network blip), the entire analysis creation/mutation fails and the user sees an error. Worse, if the audit write is not retried, a successful analysis mutation can silently occur with no audit record.

**Why it happens:**
The natural Effect-TS instinct is to sequence everything in one `Effect.gen`: validate, insert analysis, insert audit, return. Because audit is a side effect that should never influence business outcome, coupling it in the same success path is a category error.

**How to avoid:**
- Treat audit writes as **best-effort fire-and-forget** from the caller's perspective: append the audit inside a finalizer or a separate `Effect.forkDaemon`/`Effect.ignore` so the main Effect succeeds even if audit logging fails.
- Use a resilient drain (evlog FS or Supabase) and recover at the sink level, not at every call site.
- For forensic integrity, consider transactional outbox: write the audit row in the same DB transaction as the analysis mutation, but in a separate table with no application-level rollback dependency. In Supabase/Drizzle this means using a Drizzle transaction (when the sync path is migrated to Drizzle) or a Postgres function/RPC that writes both atomically.

**Warning signs:**
- `yield* insertAnalysisAudit(...)` appears in the main success path with no error handling.
- Tests assert that audit failures throw the same error as analysis creation failures.

**Phase to address:** **v1.3 ingestion hook design**.

---

### Pitfall 3: Immutability Is Violated by Updates or Deletes

**What goes wrong:**
Someone later "fixes" a typo in an audit record, or an admin endpoint allows updating `audit.outcome`. Once audit rows are mutable, the history is no longer trustworthy for compliance or forensics. Even a benign `updated_at` column signals that rows can change.

**Why it happens:**
Drizzle schemas default to mutable tables. Without explicit RLS policies that forbid `UPDATE` and `DELETE`, any service-role client or future migration can modify audit rows. The v1.3 requirement "append-only" must be enforced at the database layer, not just by convention.

**How to avoid:**
- Add Postgres RLS policies on `analysis_audit` that reject `UPDATE` and `DELETE` for all roles (or allow only a dedicated tamper-evident admin role).
- Omit an `updated_at` column; include only `occurred_at` / `recorded_at` timestamps.
- If correction is genuinely required, add a compensating record with `action: 'audit.corrected'` referencing the prior record, rather than mutating it.
- Consider a generated column or trigger that computes a hash over the row and stores it in the next row (hash chain) for tamper evidence.

**Warning signs:**
- Migration includes `updatedAt: timestamp('updated_at')` on the audit table.
- RLS policy file has no `for: 'update'` / `for: 'delete'` deny rules for the audit table.

**Phase to address:** **v1.3 schema design**.

---

### Pitfall 4: Identity Denormalized Too Early or Too Late

**What goes wrong:**
The audit record needs the authenticated Supabase user at the moment of the event. If it stores only the user's UUID, the audit is useless after the user is deleted or changes email. If it eagerly denormalizes the email/name at write time, it captures stale PII into an immutable table and complicates GDPR right-to-erasure. If it stores only `actor.type: 'user'` without a stable id, forensics cannot correlate actions.

**Why it happens:**
The `analyses` table stores `owner_id` (Supabase auth UUID). It is tempting to copy only that UUID into the audit row. But audit rows must survive user deletion and remain readable by operators, so they need a durable display name or external identifier while also supporting crypto-shredding of PII.

**How to avoid:**
- Store a stable `actor_id` (the Supabase auth UUID) plus a denormalized `actor_display` (email or username) captured at write time.
- Encrypt PII in `actor_display` with a per-actor key held outside the audit store. To "forget" a user, delete the key (crypto-shredding) without mutating the immutable audit rows.
- For system actions (sync task), use `actor.type: 'system'`, `actor.id: 'galaxy:sync-analyses'`, not a hard-coded user UUID.

**Warning signs:**
- Audit schema has `user_id` but no `actor_type` or `actor_display`.
- `actor.id` in the sync task is set to the service-role key identifier or a cron UUID.

**Phase to address:** **v1.3 schema design** + **ingestion hook wiring**.

---

### Pitfall 5: Write Amplification and Storage Bloat

**What goes wrong:**
The sync task currently runs every 30 seconds and touches every non-terminal analysis. If every sync poll writes a new audit event ("state unchanged: running"), the audit table grows by millions of rows per month even when nothing meaningful happened. Queries slow down, storage costs rise, and the useful signal drowns in noise.

**Why it happens:**
Audit logging is treated as observability: "log everything, filter later." But audit storage is long-term and immutable, so it must be selective. The sync task's high cadence magnifies any over-logging mistake.

**How to avoid:**
- Log only **state transitions** and **significant lifecycle events**: `created`, `state_changed`, `deleted` (soft), `sync_failed`, `sync_retry_scheduled`. Do not log "still running" polls.
- Include a `changed_at` / `occurred_at` timestamp from the source event, not the audit insert time, so repeated syncs do not create duplicate timeline entries.
- Add a unique constraint or idempotency key on `(analysis_id, event_type, occurred_at, digest)` to make retries safe.
- Plan a retention/partitioning strategy: partitioned by `recorded_at` month or by `galaxy_id`; archive cold partitions.

**Warning signs:**
- Audit insert is called unconditionally inside `syncAnalysisEffect` regardless of whether `effectiveState` changed.
- No `WHERE state IS DISTINCT FROM old_state` guard exists before writing.

**Phase to address:** **v1.3 ingestion hook design**.

---

### Pitfall 6: PII and Secrets Leak into Immutable Storage

**What goes wrong:**
The `analyses.parameters` and `invocation` JSON columns can contain workflow parameters, dataset names, user emails, or Galaxy API details. If `audit.changes` stores a diff of these objects, sensitive data becomes permanently embedded in an immutable table that cannot be sanitized without crypto-shredding.

**Why it happens:**
`auditDiff(before, after)` is convenient but blind to field sensitivity. The existing `LOGGING-SPEC.md` already forbids logging full invocation payloads and parameters; the same redaction rules must apply to audit `changes`.

**How to avoid:**
- Apply `auditRedactPreset` paths globally: `password`, `token`, `apiKey`, `cardNumber`, `cvv`, `ssn`, `cookie`, `authorization`, plus GaaS-specific paths like `parameters.*.api_key`, `invocation.steps.*.tool_inputs`.
- Do not store full `before`/`after` snapshots in the audit row unless they are scrubbed. Prefer storing only changed fields: `changes: { state: { from: 'queued', to: 'running' } }`.
- Never put Galaxy API keys, Supabase service-role keys, or user JWTs into audit context.

**Warning signs:**
- Audit table has a generic `payload jsonb` or `changes jsonb` column with no schema/allowlist.
- Test fixtures include raw `invocation` objects in audit assertions.

**Phase to address:** **v1.3 schema design** + **redaction review**.

---

### Pitfall 7: Audit Ingestion Violates Layer Boundaries

**What goes wrong:**
The ingestion hook lives in `packages/nuxt-galaxy` but is consumed by `@gaas/wiki` pages. If `@gaas/wiki` imports the audit helper or types directly from `nuxt-galaxy`, it violates the layer boundary (`wiki` can only import `@gaas/ui`, not `nuxt-galaxy` internals). Later refactors of `nuxt-galaxy` break the wiki build.

**Why it happens:**
Audit events are needed for UI display in the wiki layer. The quickest path is to import `useAnalysisAudit()` from `nuxt-galaxy/runtime/app/composables`, but AGENTS.md explicitly forbids wiki → nuxt-galaxy imports.

**How to avoid:**
- Keep audit writes server-side inside `nuxt-galaxy`.
- Expose audit data through a stable API contract (`/api/db/analyses/:id/audit`) or through `@gaas/ui` composables that wrap the nuxt-galaxy API.
- For v1.3 there is no UI, so the risk is type leakage in shared packages. Put public audit types in `@gaas/ui` or a shared `types` package, not in `nuxt-galaxy` internals.

**Warning signs:**
- `packages/wiki` imports from `nuxt-galaxy/src/runtime/...`.
- Audit types are defined inside `nuxt-galaxy/server/db/schema` and re-exported to client code without an abstraction layer.

**Phase to address:** **v1.3 package layout**.

---

### Pitfall 8: Only Successes Are Audited

**What goes wrong:**
The audit table records every successful analysis creation and state change, but denies, ownership mismatches, and sync failures are never logged. During a security review, the absence of denial records makes it impossible to prove that access controls were enforced.

**Why it happens:**
The happy path is obvious; the negative branches are scattered across authorization helpers, RLS errors, and Effect error channels. It is easy to add `log.audit()` after a successful insert and forget the `log.audit.deny()` in the early-return paths.

**How to avoid:**
- Pair every authorization check with a `log.audit.deny()` before throwing the 403.
- In Effect programs, emit an audit event in both the success and failure branches of `Effect.either`.
- Use `withAudit()` from evlog for high-value actions so outcome resolution (success / failure / denied) is automatic.

**Warning signs:**
- Code contains `throw createError({ status: 403 })` with no preceding audit call.
- Tests assert success audits but have no denial-path test.

**Phase to address:** **v1.3 ingestion hook wiring**.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store full `before`/`after` snapshots in audit rows | Easy diffing and display | Storage bloat; PII exposure; immutable correction pain | Never in production; acceptable only in a throwaway spike |
| Use `onDelete: 'cascade'` on `analysis_audit.analysis_id` | Simple referential cleanup | Destroys append-only history | Never |
| Inline audit inserts in the main DB transaction | Strong atomicity | Audit failures break user flows | Only if the audit insert is isolated with `Effect.ignore` or an outbox pattern |
| Share audit types directly from `nuxt-galaxy` internals | Fewer files | Violates layer boundaries | Never; use `@gaas/ui` abstraction |
| Skip denial audits initially | Faster implementation | Security review gap; silent policy violations | Never; denial coverage is harder to retrofit |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Supabase auth | Recording the session/JWT ID as `actor.id` | Record the stable Supabase auth UUID; correlate sessions via `context.requestId` |
| Drizzle ORM | Adding `updatedAt` to the audit table | Omit `updatedAt`; enforce immutability with RLS and no `UPDATE` policy |
| Effect-TS sync task | Calling `yield* insertAudit(...)` in the main sync path | Fire audit writes in a `Scope` finalizer or fork so sync outcome is unaffected |
| Supabase RLS | Forgetting RLS on audit table because it is server-inserted | Add explicit RLS deny-`UPDATE`/`DELETE` policies even for service roles |
| evlog | Using `log.info()` instead of `log.audit()` | Use `log.audit()` / `withAudit()` so events are force-kept and typed |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| One audit row per sync poll | Audit table grows 100× faster than analyses table | Log only transitions; use idempotency keys | First production sync task run |
| No indexes on audit query columns | Admin "show history for analysis" page times out | Index `(analysis_id, recorded_at)`, `(galaxy_id, recorded_at)`, `(actor_id)` | Hundreds of audits per analysis |
| Storing large JSON diffs in hot rows | Table bloat; slow backups; vacuum pressure | Store only changed fields; archive/partition by month | Thousands of analyses |
| Single global audit sequence / serial PK | Write hot spot under heavy load | Use `bigserial` or UUIDv7; consider partitioning by time | Concurrent analysis creation bursts |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Mutable audit rows | Tampering goes undetected | RLS deny UPDATE/DELETE; hash-chain or signed events |
| PII in immutable audit | GDPR / HIPAA violation; cannot erase | Crypto-shred PII; encrypt `actor_display` with per-actor key |
| Secrets in `changes` JSON | Permanent credential exposure | Apply `auditRedactPreset` paths globally; field-level allowlist |
| Service role bypasses audit RLS | Insider/admin tampering | Enforce audit policies even for `service_role`; log meta-audits |
| Missing denial audits | Cannot prove access controls work | Pair every 403 with `log.audit.deny()` |

## UX Pitfalls

This milestone has **no UI**, but the data model choices now constrain future UX.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No stable display identity | Deleted users show as raw UUIDs in history | Capture `actor_display` at write time, encrypted |
| No event ordering guarantee | History appears out of order under retries | Use source `occurred_at` + monotonic `recorded_at` + serial id |
| Missing "reason" field | Users cannot see why state changed | Include `reason` or `causation_id` for system-driven transitions |

## "Looks Done But Isn't" Checklist

- [ ] **Schema:** Audit table has no `onDelete: 'cascade'` to `analyses.id` and no `updated_at` column.
- [ ] **RLS:** Policies explicitly deny `UPDATE` and `DELETE` on the audit table.
- [ ] **Actor identity:** `actor.type` and `actor.id` are correct for user/system/api/agent; user UUID is stable, not session/JWT.
- [ ] **Denial coverage:** Every authorization failure and validation rejection logs a denied audit before returning 403/400.
- [ ] **Idempotency:** Retries do not create duplicate audit rows for the same logical event.
- [ ] **Redaction:** Audit `changes` and context contain no secrets, tokens, or raw invocation payloads.
- [ ] **Failure isolation:** Audit write failures do not fail analysis mutations; main flow tests still pass with audit sink disabled.
- [ ] **Layering:** `@gaas/wiki` does not import `nuxt-galaxy` internals for audit types or helpers.
- [ ] **Tests:** At least one test verifies audit rows survive analysis deletion.
- [ ] **Retention:** A retention/partitioning strategy is documented even if not implemented yet.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Cascade deleted audit rows | HIGH / irreversible | Restore from backup; impossible if no backup. Prevent by schema review. |
| Audit write failures went unnoticed | MEDIUM | Add a health check on the audit sink; backfill missing events from application logs if possible. |
| PII leaked into audit rows | HIGH | Implement crypto-shredding; rotate keys for affected actors. |
| Layer boundary violation | LOW-MEDIUM | Extract shared types into `@gaas/ui` or shared package; update imports. |
| Denial audits missing | MEDIUM | Add instrumentation retroactively; add tests; accept historical gap. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Cascade delete audit history | v1.3 schema design | Migration review; test deletes analysis and asserts audit count unchanged |
| Audit failures break main flow | v1.3 ingestion hook design | Test with audit sink failure; main mutation still succeeds |
| Mutable audit rows | v1.3 schema design | RLS policy test; attempt `UPDATE`/`DELETE` and assert rejection |
| Identity denormalization timing | v1.3 schema + ingestion | Test audit row contains stable actor id and display at write time |
| Write amplification | v1.3 ingestion hook design | Test repeated sync of unchanged analysis creates zero audit rows |
| PII/secrets in audit | v1.3 redaction review | Audit assertions redact known secret paths; scan fixtures |
| Layering violations | v1.3 package layout | `grep`/`typecheck` that wiki imports no nuxt-galaxy internals |
| Missing denial audits | v1.3 ingestion hook wiring | Test every 403 path emits `outcome: 'denied'` audit |
| Performance / indexing | v1.3 schema design | EXPLAIN on "audit history for analysis" query |
| Retention | v1.3 documentation | Document retention window; schedule follow-up phase for partitioning |

## Sources

- [Project] `.planning/PROJECT.md` — v1.3 milestone scope and constraints.
- [Project] `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts` — current `analyses` table and cascade patterns.
- [Project] `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analysisMonitoring.ts` — precedent for soft-immune child table (`onDelete: 'set null'`).
- [Project] `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` — sync task boundaries where audit hooks will be inserted.
- [Project] `.planning/LOGGING-SPEC.md` — secret-redaction rules and wide-event shape.
- [Project] `AGENTS.md` — layer boundary (`@gaas/wiki` cannot import `nuxt-galaxy` internals).
- [Skill] `.agents/skills/build-audit-logs/SKILL.md` — evlog audit patterns, redaction, denial coverage, and common pitfalls.

---
*Pitfalls research for: GaaS v1.3 Analysis Audit Trail*
*Researched: 2026-08-10*
