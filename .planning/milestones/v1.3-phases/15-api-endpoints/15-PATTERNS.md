# Phase 15: API Endpoints - Pattern Map

**Mapped:** 2026-08-10
**Files analyzed:** 4 new/modified (3 in-scope source, 1 deferred test)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/runtime/server/api/db/analyses/monitoring.get.ts` (modify) | controller (server handler) | request-response (self-scoped CRUD read) | itself — existing self handler | exact (same file, in-place upgrade) |
| `src/runtime/server/api/db/analyses/monitoring/admin.get.ts` (modify) | controller (server handler) | request-response (admin-gated CRUD read) | itself + `monitoring.get.ts` | exact (same file + sibling handler) |
| `src/runtime/server/utils/grizzle/supabase.ts` (modify — add `requireRole`) | utility (Effect DI helper) | CRUD read (RBAC role lookup) | inline admin check in `admin.get.ts:19-31` + `getSupabaseUser` in same file | exact (the inline code IS the code to extract) |
| `test/server/api/db/analyses/monitoring/admin.get.test.ts` (defer to Phase 16) | test | request-response | itself | exact (will need mock updates for `requireRole` + composite) |

> **Note:** Tests are explicitly out of scope for Phase 15 (deferred to Phase 16 per CONTEXT.md). The existing `admin.get.test.ts` is mapped as the canonical testing analog the planner/implementer must NOT touch in this phase, but whose assertions (`403/401/500`, `sqlToString`, query-chain mocks) Phase 16 will need to extend when `requireRole` replaces the inline check and the response upgrades to `AnalysisMonitoringStats`.

No new files are created in this phase — all work is an **in-place modification** of the three existing source files listed above. The most faithful "analog" for each is the file itself plus its sibling.

---

## Pattern Assignments

### `src/runtime/server/api/db/analyses/monitoring.get.ts` (controller, request-response — self)

**Analog:** the file itself (current state) — a minimal diff.

**What changes:** swap import + return annotation from `AnalysisMonitoringCounts` → `AnalysisMonitoringStats`, and swap the call `getAnalysisMonitoringCounts(supabaseUser.id)` → `getAnalysisMonitoringStats(supabaseUser.id)`. Everything else (auth gate, DI wiring, Either.match) is unchanged — D-05/D-06, API-01.

**Import block to retain** (current lines 1-8) — only the type import and the helper import line change:
```typescript
import type { AnalysisMonitoringStats } from '../../../../types/nuxt-galaxy'   // was AnalysisMonitoringCounts
import { Cause, Effect, Either, Layer } from 'effect'
import { useLogger } from 'evlog'
import { createError, defineEventHandler } from 'h3'
import { Drizzle } from '../../../utils/drizzle'
import { runGalaxyEffect } from '../../../utils/evlog-effect'
import { getAnalysisMonitoringStats } from '../../../utils/grizzle/analysisMonitoring'  // was getAnalysisMonitoringCounts
import { getSupabaseUser, GetSupabaseUserError, ServerSupabaseClient } from '../../../utils/grizzle/supabase'
```

**Core program pattern** (lines 11-17) — unchanged body, only the final call swaps:
```typescript
const program = Effect.gen(function* () {
  const supabaseUser = yield* getSupabaseUser(event)
  if (!supabaseUser || typeof supabaseUser.id !== 'string' || supabaseUser.id.length === 0) {
    return yield* Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' }))
  }
  return yield* getAnalysisMonitoringStats(supabaseUser.id)   // API-03: ownerId from server session ONLY
})
```

**DI + execution + Either.match pattern** (lines 19-37) — unchanged; return annotation at line 10 updates to `Promise<AnalysisMonitoringStats>`:
```typescript
const result = await runGalaxyEffect(
  event,
  program.pipe(
    Effect.provide(Layer.mergeAll(Drizzle.Live, ServerSupabaseClient.Live)),
    Effect.either,
  ),
)

return Either.match(result, {
  onLeft: (error) => {
    if (error._tag === 'GetSupabaseUserError') {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
    const log = useLogger(event)
    log.error('analysis monitoring handler failed', { cause: Cause.pretty(Cause.fail(error)) })
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  },
  onRight: value => value,
})
```
> D-07/D-08: this self handler does NOT add a `ForbiddenError → 403` branch (it cannot gate itself); its `Either.match` stays exactly as above.

**Error/logging contract:** denial/failure logging at handler layer only, via `useLogger(event)` + `runGalaxyEffect`, matching LOGGING-SPEC.md (never log secrets; message + `Cause.pretty(Cause.fail(error))`).

---

### `src/runtime/server/api/db/analyses/monitoring/admin.get.ts` (controller, request-response — admin)

**Analog:** the file itself + `monitoring.get.ts` for the shared shell.

**What changes (3 edits):**
1. Import roll-back: the inline-role imports go away; `getAnalysisMonitoringStats` composite + `requireRole` come in.
2. Replace the inline admin-check block (current lines 19-31) with `yield* requireRole(user, 'admin')`.
3. Swap `getAllAnalysisMonitoringCounts()` → `getAllAnalysisMonitoringStats()`; return type `AnalysisMonitoringCounts` → `AnalysisMonitoringStats`.
4. `Either.match` adds `ForbiddenError → 403` if not already handled — it already is (lines 48-50).

**Imports after edit** (based on current lines 1-11):
```typescript
import type { AnalysisMonitoringStats } from '../../../../../types/nuxt-galaxy'   // was AnalysisMonitoringCounts
import { Cause, Effect, Either, Layer } from 'effect'                            // NO drizzle-orm imports remain — moved into requireRole
import { useLogger } from 'evlog'
import { createError, defineEventHandler } from 'h3'
import { Drizzle } from '../../../../utils/drizzle'
import { runGalaxyEffect } from '../../../../utils/evlog-effect'
import { getAllAnalysisMonitoringStats } from '../../../../utils/grizzle/analysisMonitoring'  // was getAllAnalysisMonitoringCounts
import { AdminRoleCheckError, ForbiddenError, getSupabaseUser, GetSupabaseUserError, requireRole, ServerSupabaseClient } from '../../../../utils/grizzle/supabase'
```
> Remove current lines 2 (`and, eq` from `drizzle-orm`), 6 (`roles`), 7 (`userRoles`) — those move into `requireRole` inside `supabase.ts`.

**Program pattern showing the `requireRole` substitution** (based on current lines 14-33):
```typescript
const program = Effect.gen(function* () {
  const user = yield* getSupabaseUser(event)
  if (!user || typeof user.id !== 'string' || user.id.length === 0) {
    return yield* Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' }))
  }
  yield* requireRole(user, 'admin')                       // replaces inline lines 19-31 (D-01, API-04)
  return yield* getAllAnalysisMonitoringStats()           // was getAllAnalysisMonitoringCounts()
})
```

**Either.match with 403 branch** (current lines 43-56) — retained verbatim (D-07 already satisfied here):
```typescript
return Either.match(result, {
  onLeft: (error) => {
    if (error._tag === 'GetSupabaseUserError') {
      throw createError({ statusCode: 401, statusMessage: error.message })
    }
    if (error._tag === 'ForbiddenError') {
      throw createError({ statusCode: 403, statusMessage: error.message })
    }
    const log = useLogger(event)
    log.error('analysis monitoring admin handler failed', { cause: Cause.pretty(Cause.fail(error)) })
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  },
  onRight: value => value,
})
```

---

### `src/runtime/server/utils/grizzle/supabase.ts` (utility / Effect DI helper — add `requireRole`)

**Analog:** the inline admin check currently in `admin.get.ts:19-31` (the exact code to extract) + the `getSupabaseUser` convention in the SAME file (D-02 — `requireRole` lives here next to `AdminRoleCheckError`/`ForbiddenError`/`getSupabaseUser`).

**What to add:** a new `requireRole(user, role)` Effect helper. The error types it returns already exist in this file (`ForbiddenError` line 50, `AdminRoleCheckError` line 54). Consider importing `RoleType` from `types/nuxt-galaxy` for the `role` parameter type (or accept the same union `'admin' | 'user'`).

**Existing error types to reuse** (already in file, lines 50-56):
```typescript
export class ForbiddenError extends Data.TaggedError('ForbiddenError')<{
  readonly message: string
}> {}

export class AdminRoleCheckError extends Data.TaggedError('AdminRoleCheckError')<{
  readonly message: string
}> {}
```

**Code to extract from `admin.get.ts:19-31`** — the Drizzle `userRoles ⋈ roles` join this helper generalizes:
```typescript
// FROM admin.get.ts current lines 19-31 (the join to generalize; SQL moves verbatim)
const useDrizzle = yield* Drizzle
const adminRows = yield* Effect.tryPromise({
  try: () => useDrizzle
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(userRoles.userId, user.id), eq(roles.name, 'admin')))
    .limit(1),
  catch: error => new AdminRoleCheckError({ message: `Failed to verify admin role: ${error}` }),
})
if (adminRows.length === 0) {
  return yield* Effect.fail(new ForbiddenError({ message: 'Forbidden: admin role required' }))
}
```

**Target signature (D-03):** `requireRole(user, role): Effect<Unit, AdminRoleCheckError | ForbiddenError, Drizzle>`
- `where(and(eq(userRoles.userId, user.id), eq(roles.name, role)))` — generalize `'admin'` → `role`.
- Empty result → `Effect.fail(new ForbiddenError({ message: 'Forbidden: admin role required' }))`.
- Query rejection → `new AdminRoleCheckError({ message: `Failed to verify ${role} role: ${error}` })`.
- **D-04: NO logging inside the helper.** Only returns the typed error; logging stays at the handler layer.

**Schema imports required** (moved from `admin.get.ts` into `supabase.ts`):
```typescript
import { and, eq } from 'drizzle-orm'
import { roles } from '../../db/schema/galaxyRbac/roles'
import { userRoles } from '../../db/schema/galaxyRbac/userRoles'
```

**Companion conventions to mirror** (same file, `getSupabaseUser` lines 154-167): resolve the injected `Drizzle` service via `yield* Drizzle`, wrap the Drizzle promise in `Effect.tryPromise` with a `Data.TaggedError` catch, and `Effect.fail` for the empty/unauthorized branch.

---

## Shared Patterns

### Effect handler shell (all server API files)
**Source:** `monitoring.get.ts:11-37` and `admin.get.ts:14-56`
**Apply to:** both `monitoring.get.ts` and `admin.get.ts`
```typescript
// 1. Effect.gen program yielding the composite helper; fail typed errors
// 2. program.pipe(Effect.provide(Layer.mergeAll(Drizzle.Live, ServerSupabaseClient.Live)), Effect.either)
// 3. runGalaxyEffect(event, ...) — attaches Effect logs to request logger
// 4. Either.match(result, { onLeft: map _tag -> createError, onRight: value => value })
```

### Auth / session identity (all server API files)
**Source:** `getSupabaseUser` (`supabase.ts:154-167`) + inline guard
**Apply to:** both handlers
```typescript
const supabaseUser = yield* getSupabaseUser(event)
if (!supabaseUser || typeof supabaseUser.id !== 'string' || supabaseUser.id.length === 0) {
  return yield* Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' }))
}
```

### Shared role gate (`requireRole`)
**Source:** extract from `admin.get.ts:19-31` → add to `supabase.ts` (D-02)
**Apply to:** `admin.get.ts` (only admin-gated endpoint in this phase); `getSupabaseUser` returns the `user` object, `requireRole(user, 'admin')` enforces the gate (D-01, API-04).

### Error → HTTP status mapping
**Source:** both handlers' `Either.match`
**Apply to:** all handlers
- `GetSupabaseUserError` → `401`
- `ForbiddenError` → `403` (admin only)
- `AdminRoleCheckError` / `GetAnalysisMonitoringStatsError` / anything else → `500`, logged via `useLogger(event).error(msg, { cause: Cause.pretty(Cause.fail(error)) })` (D-07/D-08; keep inline, don't extract into a mapper).

### Response type + backward compatibility
**Source:** `types/nuxt-galaxy.ts:112-136`
**Apply to:** both handlers' return annotations
`AnalysisMonitoringStats extends AnalysisMonitoringCounts` (line 132) — so upgrading the return type keeps existing consumers reading only `total/success/error/cancelled/pending` working (D-06).

### Logging
**Source:** LOGGING-SPEC.md §1 / §5
**Apply to:** all files
- Server routes: `const log = useLogger(event)`; `log.error(msg, { cause: Cause.pretty(Cause.fail(error)) })`.
- Effect programs: `Effect.log*` routed via `runGalaxyEffect`.
- **Never log secrets** (tokens, service keys); use explicit field names.

---

## No Analog Found

All four target files are in-place modifications of existing files with exact self/sibling analogs. None are net-new files requiring an external analog. If the planner opts (at their discretion) to add a `?granularity=` query param, the only new surface is reading `getQuery(event)` from `h3` inside the handler and passing a `TrendGranularity` through to the composite — there is no in-repo analog for query-param parsing, so RESEARCH.md (Phase 14 D-04) governs that discretion; default stays `'day'`.

## Metadata

**Analog search scope:** `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/monitoring/`, `.../server/utils/grizzle/`, `.../types/nuxt-galaxy.ts`, `.../server/db/schema/galaxyRbac/`, `test/server/api/db/analyses/monitoring/`, `.planning/LOGGING-SPEC.md`
**Files scanned:** 8 (2 handlers, 2 util files, 1 types, 2 RBAC schema, 1 test + LOGGING-SPEC + evlog-effect)
**Pattern extraction date:** 2026-08-10
