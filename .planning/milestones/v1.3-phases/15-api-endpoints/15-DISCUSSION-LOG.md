# Phase 15: API Endpoints - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-10
**Phase:** 15-api-endpoints
**Areas discussed:** requireAdminRole design, Self endpoint response, Error/status convention

---

## requireAdminRole design

| Option | Description | Selected |
|--------|-------------|----------|
| Admin-specific helper | Single requireAdminRole(user), named per API-04 verbatim | |
| Generic requireRole(user, role) | A generic role gate that admin is one instance of, reusable by future admin endpoints | ✓ |

**User's choice:** Generic requireRole(user, role)
**Notes:** —

---

| Option | Description | Selected |
|--------|-------------|----------|
| In supabase.ts | Next to getSupabaseUser, since AdminRoleCheckError/ForbiddenError already live there | ✓ |
| New rbac.ts file | Dedicated utils/grizzle/rbac.ts for role gating | |

**User's choice:** In supabase.ts
**Notes:** Signature requireRole(user, role) -> Effect<Unit, AdminRoleCheckError | ForbiddenError, Drizzle>

---

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse join, no inner log | Existing Drizzle userRoles/roles join, limit 1; ForbiddenError / AdminRoleCheckError; logging stays in handler | ✓ (after advice) |
| Reuse join, log inside | Same query, emits Effect.log inside the helper | |

**User's choice:** Reuse join, no inner log
**Notes:** User asked for advice; recommended no-inner-log consistent with existing handler-layer logging and LOGGING-SPEC. Confirmed.

---

## Self endpoint response

| Option | Description | Selected |
|--------|-------------|----------|
| Full stats replaces counts | Both endpoints return the AnalysisMonitoringStats composite; no counts-only path | ✓ (after advice) |
| Keep counts-only here | Retain legacy counts shape on self endpoint | |

**User's choice:** Full stats, both endpoints
**Notes:** User asked for advice; recommended full upgrade since AnalysisMonitoringStats extends AnalysisMonitoringCounts (backward-compatible) and API-01 requires the self endpoint to return the composite. Confirmed both endpoints.

---

## Error/status convention

| Option | Description | Selected |
|--------|-------------|----------|
| Unify 401/403/500 | Both endpoints share the same mapping: 401 / 403 / 500-with-log | ✓ (after advice) |
| Leave asymmetric | Keep self (401+500) and only admin (403) as-is | |

**User's choice:** Unify inline
**Notes:** User asked for advice; recommended unifying inline (no mapper helper for two call sites), 500s logged via useLogger(event). Confirmed.

---

## the agent's Discretion

- Trend granularity on the wire (flagged, not selected) — left to planner/recommended default 'day' per Phase 14 D-04.
- Mechanical details: requireRole body/SQL, exact evlog messages, handler-local helpers.

## Deferred Ideas

- A third admin-gated endpoint would justify extracting the shared Either.match mapper (D-08 revisit).
- Possibly exposing a `?granularity=` query param on the API (not locked).
