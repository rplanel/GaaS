---
phase: 16-testing-quality-gates
reviewed: 2026-08-11T12:48:38Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - packages/nuxt-galaxy/test/server/utils/grizzle/supabase.test.ts
  - packages/nuxt-galaxy/test/server/utils/grizzle/survival-flow.test.ts
findings:
  critical: 1
  warning: 3
  info: 0
  total: 4
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-08-11T12:48:38Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Reviewed the two new test files in the `nuxt-galaxy` package that cover the
Grizzle Supabase utilities and the analysis-monitoring survival flow. Both files
are well-structured, but the Supabase test contains a critical async/sync
runtime mismatch that will break the test suite. There are also a few warnings
around environment isolation, type-safety in tests, and weak assertions that
could hide regressions.

## Critical Issues

### CR-01: `Effect.runSync` used on an asynchronous `requireRole` effect

**File:** `packages/nuxt-galaxy/test/server/utils/grizzle/supabase.test.ts:203-212`

**Issue:** The helper `resolveRequireRoleFor` wraps `requireRole` in
`Effect.either` and then runs it with `Effect.runSync`. The production
implementation of `requireRole` performs its Drizzle query through
`Effect.tryPromise`, which is inherently asynchronous. `Effect.runSync` cannot
execute async effects and throws `Fiber #0 cannot be resolved synchronously`.
Consequently, every test in the `requireRole` describe block will fail at
runtime.

**Fix:** Run the effect asynchronously inside the helper:

```typescript
async function resolveRequireRoleFor(
  drizzle: ReturnType<typeof createMockDrizzle>,
  role: string,
) {
  const either = await Effect.runPromise(
    Effect.either(
      requireRole({ id: 'user-id' }, role as RoleType).pipe(
        Effect.provide(drizzle.layer),
      ),
    ),
  )
  return Either.match(either, {
    onRight: () => ({ _tag: '__success__' }),
    onLeft: error => error,
  })
}
```

Then await the helper in each `requireRole` test case.

## Warnings

### WR-01: Incomplete environment cleanup in the service-role key failure test

**File:** `packages/nuxt-galaxy/test/server/utils/grizzle/supabase.test.ts:161-183`

**Issue:** The test deletes three environment variables
(`SUPABASE_SERVICE_KEY`, `NUXT_SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
before asserting that `createServiceRoleSupabaseClient` fails without a key.
However, the implementation also consults `NUXT_SUPABASE_SERVICE_KEY` and
`NUXT_SUPABASE_SERVICE_ROLE_KEY`. If either of those variables is set in the
CI or local environment, the function will still obtain a key and the test
will produce a false negative.

**Fix:** Clear every env var that the source checks, or snapshot and restore
`process.env` wholesale:

```typescript
const originalEnv = { ...process.env }
const keysToRemove = [
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NUXT_SUPABASE_SECRET_KEY',
  'NUXT_SUPABASE_SERVICE_KEY',
  'NUXT_SUPABASE_SERVICE_ROLE_KEY',
]
for (const key of keysToRemove) delete process.env[key]
try {
  // ... assertion ...
}
finally {
  process.env = originalEnv
}
```

### WR-02: Invalid `RoleType` cast in the role-agnostic test

**File:** `packages/nuxt-galaxy/test/server/utils/grizzle/supabase.test.ts:252-266`

**Issue:** The test casts `'editor'` to `RoleType`, but the actual type is
`'admin' | 'user'`. The cast bypasses TypeScript and exercises a value outside
the valid domain, so the test does not verify behavior for a real role. It also
sets a precedent of using type assertions to work around the domain model.

**Fix:** Use a valid non-admin role from `RoleTypes`. If the intent is to prove
the gate is not hard-coded to `"admin"`, use `"user"` and assert the `WHERE`
clause references `"user"`:

```typescript
const outcome = resolveRequireRoleFor(drizzle, 'user')
// ...
expect(whereCall).toEqual(and(
  eq(userRoles.userId, 'user-id'),
  eq(roles.name, 'user'),
))
```

If `'editor'` is a legitimate future role, add it to `RoleTypes` instead of
casting.

### WR-03: Weak assertions in storage and service-client tests

**File:** `packages/nuxt-galaxy/test/server/utils/grizzle/supabase.test.ts:60-80,104-124,150-159,186-201`

**Issue:** Several tests assert only the shape of the return value or that a
client is defined, without verifying the arguments passed to the underlying
Supabase client. This allows regressions such as uploading to the wrong bucket,
generating a signed URL for the wrong path, or constructing the service client
from an unexpected key to pass unnoticed.

**Fix:** Add targeted `toHaveBeenCalledWith` assertions, for example:

```typescript
// uploadFileToStorage / uploadStreamToStorage
expect(supabase.storage.from).toHaveBeenCalledWith('analysis_files')
expect(uploadSpy).toHaveBeenCalledWith(
  expect.stringMatching(/^[0-9a-f-]+\/test-file\.txt$/),
  expect.any(ReadableStream),
)

// createSignedUrl
expect(mockClient.storage.from).toHaveBeenCalledWith('analysis_files')
expect(createSignedUrlSpy).toHaveBeenCalledWith('path/to/file.txt', 60)

// createServiceRoleSupabaseClient success
expect(client).toBeDefined()
expect(vi.mocked(useRuntimeConfig)).toHaveBeenCalled()
```

---

_Reviewed: 2026-08-11T12:48:38Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
