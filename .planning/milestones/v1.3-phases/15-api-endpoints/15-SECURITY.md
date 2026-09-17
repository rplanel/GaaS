---
phase: 15
slug: api-endpoints
status: verified
threats_open: 0
asvs_level: 1
created: 2026-08-10
---

# Phase 15 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → API | Untrusted HTTP request crosses here into `GET monitoring` / `GET monitoring/admin`. Session identity is asserted server-side via `getSupabaseUser(event)`; neither endpoint accepts ownerId or role from client input. | `AnalysisMonitoringStats` composite (counts, successRate, perWorkflow, trend) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-15-01 | Information Disclosure / Elevation of Privilege | `admin.get.ts` handler | high | mitigate | All-users stats gated behind `requireRole(user, 'admin')` (implemented at `admin.get.ts:16`); empty role match → `ForbiddenError` → 403; query rejection → `AdminRoleCheckError` → 500. Only an authenticated user with an admin role row in `userRoles ⋈ roles` reaches `getAllAnalysisMonitoringStats()`. | closed |
| T-15-02 | Spoofing / Elevation of Privilege (IDOR) | `monitoring.get.ts` handler | high | mitigate | `ownerId` derived exclusively from `getSupabaseUser(event).id` and passed to `getAnalysisMonitoringStats(supabaseUser.id)` (`monitoring.get.ts:16`). No `?ownerId=`/`?user=` client parameter accepted, so a request can never scope the query to another user's stats. | closed |
| T-15-03 | Information Disclosure | both handlers' `Either.match` 500 branch | medium | mitigate | Internal error details are NOT returned to the client — statusMessage is the generic `'Internal Server Error'` (both handlers); sanitized `Cause.pretty(Cause.fail(error))` is logged server-side via `useLogger(event).error(...)` and `runGalaxyEffect` (LOGGING-SPEC never-log-secrets; no tokens, no raw user/role objects). | closed |
| T-15-04 | Tampering / Data Integrity | `requireRole` join | low | accept | Defense-in-depth only: RLS remains the security boundary and the self composite always filters `owner_id` server-side (API-03). `requireRole` adds an explicit admin gate; Phase 16 TEST-03/TEST-04 prove RLS scoping and gate rejection. | closed (accepted) |
| T-15-SC | Tampering | npm/pnpm installs | low | mitigate | No new package dependencies or installs in this phase (in-place edits only). `drizzle-orm` and RBAC schema imports added to `supabase.ts` are already vendored/declared dependencies — no supply-chain surface introduced. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-15-01 | T-15-04 | The `requireRole` join is defense-in-depth only; RLS remains the true security boundary and the self composite always filters `owner_id` server-side. Explicit admin-gate behavior is proven behaviorally in Phase 16's test suite (TEST-03/TEST-04). Accepted because the gate is additive and cannot weaken RLS. | security auditor | 2026-08-10 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-10 | 5 | 5 | 0 | gsd-security-auditor (orchestrator) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-10
