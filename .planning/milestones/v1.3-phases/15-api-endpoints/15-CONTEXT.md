# Phase 15: API Endpoints - Context

**Gathered:** 2026-08-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the Phase 14 composite statistics contract into two HTTP GET endpoints — `GET /api/db/analyses/monitoring` (self: one user) and `GET /api/db/analyses/monitoring/admin` (admin: all users) — and extract the inline admin-role gate into a shared Effect helper. Both endpoints upgrade their response from `AnalysisMonitoringCounts` to the full `AnalysisMonitoringStats` composite (counts + successRate + per-workflow + trend). This phase is API layer only — no UI, no query-layer changes, no schema changes, no new table.

**In scope:** update `monitoring.get.ts` to return `getAnalysisMonitoringStats(ownerId)`; update `monitoring/admin.get.ts` to return `getAllAnalysisMonitoringStats()` behind a shared `requireRole` gate; extract the admin-role check into a generic `requireRole(user, role)` Effect helper (API-04). **Out of scope:** UI (v2), tests/quality gates (Phase 16), any query-layer or schema change.

</domain>

<decisions>
## Implementation Decisions

### Shared Role Gate (API-04)
- **D-01:** Extract a **generic `requireRole(user, role)`** Effect helper, not an admin-only `requireAdminRole`. `admin` is just one instance of the role. — **Reversibility:** reversible (internal refactor; call sites in-repo).
- **D-02:** `requireRole` lives in **`utils/grizzle/supabase.ts`** next to `getSupabaseUser`, because `AdminRoleCheckError` and `ForbiddenError` already live there. — **Reversibility:** reversible.
- **D-03:** Signature: `requireRole(user, role): Effect<Unit, AdminRoleCheckError | ForbiddenError, Drizzle>`. It performs the existing Drizzle `userRoles ⋈ roles WHERE roles.name = role` join with `limit(1)`; an empty result → `ForbiddenError` (403), a thrown query error → `AdminRoleCheckError` (500). — **Reversibility:** reversible.
- **D-04:** **No logging inside `requireRole`.** The helper only returns the typed error; denial and failure logging happens at the handler layer via `useLogger(event)` + `runGalaxyEffect`, matching `LOGGING-SPEC.md` and the existing monitoring handlers. — **Reversibility:** reversible.

### Self & Admin Response (API-01, API-02)
- **D-05:** Both endpoints fully upgrade their response to the **`AnalysisMonitoringStats` composite** — `monitoring.get.ts` returns `getAnalysisMonitoringStats(ownerId)`, `admin.get.ts` returns `getAllAnalysisMonitoringStats()`. No counts-only path is retained on either endpoint. — **Reversibility:** costly — the response shape is a published API contract; changing field composition later would affect consumers (adding fields is safe, removing is not).
- **D-06:** Backward compatibility is guaranteed structurally: `AnalysisMonitoringStats extends AnalysisMonitoringCounts`, so any existing consumer reading only `total/success/error/cancelled/pending` keeps working. The handler return type annotation updates from `AnalysisMonitoringCounts` to `AnalysisMonitoringStats`.

### Error / Status Mapping
- **D-07:** Both endpoints share the **same inline `Either.match` mapping**: `GetSupabaseUserError → 401`, `ForbiddenError → 403`, `AdminRoleCheckError` and any composite/stats error → 500 (logged via `useLogger(event).error(...)`). — **Reversibility:** reversible.
- **D-08:** The unified mapping is kept **inline in each handler** (a 4–6 line `Either.match`), **not** extracted into a shared mapper helper — two call sites is too few to justify a new abstraction. A future third admin-gated endpoint may revisit this.

### the agent's Discretion
- **Trend granularity on the wire** was flagged but not selected for discussion. Phase 14 D-04 makes granularity a caller parameter defaulting to `'day'`. Researcher/planner decide whether the endpoints expose a `?granularity=day|week|month` query param or lock to the default `'day'`; the default should be `'day'` unless a param is deliberately added.
- Mechanical details: exact `requireRole` body/SQL, how `monitoring.get.ts` continues to call `getSupabaseUser` (it cannot gate itself), precise evlog `error` messages, and whether the two handler programs share a small local helper inside the file.

No todos were folded or reviewed for this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### API Endpoints requirements
- `.planning/REQUIREMENTS.md` §"API Endpoints" — API-01 (self returns backward-compatible `AnalysisMonitoringStats` incl. per-workflow + trend), API-02 (admin equivalent), API-03 (ownerId from server-side session only), API-04 (shared requireAdminRole helper; non-admin rejected).

### Roadmap & prior-phase contract
- `.planning/ROADMAP.md` §"Phase 15: API Endpoints" — goal, success criteria (both endpoints return the composite, existing consumers keep working, ownerId never from client input, shared requireAdminRole rejects non-admin).
- `.planning/phases/14-stats-query-layer/14-CONTEXT.md` — the composite contract this phase consumes: `getAnalysisMonitoringStats(ownerId)` / `getAllAnalysisMonitoringStats()` (D-11, D-12), success-rate formula (D-01/D-02), trend granularity-as-parameter (D-04). **MUST read** before planning.

### Existing endpoint & auth code (codebase)
- `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/monitoring.get.ts` — the self endpoint to upgrade; current 401/500 `Either.match` and `getAnalysisMonitoringCounts(supabaseUser.id)` call to replace with `getAnalysisMonitoringStats`.
- `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/monitoring/admin.get.ts` — the admin endpoint to upgrade and the source of the inline admin check (lines 20-31) to extract into `requireRole`; already maps `ForbiddenError → 403`.
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts` — home of `getSupabaseUser`, `AdminRoleCheckError`, `ForbiddenError`; `requireRole` goes here (D-02).
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts` — `getAnalysisMonitoringStats` / `getAllAnalysisMonitoringStats` composite helpers (Phase 14) the endpoints call.
- `packages/nuxt-galaxy/src/runtime/types/nuxt-galaxy.ts` (§AnalysisMonitoring*, lines 112-136) — `AnalysisMonitoringCounts`, `AnalysisMonitoringStats`, `AnalysisMonitoringWorkflowUsage`, `AnalysisMonitoringTrendPoint` response shapes.
- `packages/nuxt-galaxy/test/server/api/db/analyses/monitoring/admin.get.test.ts` — existing admin endpoint test/mocking pattern (Phase 16 builds on it).

### Module conventions
- `packages/nuxt-galaxy/AGENTS.md` — Effect/DI, handler, and migration conventions; server-only DB access via Drizzle.
- `.planning/LOGGING-SPEC.md` — evlog for server routes (`useLogger(event)`), Effect programs via `runGalaxyEffect`, never-log-secrets.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getAnalysisMonitoringStats(ownerId)` / `getAllAnalysisMonitoringStats()` (`utils/grizzle/analysisMonitoring.ts:693,718`) — the composite helpers Phase 15 endpoints call; already return the full `AnalysisMonitoringStats` shape.
- `getSupabaseUser(event)`, `AdminRoleCheckError`, `ForbiddenError` (`utils/grizzle/supabase.ts`) — session identity + the error types `requireRole` returns.
- `AnalysisMonitoringStats` interface (`types/nuxt-galaxy.ts:132`) — the new response type; extends `AnalysisMonitoringCounts` for backward compatibility.

### Established Patterns
- Effect.gen + `runGalaxyEffect` + `Effect.provide(Layer.mergeAll(Drizzle.Live, ServerSupabaseClient.Live))` + `Effect.either`, then `Either.match` to map errors to `createError`.
- `GetSupabaseUserError → 401`; admin adds `ForbiddenError → 403`; generic → 500 with `useLogger(event).error(...)` and `Cause.pretty`.
- Drizzle `userRoles ⋈ roles` join with `eq(roles.name, 'admin')` + `limit(1)` for the role check — the exact code `requireRole` generalizes.

### Integration Points
- `monitoring.get.ts` swaps `getAnalysisMonitoringCounts` → `getAnalysisMonitoringStats` with no gate (self-scoped by `ownerId` from `getSupabaseUser`).
- `admin.get.ts` swaps `getAllAnalysisMonitoringCounts` → `getAllAnalysisMonitoringStats`, replacing its inline admin check with `yield* requireRole(user, 'admin')`.
- RLS remains the security boundary; the self helper always filters by `ownerId` server-side (API-03), so a request can never surface another user's stats.

</code_context>

<specifics>
## Specific Ideas

- The user chose a **generic `requireRole(user, role)`** over an admin-specific helper (D-01), favoring reuse for future admin-gated endpoints.
- The user accepted the **self/admin response fully upgrading to the composite** (D-05/D-06) once advised that `AnalysisMonitoringStats extends AnalysisMonitoringCounts` makes it backward-compatible — no counts-only path.
- The user accepted **inline (not extracted) unified 401/403/500 mapping** — two call sites don't justify a mapper helper (D-07/D-08).

</specifics>

<deferred>
## Deferred Ideas

- **More (third+) admin-gated endpoints** — if they appear, revisit D-08 (extract the shared `Either.match` mapper into a helper).
- **Granularity query parameter on the API** — whether to expose `?granularity=`; left to planner discretion (Phase 14 D-04), not locked here.

None else — discussion stayed within phase scope.

</deferred>

---

*Phase: 15-API Endpoints*
*Context gathered: 2026-08-10*
