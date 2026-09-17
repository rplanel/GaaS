# Phase 11: Verify Quality Gates - Research

**Researched:** 2026-08-10
**Domain:** Monorepo quality gates (ESLint, TypeScript, Vitest) for GaaS v1.2
**Confidence:** HIGH for observed gate status; MEDIUM for root cause of the single type error (Nitro typed-route layer behavior is inferred from generated types, not confirmed upstream).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Any failure that blocks a root quality gate is in scope to fix, regardless of when it was introduced. The milestone goal is a green baseline.
- **D-02:** Lint warnings and TypeScript diagnostics introduced by v1.2 changes must be eliminated; pre-existing warnings are tolerated unless they become errors.
- **D-03:** Local root `pnpm test` with the configured `threads` pool is the required proof. CI evidence is not required to block the milestone.
- **D-04:** A single clean local run after investigating a failure is sufficient to declare the gate green. Repeated consecutive passes are not required.
- **D-05:** Run `pnpm lint` → `pnpm typecheck` → `pnpm test` sequentially. Stop on the first failing gate, fix it, then restart the sequence from the beginning.
- **D-06:** Record pass/fail summary for each command (command, exit code, rough timing, test count). Capture full stdout/stderr only when a gate fails, to support debugging and audit.

### the agent's Discretion

- The implementer chooses the exact format of the evidence summary (plain text, markdown table, etc.).
- The implementer decides whether to append evidence to CONTEXT.md, DISCUSSION-LOG.md, or a separate verification report, as long as D-06 is satisfied.

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within Phase 11 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VERIFY-01 | Root `pnpm lint` passes after all changes. | Observed passing on current codebase with no errors or warnings (exit 0). |
| VERIFY-02 | Root `pnpm typecheck` passes after all changes. | Currently failing with one TypeScript error introduced by Phase 9 on-demand sync path; fix required. |
| VERIFY-03 | Root `pnpm test` passes after all changes. | Observed passing on current codebase using `threads` pool (exit 0). |
</phase_requirements>

## Summary

The GaaS monorepo currently has a **green lint and test baseline** but a **single TypeScript failure** blocking `pnpm typecheck`. Running the three root gates in the mandated sequence (`lint` → `typecheck` → `test`) stops at `typecheck`.

- `pnpm lint`: **PASS** (exit 0, no warnings or errors across all 4 TypeScript packages).
- `pnpm typecheck`: **FAIL** (exit 2) with one error in the v1.2 Phase 9 feature: `packages/ui/app/pages/analyses/[analysisId].vue:60:74` reports that `method: 'POST'` is not assignable to the typed route union `"delete" | "DELETE" | undefined`.
- `pnpm test`: **PASS** (exit 0) — 61 test files and 468 tests run across the workspace using the `threads` pool.

The type error is **not** a real API mismatch: the runtime handler `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[id]/sync.post.ts` correctly accepts POST, and the on-demand sync tests pass. The error is produced by Nitro/Nuxt typed-route generation when the `nuxt-galaxy` module is consumed through the `@gaas/ui` → `@gaas/wiki` layer chain: the generated `packages/wiki/.playground/.nuxt/types/nitro-routes.d.ts` omits the `/api/db/analyses/:id/sync` route while keeping the sibling `/api/db/analyses/:analysisId` (DELETE) route, so TypeScript resolves the `$fetch` call against the wrong route signature.

## Standard Stack

No new packages are introduced in this phase. The gates rely on the existing toolchain documented in `AGENTS.md` [VERIFIED: AGENTS.md Section 1].

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pnpm | 10.27.0 | Workspace runner | `packageManager` field in root `package.json` [VERIFIED: package.json:5] |
| ESLint | ^9.39.1 | Linting | With `@antfu/eslint-config@^6.7.1` [VERIFIED: AGENTS.md:9] |
| TypeScript | ^5.9.3 | Type checking | Catalog dependency [VERIFIED: AGENTS.md:9] |
| vue-tsc | ^3.1.5 | Vue/Nuxt type check | Catalog dependency [VERIFIED: pnpm-workspace.yaml:85] |
| Vitest | ^4.1.0 | Test runner | Catalog dependency [VERIFIED: AGENTS.md:13] |

### Tooling Configuration
| Config | Location | Purpose |
|--------|----------|---------|
| ESLint root config | `eslint.config.mjs` | `@antfu/eslint-config` with `vue: true`, `unocss: false`, ignores `.agents/`, `.planning/`, generated DB types [VERIFIED: eslint.config.mjs:1-11] |
| Root Vitest config | `vitest.config.ts` | Defaults `environment: 'node'`, `globals: true`, `pool: 'threads'` [VERIFIED: vitest.config.ts:12-30] |
| Package Vitest configs | `packages/*/vitest.config.ts` | Override environment, include patterns, and projects (wiki) [VERIFIED: glob results] |

## Validation Architecture

This phase is purely verification; no production code is added. The validation surface is the three root commands plus per-package test scripts.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config files | Root `vitest.config.ts`; per-package `vitest.config.ts`; `nuxt-galaxy` also uses `vitest.config.server.ts` |
| Quick run command | `pnpm --filter ./packages/<name> test` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VERIFY-01 | No ESLint errors/warnings | lint | `pnpm lint` | ✅ |
| VERIFY-02 | No TypeScript diagnostics | typecheck | `pnpm typecheck` | ❌ (1 error) |
| VERIFY-03 | All package tests pass | unit/integration | `pnpm test` | ✅ |

### Test Inventory (observed from current `pnpm test`)

| Package | Test Files | Tests | Notes |
|---------|-----------|-------|-------|
| blendtype | 9 | 144 | Runs `lint && typecheck && vitest run --coverage` [VERIFIED: packages/blendtype/package.json:38] |
| nuxt-galaxy (client config) | 10 | 64 | `vitest.config.ts` with `environment: 'nuxt'` [VERIFIED: packages/nuxt-galaxy/vitest.config.ts:1-21] |
| nuxt-galaxy (server config) | 36 | 243 (3 skipped) | `vitest.config.server.ts` with `environment: 'node'` [VERIFIED: packages/nuxt-galaxy/vitest.config.server.ts:1-14] |
| @gaas/ui | 5 | 12 | `environment: 'nuxt'` [VERIFIED: packages/ui/vitest.config.ts:1-26] |
| @gaas/wiki | 1 | 5 | Two Vitest projects (unit/nuxt) [VERIFIED: packages/wiki/vitest.config.ts:1-41] |
| **Total** | **61** | **468** | |

### Sampling Rate
- **Per task commit:** `pnpm lint && pnpm typecheck && pnpm test` (full root gates).
- **Phase gate:** All three root commands green before `/gsd-verify-work`.

## Technical Findings

### 1. Root `pnpm lint` — PASS

Command: `pnpm lint`
Result: exit 0, no warnings, no errors.

Observed output:
```
Scope: 4 of 7 workspace projects
packages/blendtype lint$ eslint .
packages/blendtype lint: Done
packages/nuxt-galaxy lint$ eslint .
packages/nuxt-galaxy lint: Done
packages/ui lint$ eslint .
packages/ui lint: Done
packages/wiki lint$ eslint .
packages/wiki lint: Done
```

The root script maps to `pnpm --filter './packages/**' lint` [VERIFIED: package.json:13]. Each package runs `eslint .` [VERIFIED: packages/blendtype/package.json:32; packages/nuxt-galaxy/package.json:46; packages/ui/package.json:16; packages/wiki/package.json:18].

### 2. Root `pnpm typecheck` — FAIL

Command: `pnpm typecheck`
Result: exit 2.

Single error:
```
packages/wiki typecheck: ../ui/app/pages/analyses/[analysisId].vue(60,74): error TS2322: Type '"POST"' is not assignable to type '"delete" | "DELETE" | undefined'.
```

The failing call site [VERIFIED: packages/ui/app/pages/analyses/[analysisId].vue:57-60]:
```ts
async function syncAnalysis() {
  isSyncing.value = true
  try {
    await $fetch(`/api/db/analyses/${analysisIdFromRoute.value}/sync`, { method: 'POST' })
```

The server handler it targets [VERIFIED: packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[id]/sync.post.ts:15]:
```ts
export default defineEventHandler(async (event) => {
  const analysisId = getRouterParam(event, 'id')
```

The module explicitly registers this route as POST [VERIFIED: packages/nuxt-galaxy/src/module.ts:392-396]:
```ts
addServerHandler({
  route: '/api/db/analyses/:id/sync',
  handler: resolver.resolve('./runtime/server/api/db/analyses/[id]/sync.post'),
  method: 'post',
})
```

#### Root cause analysis

When `nuxt-galaxy` is prepared directly, its generated types correctly include the POST route [VERIFIED: packages/nuxt-galaxy/.nuxt/types/nitro-routes.d.ts:42-44]:
```ts
'/api/db/analyses/:id/sync': {
  'post': Simplify<Serialize<Awaited<ReturnType<typeof import('../../src/runtime/server/api/db/analyses/[id]/sync.post').default>>>>
}
```

When consumed through the layer chain (`@gaas/wiki` extends `@gaas/ui` extends `nuxt-galaxy`), `packages/wiki/.playground/.nuxt/types/nitro-routes.d.ts` includes sibling analysis routes (`/api/db/analyses` POST, `/api/db/analyses/:analysisId` DELETE) but **omits** `/api/db/analyses/:id/sync` entirely [VERIFIED: packages/wiki/.playground/.nuxt/types/nitro-routes.d.ts:58-72]. Because the dynamic path is absent, TypeScript falls back to the closest matching route (`/api/db/analyses/:analysisId`) and reports that `POST` is incompatible with its `delete` method union.

This appears to be a Nitro/Nuxt typed-route generation quirk for module-registered routes that contain a dynamic segment followed by a static segment (`:id/sync`) when viewed through a Nuxt layer. Routes with the dynamic segment at the end (`:workflowId`, `:analysisId`) are generated correctly.

### 3. Root `pnpm test` — PASS

Command: `pnpm test`
Result: exit 0.

The root script maps to `pnpm --filter './packages/**' test` [VERIFIED: package.json:11]. All packages completed:

```
packages/blendtype test:  Test Files  9 passed (9)
packages/blendtype test:       Tests  144 passed (144)
packages/nuxt-galaxy test:  Test Files  10 passed (10)
packages/nuxt-galaxy test:       Tests  64 passed (64)
packages/nuxt-galaxy test:  Test Files  36 passed (36)
packages/nuxt-galaxy test:       Tests  243 passed | 3 skipped (246)
packages/ui test:  Test Files  5 passed (5)
packages/ui test:       Tests  12 passed (12)
packages/wiki test:  Test Files  1 passed (1)
packages/wiki test:       Tests  5 passed (5)
```

### 4. `threads` pool convention

All Vitest configs use `pool: 'threads'` to avoid the previously-encountered forks-pool IPC write failure (`Unknown system error -122 write` / `EDQUOT`) that blocked root testing in v1.1 [VERIFIED: PROJECT.md:103-106; vitest.config.ts:27-29; packages/ui/vitest.config.ts:6-8; packages/wiki/vitest.config.ts:9-11,21-23; packages/nuxt-galaxy/vitest.config.ts:5-7; packages/nuxt-galaxy/vitest.config.server.ts:5-7].

This convention must be preserved; do not revert any config to `pool: 'forks'`.

### 5. Package-specific gate scripts

| Package | Lint | Typecheck | Test |
|---------|------|-----------|------|
| blendtype | `eslint .` | `tsc --noEmit --skipLibCheck` | `pnpm lint && pnpm typecheck && vitest run --coverage` |
| nuxt-galaxy | `eslint .` | `vue-tsc --noEmit && cd playground && vue-tsc --noEmit` | `vitest run && vitest run --config vitest.config.server.ts` |
| @gaas/ui | `eslint .` | `vue-tsc --noEmit` | `vitest run` |
| @gaas/wiki | `eslint .` | `vue-tsc --noEmit` | `vitest run` |

[VERIFIED: packages/blendtype/package.json:32,39-40; packages/nuxt-galaxy/package.json:46,52,47; packages/ui/package.json:16,20,17; packages/wiki/package.json:18,22,19]

## Risks and Open Questions

| # | Risk / Question | Impact | Current Status |
|---|-----------------|--------|----------------|
| R1 | The type error is caused by Nitro/Nuxt typed-route generation for layered modules, not by incorrect runtime code. A fix must not break the runtime contract or the existing tests. | MEDIUM — workaround is straightforward, but an invasive route change could ripple into tests and UI. | Identified; needs decision on fix strategy. |
| R2 | `blendtype`'s test script internally runs `lint && typecheck`. If root `pnpm test` is run before root `pnpm typecheck` is green, blendtype's own typecheck will also fail, making the test command fail even though the other package tests are green. | LOW — D-05 mandates typecheck before test, so this ordering is already required. | Mitigated by process. |
| R3 | `pnpm typecheck` for `nuxt-galaxy` runs `vue-tsc --noEmit && cd playground && vue-tsc --noEmit`. The second command changes directory; failures in the playground are reported with relative paths that may be confusing. | LOW — no current playground failures. | Documented for awareness. |
| R4 | Any change to the sync endpoint URL to avoid the typed-route bug would require updates to the handler, the UI call site, the integration tests, and possibly documentation. | MEDIUM — not recommended unless workaround is rejected. | Avoid unless necessary. |

## Recommendations

1. **Fix the single type error with a localized type workaround** rather than changing the route path. Options, ordered from least to most invasive:
   - Add `// @ts-expect-error — Nitro omits module-registered param-in-middle routes from layer-generated typed routes; runtime handler accepts POST` on the line before the `$fetch` call in `packages/ui/app/pages/analyses/[analysisId].vue`.
   - Cast the fetch call: `await $fetch(`/api/db/analyses/${analysisIdFromRoute.value}/sync`, { method: 'POST' as const })` or `as 'POST'`.
   - Use `$fetch.raw`/custom fetch to bypass typed-route method checking.

   The `@ts-expect-error` option is preferred because it documents the upstream quirk and will fail if the type ever starts working (alerting maintainers to remove the workaround).

2. **Do not change the route structure** (`/api/db/analyses/:id/sync`) unless the workaround is unacceptable. Changing it would require touching the handler, tests, and UI, and would re-introduce integration risk late in the milestone.

3. **Preserve the `threads` pool** in all Vitest configs. Do not revert to `forks`.

4. **Follow D-05 sequence strictly**: after fixing the type error, restart from `pnpm lint` → `pnpm typecheck` → `pnpm test`. Record exit codes and rough timings for each gate as evidence per D-06.

5. **Evidence summary** should note:
   - lint: exit 0, ~1 s, no warnings/errors.
   - typecheck: exit 0 after fix (currently exit 2).
   - test: exit 0, ~20 s, 61 files / 468 tests.

6. **Open a follow-up item** (deferred out of v1.2) to investigate whether this Nitro typed-route behavior is a known issue and whether a future Nuxt/Nitro upgrade resolves it, so the workaround can be removed.

## Sources

### Primary (HIGH confidence)
- Root `package.json` scripts and workspace configuration [VERIFIED: package.json:1-45]
- Package `package.json` scripts for each workspace member [VERIFIED: packages/blendtype/package.json; packages/nuxt-galaxy/package.json; packages/ui/package.json; packages/wiki/package.json]
- Root and per-package Vitest configs [VERIFIED: vitest.config.ts; packages/ui/vitest.config.ts; packages/wiki/vitest.config.ts; packages/nuxt-galaxy/vitest.config.ts; packages/nuxt-galaxy/vitest.config.server.ts]
- Root ESLint config [VERIFIED: eslint.config.mjs]
- `nuxt-galaxy` module route registration [VERIFIED: packages/nuxt-galaxy/src/module.ts:392-396]
- Failing call site [VERIFIED: packages/ui/app/pages/analyses/[analysisId].vue:57-60]
- Generated route types [VERIFIED: packages/nuxt-galaxy/.nuxt/types/nitro-routes.d.ts:42-44; packages/wiki/.playground/.nuxt/types/nitro-routes.d.ts:58-72]

### Secondary (MEDIUM confidence)
- Nitro/Nuxt typed-route layer behavior is inferred from the missing route in the wiki-generated types; no upstream issue was searched in this session.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions and commands are read directly from repo files.
- Gate status: HIGH — commands were executed and outputs captured.
- Type error root cause: MEDIUM — inferred from generated-type diff between nuxt-galaxy and wiki; not confirmed with a minimal reproduction or upstream issue.

**Research date:** 2026-08-10
**Valid until:** 2026-09-10 (toolchain is stable; only the single upstream workaround may evolve with Nuxt/Nitro releases)

---

## RESEARCH COMPLETE

**Phase:** 11 - Verify Quality Gates
**Confidence:** HIGH for observed status; MEDIUM for the typed-route root-cause diagnosis.

### Key Findings
- `pnpm lint` passes with no warnings or errors.
- `pnpm typecheck` fails on exactly one TypeScript error introduced by the Phase 9 on-demand sync UI call, caused by missing typed-route generation for the `/api/db/analyses/:id/sync` route when consumed through Nuxt layers.
- `pnpm test` passes (61 files, 468 tests) using the required `threads` pool.
- The `threads` pool convention is the documented fix for the earlier v1.1 forks-pool `EDQUOT` failure and must be preserved.

### File Created
`.planning/phases/11-verify-quality-gates/11-RESEARCH.md`

### Open Questions (RESOLVED)
1. Is the Nitro typed-route omission for param-in-middle module routes a known upstream bug? (Non-blocking for v1.2; follow-up investigation recommended.) **RESOLVED:** Deferred to post-v1.2; the localized `@ts-expect-error` workaround is the chosen fix and will be revisited when Nuxt/Nitro typed-route generation is upgraded.
2. Does the project prefer `@ts-expect-error`, a method cast, or `$fetch.raw` for the workaround? (The research recommends `@ts-expect-error`.) **RESOLVED:** `@ts-expect-error` selected per the plan, because it documents the upstream quirk and will fail the build if the typed route starts working, signalling the workaround can be removed.

### Ready for Planning
Research complete. Planner can now create PLAN.md files targeting the single `typecheck` failure while preserving the green `lint` and `test` baselines.
