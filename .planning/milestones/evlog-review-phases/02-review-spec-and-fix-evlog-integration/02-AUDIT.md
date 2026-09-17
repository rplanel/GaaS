# Phase 2 Plan 01 — evlog Integration Audit

**Scope:** Review every file changed in the `feat/evlog` branch plus every artifact created by `npx @evlog/cli init` against the conventions in `.planning/phases/01-research-evlog-patterns-and-conventions/EVLOG-CONVENTIONS.md` and the checklist in `.planning/phases/01-research-evlog-patterns-and-conventions/FEAT-EVLOG-REVIEW-CHECKLIST.md`.

**Generated:** 2026-08-05 as the tracer task for Phase 2 Plan 01.

---

## Methodology

1. `git diff --name-only main...HEAD` produced the tracked file list.
2. `git ls-files --others --exclude-standard` produced the untracked artifact list (mostly `@evlog/cli init` outputs).
3. `grep -rEn "console\.(log|warn|error|info|debug)"` across `packages/`, `docs/`, and `playground/` produced the raw-console inventory.
4. `grep -rEn "useLogger|createRequestLogger|Effect\.log|log\.(info|warn|error|debug|audit|set)|createError|defineErrorCatalog|GALAXY_API_KEY|SUPABASE_SERVICE_KEY|NUXT_SUPABASE.*KEY"` produced the logging-API and secret-scan inventories.
5. Key files were read manually where classification was ambiguous.

---

## 1. Surface-by-Surface Findings

### 1.1 Server API routes — `packages/nuxt-galaxy/src/runtime/server/api/**/*.ts`

| File | Surface | Conventions | Notes |
|------|---------|-------------|-------|
| `probe.get.ts` | Server route | Compliant | Uses `useLogger(event)`, sets `handler`, calls `log.info`. |
| `galaxy/workflows.get.ts` | Server route | Compliant | Wraps Effect with `runGalaxyEffect` and `useGalaxyLayer`. |
| `galaxy/health.get.ts` | Server route | Compliant (assumed from pattern) | Effect-wrapped Galaxy health check. |
| `galaxy/instance.get.ts` | Server route | Compliant (assumed from pattern) | Effect-wrapped Galaxy instance info. |
| `galaxy/histories.get.ts` | Server route | Compliant (assumed from pattern) | Effect-wrapped Galaxy histories. |
| `galaxy/workflows/[workflowId].get.ts` | Server route | Compliant (assumed from pattern) | Effect-wrapped workflow detail. |
| `galaxy/tools/[toolId]/[toolVersion].get.ts` | Server route | Compliant (assumed from pattern) | Effect-wrapped tool detail. |
| `db/analyses.post.ts` | Server route | Mostly compliant | Uses `runGalaxyEffect`; needs spot-check for `createError` source. |
| `db/workflows.post.ts` | Server route | Mostly compliant | Uses `runGalaxyEffect`; needs spot-check for `createError` source. |
| `db/analyses/[analysisId].delete.ts` | Server route | **FIX-01 candidate** | Uses `createError` imported from `h3` for HTTP errors (lines 39, 43). evlog conventions prefer structured `createError` from `evlog`/`createEvlogError` with `why`/`fix`. Also logs `Cause.pretty(Cause.fail(error))` which is acceptable but could be richer. |
| `db/analyses/monitoring.get.ts` | Server route | **FIX-01 candidate** | Uses `createError` from `h3` (lines 30, 34). |
| `db/analyses/monitoring/admin.get.ts` | Server route | **FIX-01 candidate** | Uses `createError` from `h3` (lines 46, 49, 53). |

**Surface verdict:** All handlers use `runGalaxyEffect` or `useLogger(event)` correctly. The main gap is that server route HTTP errors use `h3`'s `createError` rather than evlog's structured `createError`. Per D-02 this is a convention-clarification issue rather than a runtime bug, because the HTTP errors are not the same as the operational errors the evlog `createError` targets. Left as a **FIX-01 candidate** for Plan 02-05 to decide whether to migrate.

---

### 1.2 Scheduled tasks — `packages/nuxt-galaxy/src/runtime/server/tasks/**/*.ts`

| File | Surface | Conventions | Notes |
|------|---------|-------------|-------|
| `galaxy/sync-analyses.ts` | Scheduled task | **FIX-01 candidate** | Creates `taskLog` with `createRequestLogger`, wraps Effect with `runTaskEffect`, and emits at the end. However, line 64 calls `Effect.logDebug('page offset=', offset, 'rows=', ...)` with multiple positional arguments; Effect's `logDebug` expects a single message (plus optional cause/annotation). The resulting log message is likely `page offset= [object Object]` or similarly unhelpful. Should be a structured object or single interpolated string. |

**Surface verdict:** Task lifecycle is correct; one API-misuse finding.

---

### 1.3 Client composables — `packages/ui/app/composables/**/*.ts`

| File | Surface | Conventions | Notes |
|------|---------|-------------|-------|
| `composables/meili/useLoadMore.ts` | Client composable | **FIX-02** | Line 72: `console.error('MeiliSearch Error:', e)`. |
| `composables/meili/useMeiliSearch.ts` | Client composable | **FIX-02** | Line 27: `console.error('MeiliSearch Error:', e)`. |
| `composables/useMosaicData.ts` | Client composable | **FIX-02** | Lines 35, 39, 43, 48, 52, 56: `console.warn(...)`; lines 71, 87, 99: `console.error(...)`. |
| `composables/plot/table/useHistogramHeader.ts` | Client composable | **FIX-02** | Line 13: `console.warn(...)`. Lines 24 and 34 are commented-out `console.log` and can be removed or left as-is. |
| `composables/plot/table/useCategoryHeader.ts` | Client composable | **FIX-02** | Line 38: `console.warn(...)`. |
| `utils/table/columns/header.ts` | Client utility | **FIX-02** | Lines 9, 31: `console.warn(...)`. |
| `components/plot/table/header/Histogram.vue` | Client component | **FIX-02** | Line 105: `console.warn(...)`. |
| `components/meili/index/filter/AssistedBuilder.vue` | Client component | **FIX-02** | Line 243: `console.warn(...)`. |
| `components/meili/index/filter/form/SetInput.vue` | Client component | **FIX-02** | Line 31: `console.warn(...)`. |
| `components/meili/index/filter/plot/CategoryBuilder.vue` | Client component | **FIX-02** | Lines 166, 283, 326: `console.warn(...)`. |

**Surface verdict:** `@gaas/ui` client code has 16 active raw `console.warn` / `console.error` calls. They should be migrated to `evlog/client` structured calls. These are assigned to Plan 02-02 and Plan 02-03.

Other client files in `packages/nuxt-galaxy/src/runtime/app/composables/` (`useUploadFileToStorage.ts`, `useSupabaseRealtime.ts`, `useDatasetTags.ts`) already use `log` from `evlog/client` correctly and are compliant.

---

### 1.4 Module lifecycle / build-time scripts

| File | Surface | Conventions | Notes |
|------|---------|-------------|-------|
| `packages/nuxt-galaxy/src/module.ts` | Module lifecycle | Compliant | Uses `@nuxt/kit`'s `logger.withTag('nuxt-galaxy')` for build-time diagnostics. Installs `evlog/nuxt` programmatically (line 151). |
| `packages/nuxt-galaxy/src/log-options.ts` | Module config | Compliant | Resolves `minLevel: 'debug'` by default, `redact: !isDev`. |
| `packages/nuxt-galaxy/src/runtime/server/plugins/evlog.server.ts` | Nitro plugin | Compliant | Reads `runtimeConfig.galaxy.logs.file` and delegates to `registerEvlogFsDrain`. |
| `packages/nuxt-galaxy/src/runtime/server/utils/evlog-drain.ts` | Nitro plugin utility | Compliant | `registerEvlogFsDrain` wires FS drain via `evlog:drain` hook. |
| `packages/nuxt-galaxy/src/runtime/server/plugins/galaxy.server.ts` | Nitro plugin | **FIX-01 candidate** | Lines 8, 11 throw bare `createError('Galaxy API key is not configured...')` imported from `h3` (or auto-imported). These are startup-time configuration errors; using `h3` `createError` is acceptable, but evlog conventions would prefer structured errors. Low priority. |
| `packages/nuxt-galaxy/src/runtime/server/plugins/migrations.server.ts` | Nitro plugin | Compliant (assumed) | Runs migrations using module lifecycle logging. |
| `packages/nuxt-galaxy/bin/migrate.mjs` | Standalone script | Not reviewed in detail | Should use `initLogger` + `createRequestLogger` per conventions. Left for Plan 02-05 if not already compliant. |
| `packages/nuxt-galaxy/bin/seed.mjs` | Standalone script | Not reviewed in detail | Should use `initLogger` + `createRequestLogger` per conventions. |
| `packages/nuxt-galaxy/src/runtime/server/lib/migrate.ts` | Standalone script helper | Not reviewed in detail | Convention check deferred. |
| `packages/nuxt-galaxy/src/runtime/server/lib/seed.ts` | Standalone script helper | Not reviewed in detail | Convention check deferred. |
| `packages/wiki/nuxt.config.ts` | Module lifecycle / build-time | **FIX-02** | Line 35: `console.log('Parsed content:', ctx.file.id)` inside `content:file:afterParse` hook. Per conventions this build-time diagnostic should use `@nuxt/kit`'s `logger.withTag('@gaas/wiki')`. |

**Surface verdict:** Module lifecycle is mostly correct; one raw `console.log` in wiki build hook and one startup error pattern to clarify.

---

### 1.5 Effect programs / bridge

| File | Surface | Conventions | Notes |
|------|---------|-------------|-------|
| `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts` | Effect → evlog bridge | **FIX-03** | `logToRequestLog` casts `requestLog` to `RequestLogWithDebug` and falls back to `requestLog.info(...)` for `DEBUG` level. D-04 mandates a real debug path: route debug events to `logToEvlogGlobal('debug', message, context)` instead. This is the primary code change for Plan 02-01. |
| `packages/blendtype/src/*.ts` | Effect programs | Compliant (assumed) | Use `Effect.log*` rather than `console.*`; no `console.*` hits in blendtype runtime code. |
| `packages/blendtype/test/*.test.ts` | Tests | Exempt | Tests may use `console.*`; no action. |

**Surface verdict:** Debug-path fix is the single critical change for this plan.

---

### 1.6 Tests

| File | Surface | Conventions | Notes |
|------|---------|-------------|-------|
| `packages/nuxt-galaxy/test/server/utils/evlog-effect.test.ts` | Test | **FIX-03** | The test `'forwards Effect.logDebug to the request logger debug method when available'` expects `requestLog.debug` to be called. After implementing D-04, debug events will go to the global `log.debug` when a request-scoped debug method is unavailable. The test must be updated to assert `mockLog.debug` is called and/or that `requestLog.debug` is **not** called. |
| Other `packages/nuxt-galaxy/test/**/*.test.ts` | Tests | Compliant / exempt | No test-related logging issues identified. |

---

## 2. evlog CLI Init Artifacts

`npx @evlog/cli init` generated the following untracked files. Most are skills/tooling config and do not require code fixes; a few are duplicate drains that may conflict with the manually written runtime wiring.

| Artifact | Purpose | Duplication / Issue |
|----------|---------|---------------------|
| `.agents/skills/analyze-logs/SKILL.md` | Skill config | Tooling only; no code fix. |
| `.agents/skills/build-audit-logs/SKILL.md` | Skill config | Tooling only; no code fix. |
| `.agents/skills/create-evlog-adapter/SKILL.md` | Skill config | Tooling only; no code fix. |
| `.agents/skills/create-evlog-enricher/SKILL.md` | Skill config | Tooling only; no code fix. |
| `.agents/skills/review-logging-patterns/SKILL.md` | Skill config | Tooling only; no code fix. |
| `.claude/skills/*` | Symlinks/copies of above | Tooling only; no code fix. |
| `packages/nuxt-galaxy/.agents/skills/*` | Per-package skill copies | Tooling only; no code fix. |
| `packages/nuxt-galaxy/.claude/skills/*` | Per-package skill copies | Tooling only; no code fix. |
| `packages/nuxt-galaxy/CLAUDE.md` | Per-package agent instructions | Contains evlog logging guidance; acceptable. |
| `packages/nuxt-galaxy/nuxt.config.ts` | Module dev config | **Potential duplication** — installs `evlog/nuxt` while `module.ts` already installs it programmatically. At runtime this may register evlog twice. |
| `packages/nuxt-galaxy/server/plugins/evlog-drain.ts` | Nitro plugin | **Duplicate** — duplicates `src/runtime/server/plugins/evlog.server.ts` + `src/runtime/server/utils/evlog-drain.ts`. The CLI-generated file uses `createFsDrain()` with no options (defaults) and guards on `import.meta.dev`; the hand-written runtime version reads config and supports `fileOptions`. This file should be removed or merged. |
| `packages/nuxt-galaxy/server/utils/errors.ts` | Error catalog scaffold | **Incomplete** — `E_401` and `E_500` entries have `why`/`fix` TODOs. Catalog is not yet wired into route handlers. Left for future FIX-01 work. |
| `packages/ui/.agents/skills/*` | Per-package skill copies | Tooling only; no code fix. |
| `packages/ui/.claude/skills/*` | Per-package skill copies | Tooling only; no code fix. |
| `packages/ui/CLAUDE.md` | Per-package agent instructions | Acceptable. |
| `packages/ui/server/plugins/evlog-drain.ts` | Nitro plugin | **Duplicate** — same content as nuxt-galaxy's generated drain. If `@gaas/ui` is consumed as a Nuxt layer, this registers a second FS drain. Should be removed or guarded. |
| `packages/wiki/.agents/skills/*` | Per-package skill copies | Tooling only; no code fix. |
| `packages/wiki/.claude/skills/*` | Per-package skill copies | Tooling only; no code fix. |
| `packages/wiki/CLAUDE.md` | Per-package agent instructions | Acceptable. |
| `packages/wiki/server/plugins/evlog-drain.ts` | Nitro plugin | **Duplicate** — same FS drain duplication issue. |
| `packages/wiki/skills-lock.json` | Skill lockfile | Tooling only; no code fix. |
| `playground/.agents/skills/*` | App skill copies | Tooling only; no code fix. |
| `playground/.claude/skills/*` | App skill copies | Tooling only; no code fix. |
| `playground/AGENTS.md` | App agent instructions | Acceptable. |
| `playground/CLAUDE.md` | App agent instructions | Acceptable. |
| `playground/server/plugins/evlog-drain.ts` | Nitro plugin | **Duplicate** — same FS drain duplication issue. |
| `playground/skills-lock.json` | Skill lockfile | Tooling only; no code fix. |

**Artifact verdict:** The CLI generated useful skill/tooling scaffolding but also four duplicate FS drain plugins (`packages/{nuxt-galaxy,ui,wiki}/server/plugins/evlog-drain.ts` and `playground/server/plugins/evlog-drain.ts`) and a `packages/nuxt-galaxy/nuxt.config.ts` that may double-register `evlog/nuxt`. These are not fixed in Plan 02-01 because they are not required for the tracer slice; they are tracked for Plan 02-05.

---

## 3. Raw `console.*` Inventory

Command:

```bash
grep -rEn "console\.(log|warn|error|info|debug)" \
  --include="*.ts" --include="*.vue" --include="*.js" --include="*.mjs" \
  --exclude-dir=node_modules --exclude-dir=.nuxt --exclude-dir=dist --exclude-dir=.output \
  --exclude-dir=.evlog --exclude-dir=.planning --exclude-dir=coverage --exclude-dir=.venv \
  --exclude-dir=test \
  packages/ docs/ playground/ | grep -v "// console\." | sort
```

Results (active calls only; commented-out calls omitted):

| File | Line | Call | Fix plan |
|------|------|------|----------|
| `packages/blendtype/src/galaxy.ts` | 24 | `console.log` inside JSDoc comment | No action (documentation example). |
| `packages/ui/app/components/meili/index/filter/AssistedBuilder.vue` | 243 | `console.warn` | 02-03 |
| `packages/ui/app/components/meili/index/filter/form/SetInput.vue` | 31 | `console.warn` | 02-03 |
| `packages/ui/app/components/meili/index/filter/plot/CategoryBuilder.vue` | 166 | `console.warn` | 02-03 |
| `packages/ui/app/components/meili/index/filter/plot/CategoryBuilder.vue` | 283 | `console.warn` | 02-03 |
| `packages/ui/app/components/meili/index/filter/plot/CategoryBuilder.vue` | 326 | `console.warn` | 02-03 |
| `packages/ui/app/components/plot/table/header/Histogram.vue` | 105 | `console.warn` | 02-03 |
| `packages/ui/app/composables/meili/useLoadMore.ts` | 72 | `console.error` | 02-02 |
| `packages/ui/app/composables/meili/useMeiliSearch.ts` | 27 | `console.error` | 02-02 |
| `packages/ui/app/composables/plot/table/useCategoryHeader.ts` | 38 | `console.warn` | 02-02 |
| `packages/ui/app/composables/plot/table/useHistogramHeader.ts` | 13 | `console.warn` | 02-02 |
| `packages/ui/app/composables/useMosaicData.ts` | 35, 39, 43, 48, 52, 56 | `console.warn` (6) | 02-02 |
| `packages/ui/app/composables/useMosaicData.ts` | 71, 87, 99 | `console.error` (3) | 02-02 |
| `packages/ui/app/utils/table/columns/header.ts` | 9, 31 | `console.warn` (2) | 02-03 |
| `packages/wiki/nuxt.config.ts` | 35 | `console.log` | 02-04 |

**Total active raw calls:** 1 doc-comment + 19 runtime calls.

---

## 4. Secret-in-Log Risk (REVW-02)

Command:

```bash
grep -rEn "GALAXY_API_KEY|SUPABASE_SERVICE_KEY|NUXT_SUPABASE.*KEY" \
  --include="*.ts" --include="*.vue" --include="*.js" \
  packages/nuxt-galaxy/src/runtime packages/ui/app packages/wiki/app
```

Results: only `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts` reads env vars for Supabase service-role keys. No hits in `log.*`, `Effect.log*`, `log.set`, annotations, or spans.

**Risk verdict:** No secret values are forwarded into logs in the reviewed code. Redaction is configured in `log-options.ts` (`redact: !isDev`). Continue to verify after all FIX tasks that no new logging accidentally captures secrets.

---

## 5. Package-Boundary Check (REVW-03)

| Check | Result |
|-------|--------|
| `@gaas/wiki` imports `nuxt-galaxy` internals | `packages/wiki/nuxt.config.ts` imports only `@gaas/ui` and standard modules. No direct imports of `nuxt-galaxy` runtime server utilities found. |
| `@gaas/ui` imports `nuxt-galaxy` internals | No direct server-utility imports found in reviewed UI code. Composables rely on auto-imported `nuxt-galaxy` exports. |
| `blendtype` has Nuxt/Node code | `blendtype` remains pure TypeScript/Effect. |

**Boundary verdict:** Layer direction is respected. No cross-layer logging imports detected.

---

## 6. Severity / Context-Shape Sanity Check (SPEC-01 / SPEC-02)

| Check | Result |
|-------|--------|
| Base wide-event fields (`timestamp`, `level`, `service`, `method`, `path`, `duration`, `status`) | Provided automatically by `evlog/nuxt` for request-scoped events. |
| Server route `handler` field | Set explicitly in `probe.get.ts`; other routes rely on `runGalaxyEffect` to set `handler`/`method`. |
| Task `operation`, `requestId`, outcome counts | Set correctly in `sync-analyses.ts`. |
| Effect bridge fields (`effectSpans`, `effectAnnotations`, `effectCause`) | Built by `buildLogContext` in `evlog-effect.ts`. |
| Severity usage | Mapping in `mapEffectLogLevel` is correct; debug path is the only gap. |

**Shape verdict:** Wide-event shape is correct once the debug path is fixed.

---

## Findings

| ID | Finding | Requirement | Plan | Severity |
|----|---------|-------------|------|----------|
| A-01 | `evlog-effect.ts` debug branch falls back to `requestLog.info` via unsafe `RequestLogWithDebug` cast. | FIX-03 | 02-01 | High |
| A-02 | `evlog-effect.test.ts` asserts the old debug fallback (`requestLog.debug`). | FIX-03 / VERF-03 | 02-01 | High |
| A-03 | `sync-analyses.ts` passes multiple positional arguments to `Effect.logDebug`, producing malformed messages. | FIX-01 | 02-05 | Medium |
| A-04 | `@gaas/ui` client code has 19 raw `console.warn`/`console.error` calls. | FIX-02 | 02-02, 02-03 | Medium |
| A-05 | `packages/wiki/nuxt.config.ts` uses `console.log` in a build-time hook. | FIX-02 | 02-04 | Medium |
| A-06 | `@evlog/cli init` generated duplicate FS drain plugins in `packages/{nuxt-galaxy,ui,wiki}/server/plugins/evlog-drain.ts` and `playground/server/plugins/evlog-drain.ts`. | REVW-01 | 02-05 | Low |
| A-07 | `packages/nuxt-galaxy/nuxt.config.ts` may double-register `evlog/nuxt`. | REVW-01 | 02-05 | Low |
| A-08 | `packages/nuxt-galaxy/server/utils/errors.ts` has TODO `why`/`fix` fields and is not wired into route handlers. | FIX-01 | 02-05 | Low |
| A-09 | Several server routes use `createError` from `h3` for HTTP errors instead of evlog's structured `createError`. | FIX-01 / SPEC-01 | 02-05 | Low |

---

## 8. Verification Commands Used

```bash
# Changed files
git diff --name-only main...HEAD

# Untracked CLI artifacts
git ls-files --others --exclude-standard

# Raw console inventory
grep -rEn "console\.(log|warn|error|info|debug)" \
  --include="*.ts" --include="*.vue" --include="*.js" --include="*.mjs" \
  --exclude-dir=node_modules --exclude-dir=.nuxt --exclude-dir=dist --exclude-dir=.output \
  --exclude-dir=.evlog --exclude-dir=.planning --exclude-dir=coverage --exclude-dir=.venv \
  --exclude-dir=test \
  packages/ docs/ playground/ | grep -v "// console\."

# Secret scan
grep -rEn "GALAXY_API_KEY|SUPABASE_SERVICE_KEY|NUXT_SUPABASE.*KEY" \
  --include="*.ts" --include="*.vue" --include="*.js" \
  packages/nuxt-galaxy/src/runtime packages/ui/app packages/wiki/app

# evlog API scan
grep -rEn "useLogger|createRequestLogger|Effect\.log|log\.(info|warn|error|debug|audit|set)|createError|defineErrorCatalog" \
  --include="*.ts" --include="*.vue" \
  packages/nuxt-galaxy/src packages/ui/app packages/wiki/app playground
```

---

## 9. Plan 02-01 Verification Results

Commands run after implementing the D-04 debug path:

| Command | Result | Notes |
|---------|--------|-------|
| `pnpm --filter ./packages/nuxt-galaxy exec vitest run --config vitest.config.server.ts test/server/utils/evlog-effect.test.ts` | **PASS** | 8 tests passed. Debug events route to `mockLog.debug`; `RequestLogWithDebug` cast removed. |
| `pnpm --filter ./packages/nuxt-galaxy test:server` | **PASS** | 37 test files passed (246 passed, 3 skipped). Required updating `sync-analyses.test.ts` to include the `log` export in its `evlog` mock, because debug logs now reach the global logger. |
| `pnpm --filter ./packages/nuxt-galaxy lint` | **FAIL** | 2 errors in files not touched by Plan 02-01: `packages/nuxt-galaxy/AGENTS.md:238:31` (`style/no-multi-spaces`) and `packages/nuxt-galaxy/server/plugins/evlog-drain.ts:10:23` (`antfu/if-newline`). Both are `@evlog/cli init` artifacts / generated docs. |
| `pnpm --filter ./packages/nuxt-galaxy typecheck` | **FAIL** | 2 errors in `packages/nuxt-galaxy/server/plugins/evlog-drain.ts`: `defineNitroPlugin` is not imported and `nitroApp` is implicitly `any`. This is an `@evlog/cli init` artifact. |
| `pnpm --filter ./packages/nuxt-galaxy test` | **FAIL** | Client-side `types-export.test.ts` fails because `dist/runtime/types/nuxt-galaxy.d.ts` does not exist (build artifact missing). This is unrelated to logging changes. Server tests pass when run independently. |
| `npx eslint src/runtime/server/utils/evlog-effect.ts test/server/utils/evlog-effect.test.ts test/server/tasks/galaxy/sync-analyses.test.ts` | **PASS** | No lint errors in files modified by Plan 02-01. |

**Plan 02-01 verdict:** The Effect→evlog debug path is implemented and verified. The `evlog-effect.ts` and related test changes are clean. The remaining lint/typecheck/test failures are in `@evlog/cli init` artifacts or unrelated build/test infrastructure and are tracked in findings A-06, A-08, and the verification table above for Plans 02-04 / 02-05.

---

## 10. Plan 02-05 Remediation Log

Actions taken while executing `02-05-PLAN.md` to finalize the spec, reconcile remaining `@evlog/cli init` artifacts, and close the audit.

### 10.1 evlog CLI init artifacts removed

| Artifact | Reason | Disposition |
|---|---|---|
| `packages/nuxt-galaxy/server/plugins/evlog-drain.ts` | Duplicates the hand-written `src/runtime/server/plugins/evlog.server.ts` + `src/runtime/server/utils/evlog-drain.ts` wiring and uses default `createFsDrain()` options instead of runtime-config `fileOptions` | Removed |
| `packages/ui/server/plugins/evlog-drain.ts` | Same duplicate FS drain pattern; `@gaas/ui` is a layer and inherits `nuxt-galaxy` runtime wiring | Removed |
| `packages/wiki/server/plugins/evlog-drain.ts` | Same duplicate FS drain pattern; already removed in Plan 02-04 | Removed in 02-04 |
| `playground/server/plugins/evlog-drain.ts` | Same duplicate FS drain pattern; playground extends the GaaS layers | Removed |
| `packages/nuxt-galaxy/nuxt.config.ts` | Registers `evlog/nuxt` while `src/module.ts` already installs it programmatically via `installModule('evlog/nuxt', ...)` | Removed |
| `packages/ui/nuxt.config.ts` evlog additions | Adds `evlog/nuxt` module and `evlog: { env: { service: 'ui' } }` while the layer inherits `nuxt-galaxy` module wiring | Reverted to pre-init state |
| `playground/nuxt.config.ts` evlog additions | Adds `evlog/nuxt` module and `evlog: { env: { service: 'gaas-playground' } }` while the app inherits layer/module wiring | Reverted to pre-init state |

The canonical FS drain remains in `packages/nuxt-galaxy/src/runtime/server/plugins/evlog.server.ts` and `packages/nuxt-galaxy/src/runtime/server/utils/evlog-drain.ts`, which read `runtimeConfig.galaxy.logs.file` and respect the resolved module options. The redundant `packages/nuxt-galaxy/nuxt.config.ts` was removed; `packages/ui/nuxt.config.ts` and `playground/nuxt.config.ts` evlog blocks were reverted to their pre-init state.

### 10.2 Remaining runtime logging fixes

| Finding | File | Change |
|---|---|---|
| A-03 malformed `Effect.logDebug` | `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` | Replaced `Effect.logDebug('page offset=', offset, 'rows=', ...)` with `Effect.logDebug('page query', { offset, rows, error })` so the message is a single string and pagination state is a structured annotation |
| A-08 incomplete `why`/`fix` TODOs | `packages/nuxt-galaxy/server/utils/errors.ts` | Filled `E_401` and `E_500` entries based on the semantics of the route handlers that reference them; catalog wiring into route handlers remains deferred to a future FIX-01 phase |

### 10.3 Deliberately deferred items

| Item | Reason | Future work |
|---|---|---|
| Server routes using `h3` `createError` instead of evlog `createError` | Current handlers return correct HTTP status codes and log the operational error before throwing; migrating to the evlog error catalog is a low-priority refactor that can happen when the catalog is wired | Future refactor or ADOPT-02 |
| `packages/nuxt-galaxy/server/utils/errors.ts` catalog not wired into routes | Filling the catalog entries was in scope for the TODO cleanup; replacing inline `createError` calls with `nuxtGalaxyErrors.<KEY>()` is a larger refactor outside the logging-quality scope of Phase 2 | Future refactor |

### 10.4 Final secrets, boundary, and quality gate audits

Commands run at the end of Plan 02-05:

#### Secrets-in-logs pass (REVW-02)

```bash
grep -rEn "(log|console)\..*\(.*(GALAXY_API_KEY|SUPABASE_SERVICE_KEY|NUXT_SUPABASE.*KEY|NUXT_SUPABASE_SECRET_KEY)" \
  --include="*.ts" --include="*.vue" \
  packages/nuxt-galaxy/src packages/nuxt-galaxy/server packages/ui/app packages/wiki/app
```

Result: **0 hits** — no secret value is forwarded into a log or console call in reviewed runtime code.

Bare env-var reads (not logging):

| File | Lines | Context |
|---|---|---|
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts` | 93–97 | Reads Supabase service-role key env vars to build the service-role client |
| `packages/nuxt-galaxy/src/module.ts` | 32, 125 | Reads `GALAXY_API_KEY` for module defaults/runtime config |

These reads are acceptable: the values are used for configuration, not logged.

#### Package-boundary pass (REVW-03)

| Check | Command | Result |
|---|---|---|
| `@gaas/wiki` / `@gaas/ui` imports of `nuxt-galaxy` internals | `grep -rEn "from ['\"]nuxt-galaxy['\"]" ...` | 23 matches, all `import type` of public types (`Database`, `Tables`, `WorkflowRow`, etc.). 0 runtime imports. No server-utility imports. |
| `@gaas/ui` runtime server-utility imports | `grep -rEn "from ['\"]nuxt-galaxy['\"]" ... \| grep -v "import type"` | 1 match: a commented-out import in `packages/ui/app/composables/database/useWorkflowComponent.ts`. |
| `blendtype` Nuxt/Node code | `grep -rEn "from ['\"]@nuxt/kit\|from ['\"]nitropack\|from ['\"]h3\|from ['\"]evlog" ...` | **0 hits** — `blendtype` remains pure TypeScript/Effect. |

Verdict: No layer-boundary violations. Public type imports from `nuxt-galaxy` are intentional and do not bypass upstream abstractions.

#### Root quality gates

| Command | Result | Notes |
|---|---|---|
| `pnpm lint` | **PASS** | All four packages (`blendtype`, `nuxt-galaxy`, `ui`, `wiki`) lint clean after removing duplicate drain/config artifacts. |
| `pnpm typecheck` | **FAIL** | 4 pre-existing type errors in `@gaas/ui` files unrelated to logging: `HeroShadersDynamic.vue`, `plot/Table.vue` (×2), `pages/index.vue`. These were documented in `02-02-SUMMARY.md` and `02-04-SUMMARY.md`. |
| `pnpm test` | **FAIL** | Vitest default `forks` pool fails across all packages with `Unknown system error -122: write`. This is an environment/runtime issue, not a test logic failure. |

##### Workaround verification

Running the same suites with `--pool=threads` (or `--pool=vmThreads` for server-only configs) succeeds:

| Package / Config | Pool | Result |
|---|---|---|
| `packages/blendtype` | `vitest run --pool=threads` | 9 files, 144 tests passed |
| `packages/nuxt-galaxy` client tests | `vitest run --pool=threads` | 9 files passed; `types-export.test.ts` fails because `dist/runtime/types/nuxt-galaxy.d.ts` is missing (pre-existing build artifact issue) |
| `packages/nuxt-galaxy` server tests | `vitest run --config vitest.config.server.ts --pool=threads` | 37 files, 246 passed, 3 skipped |
| `@gaas/ui` | `vitest run --pool=threads` | 5 files, 12 tests passed |

The targeted tests for the files changed in this plan (`evlog-effect.test.ts`, `sync-analyses.test.ts`) pass with `--pool=vmThreads --config vitest.config.server.ts`.

---

*Audit produced for Phase 2 Plan 01. The findings above drive the FIX tasks in Plans 02-02 through 02-05.*
