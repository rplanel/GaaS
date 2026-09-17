# GaaS evlog Conventions

This document defines how evlog is used across the GaaS monorepo. It is derived from the vendored evlog repository, the existing `feat/evlog` branch implementation, and the project's AGENTS.md logging guidelines. Conflicts or refinements relative to AGENTS.md are captured in the [Changes from AGENTS.md](#changes-from-agentsmd) section per D-02.

## Scope

These conventions apply to the five GaaS logging surfaces:

1. Server API routes (`packages/nuxt-galaxy/src/runtime/server/api/**/*.ts`)
2. Scheduled tasks / scripts (`packages/nuxt-galaxy/src/runtime/server/tasks/**/*.ts`)
3. Client composables (`packages/nuxt-galaxy/src/runtime/app/composables/**/*.ts`, `packages/ui/app/composables/**/*.ts`, `packages/wiki/app/composables/**/*.ts`)
4. Module lifecycle and build-time scripts (`packages/nuxt-galaxy/src/module.ts`, seed/migrate scripts)
5. Effect programs (`packages/blendtype/src/**/*.ts`, `packages/nuxt-galaxy/src/runtime/server/utils/**/*.ts`)

## RSCH-01 Boundary Note

RSCH-01 was returned as `unclassified` by the spec-less probe fallback. This plan bounds RSCH-01 to: (a) documenting evlog patterns and conventions for the five surfaces above, and (b) producing a review checklist for Phase 2. No code fixes are performed in Phase 1.

---

## 1. Server API routes

### API

```typescript
import { useLogger } from 'evlog'
import { defineEventHandler } from 'h3'

export default defineEventHandler(async (event) => {
  const log = useLogger(event)
  log.set({ handler: 'workflows:list' })
  log.info('listing workflows')
  // ...
})
```

`useLogger(event)` is auto-imported by `evlog/nuxt` in Nitro server routes.

### Context conventions

- Set `handler` to a stable identifier for the route (e.g., `'workflows:list'`, `'probe'`).
- Set `method` and `path` automatically via `runGalaxyEffect`, or rely on evlog's Nitro integration if not using Effect.
- Add domain context with explicit field names:
  - `user.id` — never the full JWT or email unless required
  - `galaxy.*` — Galaxy-side IDs (workflowId, historyId, analysisId)
  - `db.*` — Drizzle/Postgres record IDs
- Never attach whole request bodies, headers, or raw Galaxy responses.

### Error handling

- Import `createError` from `evlog` (or use the auto-imported `createEvlogError` alias) to avoid clashing with Nuxt/Nitro's `createError`.
- Log before throwing:

```typescript
import { createError, useLogger } from 'evlog'

const log = useLogger(event)
log.set({ handler: 'analyses:create' })
try {
  // ...
}
catch (error) {
  log.error(error, { step: 'dataset-upload' })
  throw createError({
    message: 'Failed to create analysis',
    status: 502,
    why: 'Galaxy returned an error while uploading input datasets',
    fix: 'Check Galaxy status and retry',
    internal: { galaxyStatusCode },
  })
}
```

### Lifecycle

- One wide event is emitted automatically when the response finishes.
- Do not call `log.emit()` manually in API routes unless you need to flush early.
- After emit, the logger is sealed; avoid async work that resolves after the response.

### Routing Effect programs

Wrap Galaxy/DB Effects with `runGalaxyEffect(event, effect)` so that `Effect.log*` calls are routed into the request-scoped logger.

---

## 2. Scheduled tasks / scripts

### API

```typescript
import { createRequestLogger } from 'evlog'
import { defineTask } from 'nitropack/runtime/task'
import { runTaskEffect } from '../utils/evlog-effect'

export default defineTask({
  meta: { name: 'galaxy:sync-analyses' },
  run: async ({ payload }) => {
    const taskLog = createRequestLogger({
      operation: 'galaxy:sync-analyses',
      requestId: crypto.randomUUID(),
    })

    const result = await runTaskEffect(
      taskLog,
      Effect.gen(function* () {
        yield* Effect.logInfo('task started', payload)
        // ...
      }),
    )

    taskLog.emit({ status: result.failed > 0 ? 500 : 200 })
    return { result }
  },
})
```

### Context conventions

- `operation`: stable task name (matches the Nitro task key where possible).
- `requestId`: a UUID for the task run; use `crypto.randomUUID()`.
- Add `ownerId`, `analysisId`, or batch counts as explicit fields.

### Lifecycle

- Tasks do **not** have an automatic emit at the end.
- Call `taskLog.emit({ status })` when the task completes or fails.
- Wrap Effects with `runTaskEffect(taskLog, effect)` so logs attach to the task logger.
- Never share loggers between task invocations; create a fresh `createRequestLogger` per run.

### Error handling

- Use `Effect.logError` inside the Effect program for operational errors.
- Use the final `taskLog.emit({ status })` to communicate outcome severity.
- Do not attach raw `Error` objects directly to the emit payload; serialize messages.

---

## 3. Client composables

### API

In Nuxt apps extending the layers, `log` from `evlog/client` is auto-imported:

```vue
<script setup>
log.info({ action: 'workflow:open', workflowId: props.workflowId })
</script>
```

Explicit import when needed:

```typescript
import { log } from 'evlog/client'

log.warn({ action: 'search:failed', index, error: 'timeout' })
```

### Context conventions

- Prefer structured objects: `log.info({ action: '...', ...context })`.
- Use string messages only for simple tags: `log.info('checkout', 'User initiated checkout')`.
- Useful fields:
  - `action`: semantic action name (e.g., `'workflow:invoke'`)
  - `component`: Vue component or composable name
  - `user-facing` error codes, never raw API keys or tokens

### Transport

Client logs output to the browser console in development. To send them to the server, opt in via `nuxt.config.ts`:

```typescript
export default defineNuxtConfig({
  modules: ['evlog/nuxt'],
  evlog: {
    transport: { enabled: true },
  },
})
```

When enabled, client logs POST to `/api/_evlog/ingest`. The server validates payload shape and origin before draining.

### Current state

As of the `feat/evlog` branch, many client composables in `@gaas/ui` still use raw `console.warn` / `console.error` instead of evlog. Phase 2 must decide whether to migrate these or keep them as development-only diagnostics.

---

## 4. Module lifecycle

### API

For module setup and build-time diagnostics, use `@nuxt/kit`'s `logger`:

```typescript
import { defineNuxtModule, logger } from '@nuxt/kit'

const log = logger.withTag('nuxt-galaxy')

export default defineNuxtModule({
  setup(options, nuxt) {
    log.info('Registering Galaxy handlers')
  },
})
```

For standalone scripts (seed, migrate), use evlog directly:

```typescript
import { initLogger, createRequestLogger } from 'evlog'

initLogger({
  env: { service: 'nuxt-galaxy-migrate' },
})

const migrateLog = createRequestLogger({ operation: 'migrate' })
// ...
migrateLog.emit({ status: 200 })
```

### Context conventions

- Build-time diagnostics belong to `@nuxt/kit` logger (not evlog wide events).
- Runtime module wiring relies on `evlog/nuxt` configuration; do not create manual top-level evlog loggers in module setup.
- Seed/migrate scripts should use `initLogger` + `createRequestLogger` with a stable `operation` name.

---

## 5. Effect programs

### API

Inside Effect programs, use the standard Effect logging APIs:

```typescript
import { Effect } from 'effect'

const program = Effect.gen(function* () {
  yield* Effect.logInfo('fetching workflows')
  yield* Effect.logDebug('pagination', { page, limit })
  yield* Effect.logWarning('slow response', { durationMs })
  yield* Effect.logError('galaxy request failed', error)
})
```

### Routing

Effect logs are consumed by the custom logger registered in `runGalaxyEffect` / `runTaskEffect`:

```typescript
export const evlogEffectLogger = Logger.make((options) => {
  const requestLog = evlogAsyncStorage.getStore()
  // ...
})
```

- `runGalaxyEffect(event, effect)` — attach to the H3 request logger.
- `runTaskEffect(taskLog, effect)` — attach to the task logger.

### Severity mapping

| Effect log level | evlog level |
|------------------|-------------|
| `ERROR`, `FATAL` | `error` |
| `WARN`           | `warn` |
| `DEBUG`          | `debug` |
| default / `INFO` | `info` |

### Context conventions

- Use structured annotations where possible.
- The bridge captures Effect spans, annotations, and causes into `effectSpans`, `effectAnnotations`, and `effectCause` fields on the wide event.
- Do not log sensitive values (tokens, API keys) inside Effect messages or annotations.

### Debug-method fallback

`useLogger(event)` returns an evlog request logger that does not expose a `debug` method. The bridge casts to `RequestLogWithDebug` and falls back to `info` when `debug` is unavailable. This is a tension point documented in the [Changes from AGENTS.md](#changes-from-agentsmd) section.

---

## Log Shapes, Context Fields, and Severity

### Base wide-event schema

Every emitted wide event contains at least:

```json
{
  "timestamp": "2026-08-05T07:54:43.195Z",
  "level": "info",
  "service": "nuxt-galaxy",
  "environment": "development",
  "requestId": "...",
  "method": "GET",
  "path": "/api/probe",
  "duration": "6ms",
  "status": 200
}
```

### Per-surface context fields

| Surface | Common context fields |
|---------|----------------------|
| Server routes | `handler`, `requestLogs[]`, `user.id?`, `galaxy.*`, `db.*` |
| Scheduled tasks | `operation`, `requestId`, `synced`, `failed`, `skipped` |
| Client composables | `action`, `component`, client-side error codes |
| Module lifecycle | `@nuxt/kit` logger tag (not a wide event) |
| Effect programs | `effectSpans`, `effectAnnotations`, `effectCause` |

### Severity usage

| Level | When to use |
|-------|-------------|
| `debug` | Verbose development detail; pagination offsets, cache hits, query plans |
| `info`  | Normal operational events; request handled, task started/completed |
| `warn`  | Recoverable issues; degraded Galaxy, missing optional config, slow responses |
| `error` | Failures that affect the operation; Galaxy down, auth failure, unhandled exception |
| `fatal` | System-wide crash; reserved for top-level error handlers |

### Secret-redaction rules

- Never log `GALAXY_API_KEY`, Supabase service keys (`SUPABASE_SERVICE_KEY`, `NUXT_SUPABASE_SERVICE_KEY`, etc.), or user JWTs/tokens.
- evlog redaction is enabled in production via `redact: !isDev` in `resolveLogOptions`.
- Do not put secrets into `log.set()`, `log.info()`, or Effect annotations manually, even in development.

### Structured error shape

Use evlog's `createError` shape:

```typescript
{
  message: string        // What happened (human-readable, safe for client)
  status?: number        // HTTP status code
  why?: string           // Why it happened
  fix?: string           // How to fix it
  link?: string          // Documentation URL
  cause?: Error          // Original error (backend only)
  internal?: Record<string, unknown>  // Backend-only diagnostics; excluded from toJSON()/HTTP body
}
```

`internal` is never returned to the client and is not serialized by `toJSON()`. It is copied into the wide event under `error.internal` when the error is passed to `log.error()`.

---

## Changes from AGENTS.md

The project AGENTS.md states:

> - Use **evlog** for all Nuxt/Nitro server routes, scheduled tasks, client composables, and module lifecycle events.
> - Use **Effect.log** / **Effect.logInfo** / **Effect.logError** inside Effect programs; these are routed to evlog by the `runGalaxyEffect` / `runTaskEffect` helpers.
> - Never log secrets (`GALAXY_API_KEY`, Supabase service keys, user tokens).
> - Prefer structured context via `log.set({ ... })` or `log.info({ message: '...', ...context })` instead of string interpolation.
> - For server routes: `const log = useLogger(event)`.
> - For client code: use the auto-imported `log` from `evlog/client`.
> - For scripts/tasks with no HTTP event: `const log = createRequestLogger({ operation: '...' })`.

### Refinements surfaced by research

1. **Debug-method fallback (Rule 2 tension).** AGENTS.md does not mention that `useLogger(event)` lacks a `debug` method. The current `evlog-effect.ts` bridge casts to `RequestLogWithDebug` and falls back to `info`. Phase 2 should decide whether to keep this fallback, remove debug logging from Effect programs, or upgrade evlog.

2. **Client composable adoption is incomplete.** AGENTS.md says "use evlog for all ... client composables," but many `@gaas/ui` composables still use `console.warn` / `console.error`. Phase 2 must decide whether these are in scope for migration or intentionally deferred (e.g., because `@gaas/ui` is a library layer and client transport is opt-in).

3. **Module lifecycle distinction.** AGENTS.md groups module lifecycle with evlog, but build-time module setup (`module.ts`) should use `@nuxt/kit`'s `logger.withTag()` for startup diagnostics. Runtime module wiring uses `evlog/nuxt` configuration. Only seed/migrate scripts use `createRequestLogger`. Phase 2 should clarify AGENTS.md wording if this distinction is adopted.

4. **`createError` alias.** AGENTS.md says "Use `createError` from `evlog`". In Nuxt/Nitro code, `createError` is also exported by `h3`/`#imports`. The evlog README recommends importing `createError` from `evlog` directly (or using the auto-imported `createEvlogError` alias) to avoid collision. Phase 2 should decide whether to enforce the evlog import explicitly.

### Conflicts deferred to Phase 2

- No AGENTS.md principle is changed by Phase 1. All refinements above are documented as proposals for Phase 2 resolution per D-03/D-04.
