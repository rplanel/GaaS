# feat/evlog Review Checklist

Ready-for-Phase-2 checklist derived from the Phase 1 research (`01-SKELETON.md`, `EVLOG-CONVENTIONS.md`) and the v1 requirements (`REQUIREMENTS.md`).

## RSCH-01 Boundary Note

RSCH-01 was returned as `unclassified` by the spec-less probe fallback. Phase 1 bounded RSCH-01 to documenting evlog conventions for five surfaces and producing this checklist. No code changes were made. Phase 2 executes the checks below.

---

## Surface-by-Surface Review

### 1. Server API routes — REVW-01

Applies to: `packages/nuxt-galaxy/src/runtime/server/api/**/*.ts`

- [ ] Every handler that does meaningful work imports or auto-uses `useLogger(event)`.
- [ ] `log.set({ handler: '...' })` is called with a stable, route-identifier name.
- [ ] Galaxy/DB Effects are wrapped with `runGalaxyEffect(event, effect)`.
- [ ] Errors are created with `createError` from `evlog` (or `createEvlogError` alias) and include `message`, `status`, `why?`, `fix?`, and backend-only `internal?`.
- [ ] `log.error(error, { step: '...' })` is called before throwing.
- [ ] No whole request bodies, raw Galaxy responses, or headers are attached via `log.set()`.
- [ ] No `console.log` / `console.warn` / `console.error` remain in runtime route code.

### 2. Scheduled tasks — REVW-01

Applies to: `packages/nuxt-galaxy/src/runtime/server/tasks/**/*.ts`

- [ ] Each task creates a fresh `createRequestLogger({ operation, requestId })`.
- [ ] Effects are wrapped with `runTaskEffect(taskLog, effect)`.
- [ ] `taskLog.emit({ status })` is called at task completion.
- [ ] Loggers are not shared across task invocations.
- [ ] No `console.*` calls remain in task code.

### 3. Client composables — REVW-01

Applies to: `packages/nuxt-galaxy/src/runtime/app/composables/**/*.ts`, `packages/ui/app/composables/**/*.ts`, `packages/wiki/app/composables/**/*.ts`

- [ ] Composables use the auto-imported `log` from `evlog/client` (or explicit `import { log } from 'evlog/client'`) instead of `console.*`.
- [ ] Log calls use structured objects: `log.info({ action: '...', ...context })`.
- [ ] No secrets (tokens, API keys) are logged.
- [ ] If client transport is enabled, verify `/api/_evlog/ingest` origin checks and payload validation.

### 4. Module lifecycle — REVW-01

Applies to: `packages/nuxt-galaxy/src/module.ts`, seed/migrate scripts

- [ ] `module.ts` uses `@nuxt/kit`'s `logger.withTag('nuxt-galaxy')` for build-time diagnostics.
- [ ] Runtime module wiring is done through `evlog/nuxt` configuration in `module.ts`, not manual top-level evlog loggers.
- [ ] Seed/migrate scripts use `initLogger({ env: { service } })` + `createRequestLogger({ operation })` and call `emit()` at the end.

### 5. Effect programs — REVW-01 / FIX-03

Applies to: `packages/blendtype/src/**/*.ts`, `packages/nuxt-galaxy/src/runtime/server/utils/**/*.ts`

- [ ] `Effect.logInfo`, `Effect.logWarning`, `Effect.logError`, `Effect.logDebug` are used instead of `console.*`.
- [ ] Severity mapping (`ERROR`/`FATAL` → error, `WARN` → warn, `DEBUG` → debug, default → info) is preserved.
- [ ] No secrets are passed in log messages, annotations, or spans.
- [ ] Effect programs are executed through `runGalaxyEffect` or `runTaskEffect` so logs reach the request/task logger.

---

## Secrets-in-Logs Pass — REVW-02

- [ ] No occurrence of `GALAXY_API_KEY` in any log message, context, annotation, or span.
- [ ] No occurrence of Supabase service-role keys (`SUPABASE_SERVICE_KEY`, `NUXT_SUPABASE_SECRET_KEY`, `NUXT_SUPABASE_SERVICE_KEY`, etc.) in logs.
- [ ] No user JWT or Supabase access token is logged.
- [ ] `redact: !isDev` is still configured in `resolveLogOptions` and honored by evlog.
- [ ] `internal` fields on evlog errors are never serialized to HTTP responses or `toJSON()` output.

Search commands for verification:

```bash
grep -rEn "GALAXY_API_KEY|SUPABASE_SERVICE_KEY|NUXT_SUPABASE.*KEY" \
  --include="*.ts" --include="*.vue" --include="*.js" \
  packages/nuxt-galaxy/src/runtime packages/ui/app packages/wiki/app
```

---

## Package-Boundary Pass — REVW-03

- [ ] `@gaas/wiki` does not import `nuxt-galaxy` internals directly (uses `@gaas/ui` abstractions).
- [ ] `@gaas/ui` does not import `nuxt-galaxy` runtime server utilities.
- [ ] `blendtype` remains pure TypeScript with no Nuxt/Node code.
- [ ] Logging changes do not introduce cross-layer imports that violate the direction:
  `@gaas/wiki` → `@gaas/ui` → `nuxt-galaxy` → `blendtype`.

---

## `console.*` Inventory — FIX-02

Replace remaining raw `console.log` / `console.warn` / `console.error` usage in runtime code with evlog-appropriate calls.

Known locations as of Phase 1 (excludes commented-out code and test/doc references):

- `packages/ui/app/components/meili/index/filter/AssistedBuilder.vue:243` — `console.warn`
- `packages/ui/app/components/meili/index/filter/form/SetInput.vue:31` — `console.warn`
- `packages/ui/app/components/meili/index/filter/plot/CategoryBuilder.vue:166` — `console.warn`
- `packages/ui/app/components/meili/index/filter/plot/CategoryBuilder.vue:283` — `console.warn`
- `packages/ui/app/components/meili/index/filter/plot/CategoryBuilder.vue:326` — `console.warn`
- `packages/ui/app/components/plot/table/header/Histogram.vue:105` — `console.warn`
- `packages/ui/app/composables/meili/useLoadMore.ts:72` — `console.error`
- `packages/ui/app/composables/meili/useMeiliSearch.ts:27` — `console.error`
- `packages/ui/app/composables/plot/table/useCategoryHeader.ts:38` — `console.warn`
- `packages/ui/app/composables/plot/table/useHistogramHeader.ts:13` — `console.warn`
- `packages/ui/app/composables/useMosaicData.ts:35,39,43,48,52,56` — `console.warn`
- `packages/ui/app/composables/useMosaicData.ts:71,87,99` — `console.error`
- `packages/ui/app/utils/table/columns/header.ts:9,31` — `console.warn`
- `packages/wiki/nuxt.config.ts:34` — `console.log`

Verification command:

```bash
grep -rEn "console\.(log|warn|error|info|debug)" \
  --include="*.ts" --include="*.vue" --include="*.js" --include="*.mjs" \
  --exclude-dir=node_modules --exclude-dir=.nuxt --exclude-dir=dist --exclude-dir=.output --exclude-dir=.evlog --exclude-dir=.planning --exclude-dir=coverage --exclude-dir=.venv \
  packages/ docs/ playground/ 2>/dev/null | grep -v "// console\."
```

---

## Severity / Context-Shape Sanity Check — SPEC-01 / SPEC-02

- [ ] Every wide event contains `timestamp`, `level`, `service`, `method`, `path`, `duration`, `status`.
- [ ] Server routes add `handler` and `requestLogs[]`.
- [ ] Tasks add `operation`, `requestId`, and outcome counts (`synced`, `failed`, `skipped`).
- [ ] Effect bridge events include `effectSpans`, `effectAnnotations`, and `effectCause` when present.
- [ ] Severity levels are used consistently:
  - `debug` — verbose dev detail only
  - `info` — normal operations
  - `warn` — recoverable issues
  - `error` / `fatal` — failures
- [ ] No secret values appear in any structured context field.

---

## Verification Gate Checklist — VERF-01 / VERF-02 / VERF-03

Run after all Phase 2 fixes:

- [ ] `pnpm lint` passes across the workspace.
- [ ] `pnpm typecheck` passes across the workspace.
- [ ] `pnpm test` passes across the workspace.

Commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

---

## Additional Threat-Model Checks

Derived from `01-01-PLAN.md` threat model:

- [ ] **T-01-01 Information Disclosure:** Secret redaction verified (see Secrets-in-Logs Pass).
- [ ] **T-01-02 Information Disclosure:** `internal` fields do not leak to clients.
- [ ] **T-01-03 Tampering:** Local FS drain trust assumption documented; production should use immutable external drains (future phase).
- [ ] **T-01-04 Repudiation:** Audit logging for analysis create/delete and role changes is out of scope for this phase; defer to `build-audit-logs` skill / ADOPT-02.
- [ ] **T-01-05 Log Injection:** `log.set()` uses explicit field selection; never `log.set({ body })` or `log.set({ params })` wholesale.
- [ ] **T-01-06 Elevation / DoS:** If client transport is enabled, payload shape and origin are validated and rate-limited.

---

## Sign-off

- [ ] All surface sections reviewed
- [ ] REVW-02 secrets pass complete
- [ ] REVW-03 package boundaries verified
- [ ] FIX-02 console.* inventory addressed
- [ ] SPEC-01 / SPEC-02 shape/severity checks pass
- [ ] VERF-01 / VERF-02 / VERF-03 green
