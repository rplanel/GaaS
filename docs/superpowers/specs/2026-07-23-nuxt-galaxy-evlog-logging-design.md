# nuxt-galaxy structured logging with evlog

**Date:** 2026-07-23  
**Scope:** `packages/nuxt-galaxy`  
**Status:** Design review

## Goal

Add structured, observable logging to `nuxt-galaxy` using the already-declared `evlog` dependency (`^2.22.3`). The logging must cover:

- Nuxt/Nitro server lifecycle and HTTP requests.
- Effect-based business logic (`packages/nuxt-galaxy` server utilities and tasks).
- Client-side composables and utilities.

This gives both human developers and coding agents feedback on what the module is doing, why it fails, and how data flows through it.

## Non-goals

- No remote observability backend (Axiom, OTLP, Sentry, etc.) in this iteration.
- No audit-log subsystem.
- No sampling by default; every request/event is logged in dev.
- No change to `blendtype` Effect logging; `blendtype` stays independent.

## Design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Auto-wire logging | Yes, inside the module | Consumers get logging out of the box. |
| Effect logs | Bridge to evlog (B2) with safe fallback | Keep `Effect.log*` call sites unchanged, but route structured output through evlog. If the request context is lost inside an Effect fiber, logs fall back to the global evlog stream instead of disappearing. |
| Destinations | Console + local file drain | Console for immediate dev feedback, NDJSON files under `.evlog/logs/` for later inspection. |
| File drain directory | Configurable via `galaxy.logs.file.dir` | User wants configurability. |
| Redaction | Enabled in production by default | Avoid leaking emails, tokens, etc. |

## Module configuration

Extend `ModuleOptions` in `packages/nuxt-galaxy/src/module.ts`:

```ts
interface LogFileOptions {
  /** Directory for NDJSON log files. Default: `.evlog/logs` */
  dir?: string
  /** Max rotated files to keep. Default: 7 */
  maxFiles?: number
  /** Pretty-print JSON in files. Default: true in dev, false in prod */
  pretty?: boolean
}

interface LogOptions {
  /** Enable evlog. Default: true */
  enabled?: boolean
  /** Service name on every event. Default: `nuxt-galaxy` */
  service?: string
  /** Minimum level for global tagged logs. Default: `debug` */
  minLevel?: 'debug' | 'info' | 'warn' | 'error'
  /** Pretty-print to console. Default: true in dev, false in prod */
  pretty?: boolean
  /** Emit to stdout/stderr. Default: true */
  console?: boolean
  /** File drain configuration. Default: `{ dir: '.evlog/logs', maxFiles: 7 }` */
  file?: boolean | LogFileOptions
  /** PII redaction. Default: true in production, false in dev */
  redact?: boolean
}
```

Default values are resolved at build time:

```ts
const isDev = nuxt.options.dev
const logs = moduleOptions.logs ?? {}
const resolvedLogs: Required<LogOptions> = {
  enabled: logs.enabled ?? true,
  service: logs.service ?? 'nuxt-galaxy',
  minLevel: logs.minLevel ?? 'debug',
  pretty: logs.pretty ?? isDev,
  console: logs.console ?? true,
  file: logs.file === false
    ? false
    : {
        dir: (logs.file as LogFileOptions | undefined)?.dir ?? '.evlog/logs',
        maxFiles: (logs.file as LogFileOptions | undefined)?.maxFiles ?? 7,
        pretty: (logs.file as LogFileOptions | undefined)?.pretty ?? isDev,
      },
  redact: logs.redact ?? !isDev,
}
```

## Module wiring

### Install evlog from inside nuxt-galaxy

```ts
import { installModule } from '@nuxt/kit'

await installModule('evlog/nuxt', {
  enabled: resolvedLogs.enabled,
  env: { service: resolvedLogs.service },
  minLevel: resolvedLogs.minLevel,
  pretty: resolvedLogs.pretty,
  console: resolvedLogs.console,
  redact: resolvedLogs.redact,
})
```

This registers evlog’s server plugin (attaches `event.context.log`), client plugin, and auto-imports `log` / `useLogger`.

### File drain plugin

`src/runtime/server/plugins/evlog.server.ts`:

```ts
import { createFsDrain } from 'evlog/fs'
import { defineNitroPlugin } from 'nitropack/runtime'

export default defineNitroPlugin((nitroApp) => {
  const file = useRuntimeConfig().galaxy.logs.file
  if (!file) return

  nitroApp.hooks.hook('evlog:drain', createFsDrain({
    dir: file.dir,
    maxFiles: file.maxFiles,
    pretty: file.pretty,
  }))
})
```

The plugin is added from `src/module.ts` via `addServerPlugin`.

### Ignore log files

Add `.evlog/` to `.gitignore` (`evlog/fs` also creates a local `.gitignore`, but a root-level rule is safer).

## Server logging

### Effect bridge

Create `src/runtime/server/utils/evlog-effect.ts`.

Core idea: keep `Effect.log*` unchanged at call sites, but install a custom `Logger` that forwards entries to the current evlog request logger. Because Effect logger callbacks cannot read Effect context, we use an `AsyncLocalStorage` set around `Effect.runPromise`.

```ts
import { AsyncLocalStorage } from 'node:async_hooks'
import type { H3Event } from 'h3'
import { Effect, Logger } from 'effect'
import { log as evlogGlobal } from 'evlog'

const evlogAsyncStorage = new AsyncLocalStorage<ReturnType<typeof useLogger>>()

function formatEffectMessage(message: unknown): string {
  const parts = Array.isArray(message) ? message : [message]
  return parts.map(m => (typeof m === 'string' ? m : JSON.stringify(m))).join(' ')
}

export const evlogEffectLogger = Logger.make(({ logLevel, message, cause, spans, annotations }) => {
  const requestLog = evlogAsyncStorage.getStore()
  const text = formatEffectMessage(message)
  const context = {
    ...(spans ? { effectSpans: spans } : {}),
    ...(annotations ? { effectAnnotations: annotations } : {}),
    ...(cause ? { effectCause: String(cause) } : {}),
  }

  if (!requestLog) {
    evlogGlobal.info(text, context)
    return
  }

  switch (logLevel.label) {
    case 'Error':
    case 'Fatal':
      requestLog.error(text, context)
      break
    case 'Warning':
      requestLog.warn(text, context)
      break
    default:
      requestLog.info(text, context)
  }
})

export function runGalaxyEffect<T>(event: H3Event, effect: Effect.Effect<T, any, any>): Promise<T> {
  const requestLog = useLogger(event)
  requestLog.set({ handler: event.path, method: event.method })

  return evlogAsyncStorage.run(requestLog, () =>
    Effect.runPromise(
      effect.pipe(
        Effect.provide(Logger.replace(Logger.defaultLogger, evlogEffectLogger)),
      ),
    ),
  )
}
```

For Nitro scheduled tasks that have no HTTP event:

```ts
import { createRequestLogger } from 'evlog'

const taskLog = createRequestLogger({ operation: 'galaxy:sync-analyses', requestId: crypto.randomUUID() })
return evlogAsyncStorage.run(taskLog, () => Effect.runPromise(...))
```

### Refactor API handlers

Every handler that currently runs an Effect is updated to use `runGalaxyEffect`:

```ts
// src/runtime/server/api/galaxy/workflows.get.ts
export default defineEventHandler(async (event) => {
  return runGalaxyEffect(
    event,
    getWorkflowsEffect().pipe(
      toGalaxyServiceUnavailable,
      Effect.provide(useGalaxyLayer()),
    ),
  )
})
```

Handlers that do not use Effect use `useLogger(event)` directly:

```ts
export default defineEventHandler(async (event) => {
  const log = useLogger(event)
  log.set({ handler: 'probe' })
  log.info('probe:ok')
  return 'ok'
})
```

### Replace stray `console.*` calls

Files to migrate:

- `src/runtime/server/plugins/migrations.server.ts`
- `src/runtime/server/plugins/galaxy.server.ts` (change throws to logged errors where appropriate)
- `src/runtime/server/lib/seed.ts`
- `src/runtime/server/lib/migrate.ts`
- `src/runtime/server/api/db/analyses/monitoring.get.ts`
- `src/runtime/server/tasks/galaxy/sync-analyses.ts` (remove `Logger.logFmt`, use the bridge)

## Client logging

`evlog/nuxt` auto-imports `log` in Vue files. In composables, import it explicitly:

```ts
import { log } from 'evlog/client'

log.info('useSupabaseRealtime', 'subscribing', { channelName, tableName })
```

Migrate:

- `src/runtime/app/composables/useSupabaseRealtime.ts`
- `src/runtime/app/composables/useUploadFileToStorage.ts`
- `src/runtime/app/composables/galaxy/useDatasetTags.ts`
- `src/runtime/app/utils/supabase.ts`

Client transport stays disabled in this iteration; logs remain in the browser console.

## Drains

| Drain | Source | Config |
|---|---|---|
| Console | evlog/nuxt built-in | `pretty`, `console`, `minLevel` |
| File system | `evlog/fs` `createFsDrain` | `galaxy.logs.file.dir`, `maxFiles`, `pretty` |

## Testing plan

1. **Unit test the bridge logger**
   - Mock an evlog request logger.
   - Call `evlogEffectLogger.log(...)` inside an `AsyncLocalStorage.run`.
   - Assert the request logger received the expected message/level.
   - Assert global fallback works when no store is set.

2. **Handler smoke tests**
   - Existing tests should still pass.
   - Update any tests that assert no `console.error` if they now observe evlog logging.

3. **QA commands**
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - Manual: run `pnpm dev`, hit an API route, verify `.evlog/logs/<date>.jsonl` contains `service: 'nuxt-galaxy'`.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Effect fiber loses ALS context | Fallback to global evlog; logs still appear, just not attached to the request event. |
| Secrets leaked into logs | Enable evlog redaction in production; never pass `apiKey` to `log.set`. |
| Tests assert `console.*` output | Use `evlog`’s structured API; mock drains in tests if needed. |
| File drain in serverless/ephemeral environments | File drain is acceptable for local dev; production can disable it via `galaxy.logs.file: false`. |

## Implementation order

1. Add `LogOptions` to `ModuleOptions` and resolve defaults in `src/module.ts`.
2. Install `evlog/nuxt` and register the file-drain plugin.
3. Create `src/runtime/server/utils/evlog-effect.ts` with bridge + `runGalaxyEffect`.
4. Replace `console.*` in server plugins/lib/tasks.
5. Refactor API handlers to use `runGalaxyEffect`.
6. Replace `console.*` in client composables with `log` from `evlog/client`.
7. Add/update tests.
8. Run lint, typecheck, and tests.
