---
phase: 15-api-endpoints
plan: 01
subsystem: api
tags: [nuxt-galaxy, drizzle, effect, supabase, rbac, monitoring, api]

requires:
  - phase: 14-stats-query-layer
    provides: getAnalysisMonitoringStats / getAllAnalysisMonitoringStats composite helpers + AnalysisMonitoringStats type
provides:
  - Generic requireRole(user, role) Effect role gate in utils/grizzle/supabase.ts
  - GET /api/db/analyses/monitoring returns AnalysisMonitoringStats (self, session-scoped ownerId)
  - GET /api/db/analyses/monitoring/admin returns all-users AnalysisMonitoringStats behind requireRole(user, 'admin')
affects: [16-testing-quality, api-endpoints, admin-gated endpoints]

actuals:
  tokens: 1748
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Generic Effect role-gate helper (requireRole) returning only typed errors, no logging inside (single seam for admin-gated endpoints)"
    - "Backward-compatible response-shape upgrade via structural extension (AnalysisMonitoringStats extends AnalysisMonitoringCounts)"

key-files:
  created:
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts#requireRole
  modified:
    - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts
    - packages/nuxt-galaxy/src/runtime/server/api/db/analyses/monitoring/admin.get.ts
    - packages/nuxt-galaxy/src/runtime/server/api/db/analyses/monitoring.get.ts

key-decisions:
  - "Extracted a generic requireRole(user, role) Effect helper (not admin-only) into utils/grizzle/supabase.ts next to getSupabaseUser (D-01..D-04), with no logging inside (D-04)."
  - "Both endpoints fully upgrade their response to the AnalysisMonitoringStats composite (D-05), guaranteed backward-compatible by structural extension (D-06)."
  - "Kept the unified 401/403/500 Either.match inline in each handler rather than extracting a mapper (D-08)."
  - "Self endpoint derives ownerId exclusively from getSupabaseUser(event), never client input; no role gate on self (API-03, D-07)."
  - "No ?granularity= param added — the wire ships the Phase 14 default 'day', avoiding out-of-scope query-layer changes."

patterns-established:
  - "requireRole(user, role): Effect<void, AdminRoleCheckError | ForbiddenError, Drizzle> generalizes the userRoles ⋈ roles join (eq(roles.name, role), limit(1))."

requirements-completed: [API-01, API-02, API-03, API-04]

coverage:
  - id: D1
    description: "Shared requireRole(user, role) Effect gate in utils/grizzle/supabase.ts wired into the admin endpoint, which returns the all-users AnalysisMonitoringStats composite behind requireRole(user, 'admin') (API-02, API-04)."
    requirement: API-04
    verification:
      - kind: other
        ref: "pnpm --filter ./packages/nuxt-galaxy typecheck (passes); structural grep: requireRole(user, 'admin') && getAllAnalysisMonitoringStats present in admin.get.ts, no RBAC/drizzle-orm imports there, no logging in supabase.ts"
        status: pass
    human_judgment: true
    rationale: "Verify comprises typecheck + structural grep only; behavioral tests (RLS scoping, 403 rejection, composite shape) are intentionally deferred to Phase 16's test suite."
  - id: D2
    description: "Self monitoring endpoint returns the AnalysisMonitoringStats composite scoped to the server-session ownerId via getAnalysisMonitoringStats(supabaseUser.id) — no client-scoped ownerId param, no role gate on self (API-01, API-03)."
    requirement: API-01
    verification:
      - kind: other
        ref: "pnpm --filter ./packages/nuxt-galaxy typecheck (passes); structural grep: getAnalysisMonitoringStats(supabaseUser.id) && AnalysisMonitoringStats present in monitoring.get.ts, no counts-only path/ForbiddenError/requireRole"
        status: pass
    human_judgment: true
    rationale: "Verify comprises typecheck + structural grep only; behavioral tests (session-scoped ownerId, composite shape) are intentionally deferred to Phase 16's test suite."

duration: 15 min
completed: 2026-08-10
status: complete
---

# Phase 15 Plan 1: API Endpoints Summary

**Wired the Phase 14 AnalysisMonitoringStats composite onto GET /api/db/analyses/monitoring (self) and /admin (all-users), extracting the inline admin-role check into a generic requireRole(user, role) Effect helper in utils/grizzle/supabase.ts**

## Performance

- **Duration:** 15 min
- **Started:** 2026-08-10T21:57:07Z
- **Completed:** 2026-08-10T22:12:07Z
- **Tasks:** 2
- **Files modified:** 3 source files (no new files)

## Accomplishments

- Added `requireRole(user, role): Effect<void, AdminRoleCheckError | ForbiddenError, Drizzle>` to `utils/grizzle/supabase.ts`, generalizing the existing `userRoles ⋈ roles WHERE roles.name = role` join (limit 1). Returns `ForbiddenError` (403) on empty match, `AdminRoleCheckError` (500) on query rejection, and contains **no logging** (D-04 — denial/failure logging stays in the handler layer).
- Upgraded `admin.get.ts` to `Promise<AnalysisMonitoringStats>`: replaced the inline Drizzle join (old lines 19-31) with `yield* requireRole(user, 'admin')` and the counts call with `yield* getAllAnalysisMonitoringStats()`. RBAC-schema and drizzle-orm comparison imports moved into `requireRole`; `Either.match` retained inline (D-08) mapping `GetSupabaseUserError → 401`, `ForbiddenError → 403`, everything else → 500 logged via `useLogger(event).error(...)`.
- Upgraded `monitoring.get.ts` (self) to `Promise<AnalysisMonitoringStats>` via `getAnalysisMonitoringStats(supabaseUser.id)`. `ownerId` is derived **exclusively** from `getSupabaseUser(event)` (API-03) — no `?ownerId=`/`?user=` param and no role gate on self (D-07).
- Response-shape upgrades are backward-compatible because `AnalysisMonitoringStats extends AnalysisMonitoringCounts` (D-06): consumers reading only `total/success/error/cancelled/pending` keep working.

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared requireRole gate (D-01..D-04) + admin endpoint composite (D-05/D-06)** - `2f8ff9d2c2` (feat)
2. **Task 2: Self endpoint composite upgrade — API-01, API-03** - `1e6aff8e64` (feat)

**Plan metadata:** docs commit omitted — `.planning/STATE.md`/`ROADMAP.md` are owned by the orchestrator after all wave agents complete (per executor objective).

## Files Created/Modified

- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts` - Added `requireRole(user, role)` Effect helper and the `and`/`eq`, `roles`, `userRoles`, `Drizzle`, `RoleType` imports it needs.
- `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/monitoring/admin.get.ts` - Now `Promise<AnalysisMonitoringStats>` calling `requireRole(user, 'admin')` + `getAllAnalysisMonitoringStats()`; inline RBAC join/imports removed.
- `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/monitoring.get.ts` - Now `Promise<AnalysisMonitoringStats>` calling `getAnalysisMonitoringStats(supabaseUser.id)`.

## Decisions Made

- Extracted a **generic** `requireRole(user, role)` (not `requireAdminRole`) per D-01, so future admin-gated endpoints reuse it.
- Placed `requireRole` in `utils/grizzle/supabase.ts` alongside `getSupabaseUser`/`AdminRoleCheckError`/`ForbiddenError` (D-02), matching the D-03 signature `Effect<void, AdminRoleCheckError | ForbiddenError, Drizzle>`.
- Both endpoints fully upgrade to the composite (D-05) with backward compatibility guaranteed structurally (D-06).
- The unified 401/403/500 mapping stays inline in each handler (D-08) — two call sites don't justify a mapper.
- No `?granularity=` query param added; the wire ships the Phase 14 default `'day'`, per the plan's discretion note (avoiding out-of-scope query-layer changes).

## Deviations from Plan

None - plan executed exactly as written. The only deviation-rule episode was a self-inflicted structural-gate mismatch: the `requireRole` JSDoc referenced `useLogger`/`log.error` text that the `grep -c "useLogger\|log\.error"` gate counts as a match; rewording the comment (no code change) brought the gate to 0. This was a comment-only fix, not a behavioral deviation.

## Issues Encountered

- `import { Unit } from 'effect'` failed typecheck (Effect v3 does not export `Unit` as a named member) — the `requireRole` return annotation uses `Effect<void, ...>` where `Unit` is the Effect void alias; resolved inline, typecheck passes.
- The plan's `admin.get.test.ts` is intentionally red until Phase 16 extends its `vi.mock` surface with `requireRole` + `getAllAnalysisMonitoringStats` — left untouched per plan scope (termination gate for this phase is typecheck + structural grep, not the deferred test suite).

## User Setup Required

None - no external service configuration required. This is in-place production-code edit only; no new packages, no env vars, no schema change.

## Next Phase Readiness

- Both endpoints typecheck as `Promise<AnalysisMonitoringStats>` and the shared `requireRole` seam exists for any future admin-gated endpoint.
- Phase 16 must extend the existing `admin.get.test.ts` vi.mock surface with `requireRole` + `getAllAnalysisMonitoringStats` and add behavioral tests (RLS scoping TEST-03, gate rejection TEST-04, composite shape).

---
*Phase: 15-api-endpoints*
*Completed: 2026-08-10*

## Self-Check: PASSED

- Created files verified on disk: `supabase.ts`, `admin.get.ts`, `monitoring.get.ts`, `15-01-SUMMARY.md` — all FOUND.
- Commits verified in `git log --oneline --all`: `2f8ff9d2c2`, `1e6aff8e64` — both FOUND.
- `pnpm --filter ./packages/nuxt-galaxy typecheck` passes; all task structural gates PASS.
