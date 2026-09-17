---
phase: 15-api-endpoints
reviewed: 2026-08-11T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts
  - packages/nuxt-galaxy/src/runtime/server/api/db/analyses/monitoring/admin.get.ts
  - packages/nuxt-galaxy/src/runtime/server/api/db/analyses/monitoring.get.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-08-11T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed the two monitoring API endpoints (`monitoring.get.ts` — per-user, `admin.get.ts` — admin) and the shared `supabase.ts` server utility they consume. Traced the full call chain into `analysisMonitoring.ts`, `evlog-effect.ts`, `drizzle.ts`, and `helper.ts`.

**Assessment:** The core authz logic is correct. `monitoring.get.ts` scopes data to the authenticated user's `ownerId` (server-side `WHERE owner_id`), and `admin.get.ts` gates the all-rows query behind a `requireRole(user, 'admin')` check against the `galaxy_rbac.roles` table (`admin` is a valid `RoleType`). Both endpoints consume the pre-assembled `AnalysisMonitoringStats` object correctly, map known error tags to 401/403, and fall back to a generic 500.

No live critical/blocker vulnerability found in the current wiring. The findings below are latent security defects (dead code carrying a path-traversal and a service-role client), one internal-error information leak, and a misleading RLS comment that invites a future authorization regression.

## Warnings

### WR-01: Unsanitized dataset name interpolated into storage path (latent path traversal)

**File:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts:132-139`
**Issue:** `uploadFileToStorage` builds the storage object key as
```ts
const path = `${crypto.randomUUID()}/${datasetName}`
```
The `datasetName` argument is concatenated into the storage key with no sanitization. A dataset name containing `/`, `..`, or control characters would let a caller write to arbitrary locations inside the `analysis_files` bucket (path traversal / overwrite of another object's key). The function is currently **dead code** (no callers — the live upload path is the client-side `useUploadFileToStorage` composable), so this is not exploitable today, but the latent defect remains in the reviewed file and will become live the moment it is wired into a handler. The same over-folding of `serverSupabaseClient`/`createServiceRoleSupabaseClient` surfaces the bucket as a hardcoded `'analysis_files'` literal (line 123/150), which is also fragile.
**Fix:** Sanitize/reject unsafe characters in `datasetName` before building the key (e.g. strip `/`, reject `..`, or replace with `-`), and parameterize the bucket name instead of hardcoding it:
```ts
const safeName = datasetName.replace(/[^a-zA-Z0-9._-]/g, '_')
const path = `${crypto.randomUUID()}/${safeName}`
```
Alternatively, delete the dead function and keep a single, reviewed upload path.

### WR-02: Admin endpoint leaks internal error detail in the 401 response

**File:** `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/monitoring/admin.get.ts:29-32`
**Issue:** On a `GetSupabaseUserError`, the handler returns
```ts
throw createError({ statusCode: 401, statusMessage: error.message })
```
`GetSupabaseUserError.message` is populated not only with the handler-level `'Unauthorized'` (line 14) but also by `getSupabaseUser` (supabase.ts:166-169) with `Failed to get auth user: ${authUserError.message}` — i.e. the raw underlying error text from `auth.getUser()` (token-validation failure, Supabase endpoint, network detail) is sent to the client. Notably `monitoring.get.ts:30` already uses a static `'Unauthorized'` for the same error, so the two endpoints are inconsistent and one leaks. This exposes internal infrastructure details to unauthenticated callers, which aids reconnaissance.
**Fix:** Mirror `monitoring.get.ts` and return a static message for this error tag:
```ts
if (error._tag === 'GetSupabaseUserError') {
  throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
}
```

### WR-03: `Drizzle.Live` bypasses RLS — misleading comment + dead service-role client invite an ungated admin call

**File:** `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/monitoring/admin.get.ts:23` (and `supabase.ts:91-114`)
**Issue:** Both endpoints are provided the `Drizzle.Live` layer, which is a direct `postgres(GALAXY_DRIZZLE_DATABASE_URL)` connection (drizzle.ts:11) running as the database owner/superuser role. That role **bypasses row-level security**, and the `analysisMonitoring` table carries no `pgPolicy` restriction that would constrain the `getAll*` helpers. The doc comment in `analysisMonitoring.ts:713-717` claims the admin helpers "rely on the RLS admin SELECT policy" — this is false assurance: there is **no RLS safety net** on this path. Authorization relies entirely on `requireRole(user, 'admin')` being present at each call site. That gate is correctly present in `admin.get.ts` today (so not currently exploitable), but the false documentation — combined with the exported-but-unused `createServiceRoleSupabaseClient` (a service-role client that also bypasses RLS, supabase.ts:91) — makes it easy for a future endpoint added to the `getAllAnalysisMonitoringStats` helper to drop the gate and expose every user's monitoring data.
**Fix:** (1) Correct the comment to state that admin helpers depend on an explicit application-level `requireRole('admin')` gate, not RLS. (2) Either delete `createServiceRoleSupabaseClient` (dead) or keep it only behind the same gate with a clear guard. (3) Consider centralizing the admin authorization into a reusable layer/guard so future callers cannot omit it.

## Info

### IN-01: Large block of dead exported code in `supabase.ts`

**File:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts`
**Issue:** The following exports have no runtime callers (verified via call graph) and form a dead-code cluster: `createServiceRoleSupabaseClient` (91), `uploadStreamToStorage` (116), `uploadFileToStorage` (132), `createSignedUrl` (145), `createServerSupabaseClaims` (63), the `ServerSupabaseClaims` Context.Tag (75-85), and their error tags `UploadFileToStorageError` (87), `CreateSignedUrlError` (141). Dead exported functions in a security-sensitive module are a maintenance hazard and mask live paths (see WR-01/WR-03).
**Fix:** Remove the unused exports, or annotate with `@deprecated` + a ticket if intentionally retained for future phases.

### IN-02: `as any` access to runtime config defeats type safety

**File:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts:97,103`
**Issue:** `(config.supabase as any)?.secretKey` / `(config.supabase as any)?.serviceKey` cast `config` to `any`, bypassing the typed `RuntimeConfig`. This hides typos in the config path (e.g. `secretKey` vs `service_key`) and makes the precedence fallback chain across 6 env vars fragile. It is also a code smell in a file that already carries a dead service-role path.
**Fix:** Type the runtime config (define the `supabase` shape in the module's runtime-config types) and read fields via the typed object instead of `as any`.

---

_Reviewed: 2026-08-11T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
