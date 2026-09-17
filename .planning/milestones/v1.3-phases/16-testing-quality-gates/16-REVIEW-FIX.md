---
phase: 16-testing-quality-gates
fixed_at: 2026-08-11T15:10:00Z
review_path: .planning/phases/16-testing-quality-gates/16-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 16: Code Review Fix Report

**Fixed at:** 2026-08-11T15:10:00Z
**Source review:** `.planning/phases/16-testing-quality-gates/16-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: `Effect.runSync` used on an asynchronous `requireRole` effect

**Files modified:** `packages/nuxt-galaxy/test/server/utils/grizzle/supabase.test.ts`
**Commit:** `099cbf49b0`
**Applied fix:** Converted `resolveRequireRoleFor` to an `async` helper that runs the effect with `Effect.runPromise`, and added `await` to every `requireRole` test invocation.

### WR-01: Incomplete environment cleanup in the service-role key failure test

**Files modified:** `packages/nuxt-galaxy/test/server/utils/grizzle/supabase.test.ts`
**Commit:** `948bccf79d`
**Applied fix:** Replaced per-key backup/restore with a wholesale snapshot of `process.env`, deleted every key the source checks (`SUPABASE_SERVICE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NUXT_SUPABASE_SECRET_KEY`, `NUXT_SUPABASE_SERVICE_KEY`, `NUXT_SUPABASE_SERVICE_ROLE_KEY`), and restored the snapshot in a `finally` block.

### WR-02: Invalid `RoleType` cast in the role-agnostic test

**Files modified:** `packages/nuxt-galaxy/test/server/utils/grizzle/supabase.test.ts`
**Commit:** `ceecd49fc4`
**Applied fix:** Changed the test role from the invalid `'editor'` cast to the valid `'user'` role and updated the `WHERE` clause assertion to expect `eq(roles.name, 'user')`.

### WR-03: Weak assertions in storage and service-client tests

**Files modified:** `packages/nuxt-galaxy/test/server/utils/grizzle/supabase.test.ts`
**Commit:** `02ae39698c`
**Applied fix:** Added targeted `toHaveBeenCalledWith` assertions for:
- `uploadFileToStorage`: bucket `'analysis_files'`, upload path matching UUID prefix and original filename, and a `ReadableStream` payload.
- `createSignedUrl`: bucket `'analysis_files'` and `createSignedUrl('path/to/file.txt', 60)`.
- `createServiceRoleSupabaseClient`: `useRuntimeConfig()` is consulted.
- `uploadStreamToStorage`: bucket `'analysis_files'`, exact path `'folder/file.txt'`, and a `ReadableStream` payload.

## Skipped Issues

None — all findings were fixed.

## Verification

- Each fix was re-read in the modified file to confirm the change was present and surrounding code was intact.
- `pnpm --filter ./packages/nuxt-galaxy exec eslint test/server/utils/grizzle/supabase.test.ts` passed with no errors.
- The Vitest runtime could not be exercised inside the isolated review-fix worktree because the Nuxt test setup (`.nuxt`/generated types) is not present there. Verification of test behavior is deferred to the verifier phase, which runs in the main checkout after the worktree is merged.

---

_Fixed: 2026-08-11T15:10:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
