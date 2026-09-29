# GaaS Logging Specification

This document is the authoritative reference for structured logging in the GaaS monorepo. It defines which logger to use on every surface, the shape of the wide events that are emitted, severity conventions, secret-redaction rules, and the resolution of known gaps from the original `feat/evlog` branch.

For high-level project conventions (stack versions, layer boundaries, testing rules), see [`AGENTS.md`](../AGENTS.md). For detailed logging questions, read this document first.

## Scope

These conventions apply to the six GaaS logging surfaces:

1. **Server API routes** — `packages/nuxt-galaxy/src/runtime/server/api/**/*.ts`
2. **Scheduled tasks / scripts** — `packages/nuxt-galaxy/src/runtime/server/tasks/**/*.ts`, `packages/nuxt-galaxy/bin/*.mjs`, and `packages/nuxt-galaxy/src/runtime/server/lib/*.ts`
3. **Client composables and components** — `packages/nuxt-galaxy/src/runtime/app/composables/**/*.ts`, `packages/ui/app/composables/**/*.ts`, `packages/ui/app/components/**/*.vue`, and `packages/wiki/app/**/*.ts` / `*.vue`
4. **Module lifecycle and build-time scripts** — `packages/nuxt-galaxy/src/module.ts`, `packages/wiki/nuxt.config.ts` build-time hooks, and similar module setup code
5. **Effect programs** — `packages/nuxt-galaxy/src/runtime/server/utils/**/*.ts`
6. **`blendtype`** — `packages/blendtype/src/**/*.ts`, which logs through its own context tag rather than evlog

## Quick-start API snippets

### 1. Server API routes

```typescript
import { defineEventHandler } from 'h3'
import { runGalaxyEffect } from '../utils/evlog-effect'

export default defineEventHandler(async (event) => {
  const log = useLogger(event)            // auto-imported by evlog/nuxt
  log.set({ handler: 'workflows:list' })  // stable route identifier
  log.info('listing workflows')

  return runGalaxyEffect(
    event,
    getWorkflowsEffect().pipe(
      Effect.provide(useGalaxyLayer()),
    ),
  )
})
```

Wrap Galaxy/DB Effects with `runGalaxyEffect(event, effect)` so that `Effect.log*` calls are attached to the request logger.

### 2. Scheduled tasks / scripts

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
        yield* Effect.logInfo('task started', { analysisId: payload?.analysisId })
        // ...
      }),
    )

    taskLog.emit({ status: result.failed > 0 ? 500 : 200 })
    return { result }
  },
})
```

Tasks do **not** emit a wide event automatically. Call `taskLog.emit({ status })` once at completion. Create a fresh `createRequestLogger` per run; never share task loggers across invocations.

Standalone scripts (e.g., `bin/migrate.mjs`) should call `initLogger({ env: { service: '...' } })` once at module load, then create a logger with `createRequestLogger({ operation: '...' })` and call `emit()` at the end.

### 3. Client composables and components

In Nuxt apps extending the GaaS layers, `log` from `evlog/client` is auto-imported:

```vue
<script setup lang="ts">
log.info({ action: 'workflow:open', workflowId: props.workflowId })
</script>
```

Use an explicit import when the symbol is not in an auto-import context:

```typescript
import { log } from 'evlog/client'

log.warn({ action: 'search:failed', tag: 'useMeiliSearch', index, error: getErrorMessage(e) })
log.error({ action: 'upload:failed', tag: 'useUploadFileToStorage', error: String(e) })
```

Prefer structured objects and serialize raw `Error` instances with `String(e)` or a helper before logging. Never pass API keys, tokens, or full user objects.

### 4. Module lifecycle and build-time scripts

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

Runtime module wiring relies on `evlog/nuxt` configuration in `packages/nuxt-galaxy/src/module.ts`; do not create manual top-level evlog loggers in module setup.

### 5. Effect programs

Inside Effect programs, use the standard Effect logging APIs:

```typescript
import { Effect } from 'effect'

const program = Effect.gen(function* () {
  yield* Effect.logInfo('fetching workflows')
  yield* Effect.logDebug('pagination').pipe(Effect.annotateLogs({ page, limit }))
  yield* Effect.logWarning('slow response').pipe(Effect.annotateLogs({ durationMs }))
}).pipe(
  Effect.tapErrorCause(cause => Effect.logError('galaxy request failed', cause)),
)
```

Execute these programs through `runGalaxyEffect` or `runTaskEffect` so the custom `evlogEffectLogger` bridge routes them into the request/task logger.

Identifiers go through `Effect.annotateLogs`, which the bridge writes as `effectAnnotations`, and a failure is logged as its `Cause`, which the bridge writes as `effectCause`. A plain object or error passed beside the message is stringified into the message text, where no query can reach it.

### 6. `blendtype`

`blendtype` is published on its own and must not depend on evlog, so it does not
use the bridge above. It asks the Effect context for a `BlendTypeLogger` and
leaves the destination to whoever runs it:

```typescript
import { blendTypeLog } from './logger'

yield* blendTypeLog('info', '[downloadDatasetStreamEffect] start', { historyId, datasetId })
```

`blendTypeLog` requires nothing: with no `BlendTypeLogger` in context it falls
back to Effect's own logger, which is what standalone `blendtype` and its tests
see. Adding a log line therefore never changes an Effect's `R`, and no caller
has to provide anything.

Under `nuxt-galaxy` the answer is `BlendTypeLoggerEvlogLayer`, which
`runGalaxyEffect` and `runTaskEffect` provide alongside `evlogEffectLogger`. It
writes to the same request logger the handler uses, with the library's context
**flat on the event** — `historyId`, not `effectAnnotations.historyId` — because
it is a structured record the library chose, not Effect machinery the bridge had
to serialise. Debug follows the same global-`log.debug` fallback as the bridge,
for the same reason (see below).

Inside `blendtype`, prefer `blendTypeLog` to `Effect.log*`: a raw `Effect.log`
still reaches evlog through the default-logger replacement, but its context
lands under `effectAnnotations` instead, so two queries are needed for one
library.

## Expected wide-event shape

Every request-scoped wide event contains at least the following base fields:

```json
{
  "timestamp": "2026-08-05T07:54:43.195Z",
  "level": "info",
  "service": "nuxt-galaxy",
  "environment": "development",
  "requestId": "ceb39ee8-3d9c-4c4b-9dfe-75736a6ab4d0",
  "method": "GET",
  "path": "/api/probe",
  "duration": "6ms",
  "status": 200
}
```

### Per-surface context fields

| Surface | Common context fields |
|---|---|
| Server routes | `handler`, `requestLogs[]`, `user.id?`, `galaxy.*`, `db.*`, `cause` |
| Scheduled tasks | `operation`, `requestId`, `synced`, `failed`, `skipped` |
| Client composables | `action`, `tag` / `component`, client-side error codes |
| Module lifecycle | `@nuxt/kit` logger tag (not a wide event) |
| Effect programs | `effectSpans`, `effectAnnotations`, `effectCause` |
| `blendtype` | whatever the call passed as context, flat (e.g. `historyId`, `datasetId`, `function`) |

A surface is what the code does, not which directory its file sits in. `server/utils/**` code that logs to the request logger after the fold — `toHttpError`'s `"<handler> handler failed"` line — decorates the server-route wide event, so the cause it writes is `cause`. A cause raised inside a running effect reaches the bridge as a `Cause` and is written as `effectCause`, and only when the cause is non-empty, so an event carrying `effectCause` is one where something failed. Two names for two surfaces: a query for one never has to know about the other.

Guidelines for adding context:

- Set `handler` to a stable route identifier (e.g., `'workflows:list'`, `'probe'`).
- Use explicit field names: `user.id`, `galaxy.workflowId`, `db.analysisId`. Never attach whole request bodies, raw Galaxy responses, or headers.
- For tasks, include outcome counts (`synced`, `failed`, `skipped`) in the final `emit()`.
- For client logs, use `action` and `tag` to identify the source composable or component.

## Severity usage

| Level | When to use |
|---|---|
| `debug` | Verbose development detail: pagination offsets, cache hits, query plans, component unmount lifecycle noise |
| `info` | Normal operational events: request handled, task started/completed, successful upload |
| `warn` | Recoverable issues: degraded Galaxy response, missing optional config, slow responses, invalid filter state |
| `error` | Failures that affect the operation: Galaxy down, auth failure, unhandled exception, invalid operator that precedes a thrown error |
| `fatal` | System-wide crash; reserved for top-level error handlers |

## Secret-redaction rules

Never log the following values anywhere in runtime code:

- `GALAXY_API_KEY`
- Supabase service-role keys (`SUPABASE_SERVICE_KEY`, `NUXT_SUPABASE_SERVICE_KEY`, `NUXT_SUPABASE_SECRET_KEY`, etc.)
- User JWTs, access tokens, session tokens, or refresh tokens
- Passwords, full card numbers, or other credentials

Additional rules:

- Do not put secrets into `log.set()`, `log.info()`, `log.warn()`, `log.error()`, or Effect annotations/spans, even in development.
- evlog redaction is enabled in production via `redact: !isDev` in `resolveLogOptions`. Rely on this as a safety net, not a primary strategy.
- Use explicit field selection: `log.set({ user: { id: user.id, plan: user.plan } })`, not `log.set({ user: body })`.

## Sync trace field allowlist

The canonical Galaxy analysis sync path logs only the following field categories. All values must be scalars, short sanitized strings, or counts. Never attach raw Galaxy response objects, dataset streams, full `stderr`/`stdout`, dataset `peek` content, `misc_blurb`, full error objects, or secrets.

### Allowed fields

- **Scalar identifiers** (string or `null` when unknown): `analysisId`, `ownerId`, `galaxyInvocationId`, `historyId`, `jobId`, `datasetId`.
- **States and outcomes**: `state`, `isSync`, `derivedOutcome`.
- **Counts**: `synced`, `failed`, `skipped`, `steps`, `rowCount`.
- **Durations**: `durationMs` (integer milliseconds).
- **Sanitized short messages**: `message` truncated to 500 characters.
- **Stream presence flag**: `hasStream` (boolean) in place of the actual stream value.

### Forbidden fields

- Raw Galaxy response objects or invocation payloads.
- Dataset streams, stream buffers, or file contents.
- Full job `stderr`/`stdout` strings.
- Dataset `peek` content or `misc_blurb`.
- Full `Error` objects or stack traces.
- Any secret or credential value (`GALAXY_API_KEY`, Supabase service-role keys, JWTs, tokens).

## Effect `logDebug` path

`useLogger(event)` returns an evlog request logger that does **not** expose a `debug` method. To avoid downgrading debug-level Effect logs to `info`, the `evlog-effect.ts` bridge routes `Effect.logDebug` to evlog's global `log.debug(...)` when a request-scoped debug method is unavailable:

```typescript
// packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts
function logToRequestLog(
  requestLog: ReturnType<typeof useLogger>,
  level: 'error' | 'warn' | 'info' | 'debug',
  message: string,
  context: Record<string, unknown>,
): void {
  switch (level) {
    case 'error': requestLog.error(message, context); break
    case 'warn':  requestLog.warn(message, context); break
    case 'debug':
      // Request logger has no debug method; preserve severity via global logger.
      logToEvlogGlobal('debug', message, context)
      break
    case 'info':
    default:
      requestLog.info(message, context)
  }
}
```

The bridge still runs inside `evlogAsyncStorage.run(requestLog, ...)`, so the global debug entry is emitted in addition to the request-wide event. This satisfies D-04 from Phase 2 planning.

## Changes from `AGENTS.md`

The root `AGENTS.md` originally stated high-level logging guidance. Research and the Phase 2 review refined the following points:

1. **Debug-method fallback.** `AGENTS.md` did not mention that `useLogger(event)` lacks a `debug` method. The bridge now routes `Effect.logDebug` to evlog's global `log.debug` instead of downgrading to `info`.

2. **Client composable adoption.** `AGENTS.md` said to use evlog for all client composables, but many `@gaas/ui` files still used raw `console.warn` / `console.error`. Phase 2 migrated these to `evlog/client` structured calls.

3. **Module lifecycle distinction.** `AGENTS.md` grouped module lifecycle with evlog. Build-time module setup (`module.ts`, `packages/wiki/nuxt.config.ts` content hooks) now uses `@nuxt/kit`'s `logger.withTag(...)`. Runtime module wiring still uses `evlog/nuxt` configuration. Seed/migrate scripts use `initLogger` + `createRequestLogger`.

4. **`createError` alias.** `AGENTS.md` says to use `createError` from `evlog`. In Nuxt/Nitro code, `createError` is also exported by `h3` / `#imports`. Prefer importing `createError` from `evlog` directly (or relying on the auto-imported `createEvlogError` alias) to avoid collision. Server routes currently using `h3`'s `createError` are acceptable but should be migrated when the error catalog is wired in a future phase.

## Link to project conventions

For the authoritative project stack, dependency versions, layer boundaries, and "never log secrets" permission boundary, see [`AGENTS.md`](../AGENTS.md). This `LOGGING-SPEC.md` takes precedence for detailed logging conventions, API usage, and wide-event shape.
