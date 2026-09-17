# Requirements: GaaS — Galaxy as a Service

**Defined:** 2026-08-10
**Core Value:** Developers can reliably build, deploy, and operate custom Galaxy-powered web interfaces with clear observability, because structured logging makes runtime behavior understandable to both humans and LLMs.

## v1.3 Requirements

### Audit Data Model

- [ ] **AUDT-01**: `analysis_audit_log` table exists in the `galaxy` schema with minimal immutable columns
- [ ] **AUDT-02**: Audit table uses a nullable foreign key to `analyses` with `onDelete: 'set null'` so history survives deletion
- [ ] **AUDT-03**: Audit table has RLS policies that prevent `UPDATE` and `DELETE`
- [ ] **AUDT-04**: Append-only trigger rejects any `UPDATE`/`DELETE` attempt on audit rows
- [ ] **AUDT-05**: Audit records include denormalized `analysis_galaxy_id` so they remain referenceable after analysis deletion

### Ingestion Hooks

- [ ] **INGR-01**: A `created` audit event is written when an analysis first lands in the GaaS DB
- [ ] **INGR-02**: A `state_changed` audit event is written only when the effective Galaxy state differs from the persisted state
- [ ] **INGR-03**: A `deleted` audit event is written before the analysis row is removed
- [ ] **INGR-04**: User-initiated actions record the authenticated Supabase user UUID as the actor
- [ ] **INGR-05**: Sync-initiated actions record a system actor identifier (e.g., `galaxy:sync-analyses`)
- [ ] **INGR-06**: Each audit record denormalizes the Galaxy instance URL and workflow reference
- [ ] **INGR-07**: A deterministic idempotency key prevents duplicate events from sync retries

### Audit Metadata

- [ ] **DATA-01**: State-change events store `from_state` and `to_state`
- [ ] **DATA-02**: State-change events store an allowlisted, minimal state diff in `metadata`
- [ ] **DATA-03**: Correlation/causation IDs tie user actions to resulting system reactions

### evlog Integration

- [ ] **EVLG-01**: Audit events are emitted to evlog as a secondary observability drain without replacing the DB source of truth
- [ ] **EVLG-02**: Typed audit action catalog is defined via evlog `defineAuditCatalog`
- [ ] **EVLG-03**: No secrets (API keys, tokens, raw parameters) are stored in audit metadata

### Security & Denial Coverage

- [ ] **SECU-01**: Authorization/access-denial attempts on analysis lifecycle endpoints are logged as audit events

### Testing

- [ ] **TEST-01**: Unit tests cover `insertAnalysisAuditEventEffect` success and failure paths
- [ ] **TEST-02**: Test verifies audit rows survive when the parent analysis is deleted
- [ ] **TEST-03**: Test verifies RLS policies and append-only trigger reject `UPDATE`/`DELETE`
- [ ] **TEST-04**: Integration test covers create → state change → delete audit trail

### Documentation

- [ ] **DOCS-01**: `.planning/LOGGING-SPEC.md` is updated with audit-event conventions
- [ ] **DOCS-02**: Retention expectation and future partitioning strategy are documented

## v2 Requirements

Deferred to a future release. Tracked but not in current roadmap.

### Customer-Facing Audit UI

- **UIAU-01**: Admin/operator can browse the analysis audit log
- **UIAU-02**: Audit log supports filtering by analysis, user, action, and date range

### Advanced Audit Guarantees

- **ADGT-01**: Tamper-evident hash chain links audit rows
- **ADGT-02**: External compliance sink archives audit events (e.g., S3 Object Lock, Axiom)
- **ADGT-03**: Automated partitioning/retention policy is implemented
- **ADGT-04**: Anomaly detection flags unusual audit patterns

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Customer-facing audit UI | v1.3 is data model + ingestion only; UI deferred to v2 |
| Tamper-evident hash chain | Advanced guarantee, not required for initial auditability |
| External compliance sink | No external archive requirement for v1.3 |
| Automated partitioning/retention | Keep-forever policy for now; automation deferred |
| Anomaly detection | Requires UI and baseline data; deferred to v2+ |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUDT-01 | Phase 12 | Pending |
| AUDT-02 | Phase 12 | Pending |
| AUDT-03 | Phase 12 | Pending |
| AUDT-04 | Phase 12 | Pending |
| AUDT-05 | Phase 12 | Pending |
| INGR-01 | Phase 15 | Pending |
| INGR-02 | Phase 16 | Pending |
| INGR-03 | Phase 15 | Pending |
| INGR-04 | Phase 15 | Pending |
| INGR-05 | Phase 16 | Pending |
| INGR-06 | Phase 13 | Pending |
| INGR-07 | Phase 13 | Pending |
| DATA-01 | Phase 13 | Pending |
| DATA-02 | Phase 13 | Pending |
| DATA-03 | Phase 16 | Pending |
| EVLG-01 | Phase 14 | Pending |
| EVLG-02 | Phase 14 | Pending |
| EVLG-03 | Phase 14 | Pending |
| SECU-01 | Phase 15 | Pending |
| TEST-01 | Phase 13 | Pending |
| TEST-02 | Phase 17 | Pending |
| TEST-03 | Phase 17 | Pending |
| TEST-04 | Phase 17 | Pending |
| DOCS-01 | Phase 18 | Pending |
| DOCS-02 | Phase 18 | Pending |

**Coverage:**
- v1.3 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-10*
*Last updated: 2026-08-10 after initial definition*
