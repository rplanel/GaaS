# Phase 2 — Pattern Mapping: Review, Spec, and Fix evlog Integration

**Generated:** 2026-08-05

This document maps every file that Phase 2 will create or modify to its closest existing analog in the codebase. For each target it records the file's role, data flow, and concrete excerpts from both the target and the analog so that implementation agents can follow established patterns.

---

## 1. New authoritative spec — `.planning/LOGGING-SPEC.md`

| | |
|---|---|
| **Role** | Project-level documentation; becomes the canonical reference for evlog usage across all five GaaS surfaces. |
| **Data flow** | Written once; read by future agents and developers. `AGENTS.md` will point to it but not duplicate it. |
| **Create / modify** | Create. |
| **Closest analog** | `.planning/phases/01-research-evlog-patterns-and-conventions/EVLOG-CONVENTIONS.md` and `01-SKELETON.md`. |

### Analog excerpt — `EVLOG-CONVENTIONS.md`

```markdown
## Scope

These conventions apply to the five GaaS logging surfaces:

1. Server API routes (`packages/nuxt-galaxy/src/runtime/server/api/**/*.ts`)
2. Scheduled tasks / scripts (`packages/nuxt-galaxy/src/runtime/server/tasks/**/*.ts`)
3. Client composables (`packages/nuxt-galaxy/src/runtime/app/composables/**/*.ts`, `packages/ui/app/composables/**/*.ts`, `packages/wiki/app/composables/**/*.ts`)
4. Module lifecycle and build-time scripts (`packages/nuxt-galaxy/src/module.ts`, seed/migrate scripts)
5. Effect programs (`packages/blendtype/src/**/*.ts`, `packages/nuxt-galaxy/src/runtime/server/utils/**/*.ts`)
```

### Analog excerpt — `01-SKELETON.md`

```json
{
  "method": "GET",
  "path": "/api/probe",
  "requestId": "ceb39ee8-3d9c-4c4b-9dfe-75736a6ab4d0",
  "handler": "probe",
  "requestLogs": [
    {
      "level": "info",
      "message": "probe:ok",
      "timestamp": "2026-08-05T07:54:43.191Z"
    }
  ],
  "status": 200,
  "duration": "6ms",
  "timestamp": "2026-08-05T07:54:43.195Z",
  "level": "info",
  "service": "nuxt-galaxy",
  "environment": "development"
}
```

### Pattern notes

- Keep the five-surface structure from `EVLOG-CONVENTIONS.md`.
- Promote the wide-event shape proven in `01-SKELETON.md` into the formal spec.
- Add a "Changes from AGENTS.md" delta section (per D-02).

---

## 2. AGENTS.md pointer update — `/home/rplanel/projects/gaas/AGENTS.md`

| | |
|---|---|
| **Role** | High-level project conventions; retains only a short pointer to the new spec. |
| **Data flow** | Updated text; no runtime data. |
| **Create / modify** | Modify. |
| **Closest analog** | Existing `AGENTS.md` logging section. |

### Target excerpt — current `AGENTS.md`

```markdown
## Logging

- Use **evlog** for all Nuxt/Nitro server routes, scheduled tasks, client composables, and module lifecycle events.
- Use **Effect.log** / **Effect.logInfo** / **Effect.logError** inside Effect programs; these are routed to evlog by the `runGalaxyEffect` / `runTaskEffect` helpers.
- Never log secrets (`GALAXY_API_KEY`, Supabase service keys, user tokens).
- Prefer structured context via `log.set({ ... })` or `log.info({ message: '...', ...context })` instead of string interpolation.
- For server routes: `const log = useLogger(event)`.
- For client code: use the auto-imported `log` from `evlog/client`.
- For scripts/tasks with no HTTP event: `const log = createRequestLogger({ operation: '...' })`.
```

### Pattern notes

- Replace the detailed bullets with a single paragraph that references `.planning/LOGGING-SPEC.md`.
- Keep the "Never log secrets" rule in `AGENTS.md` because it is a permission boundary, not a spec detail.

---

## 3. Effect→evlog debug path — `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts`

| | |
|---|---|
| **Role** | Bridge that routes `Effect.log*` calls into the request-scoped or global evlog logger. |
| **Data flow** | `runGalaxyEffect` / `runTaskEffect` → `evlogAsyncStorage` → `evlogEffectLogger` → `logToRequestLog` or `logToEvlogGlobal`. |
| **Create / modify** | Modify. |
| **Closest analog** | Same file (the existing fallback) plus `evlog`'s global `log.debug` API in `@repos/evlog/packages/evlog/src/logger.ts`. |

### Target excerpt — current fallback

```typescript
function logToRequestLog(
  requestLog: ReturnType<typeof useLogger>,
  level: 'error' | 'warn' | 'info' | 'debug',
  message: string,
  context: Record<string, unknown>,
): void {
  switch (level) {
    case 'error':
      requestLog.error(message, context)
      break
    case 'warn':
      requestLog.warn(message, context)
      break
    case 'debug': {
      const logWithDebug = requestLog as RequestLogWithDebug
      if (typeof logWithDebug.debug === 'function') {
        logWithDebug.debug(message, context)
      }
      else {
        requestLog.info(message, context)
      }
      break
    }
    case 'info':
    default:
      requestLog.info(message, context)
  }
}
```

### Analog excerpt — evlog global `log.debug`

From `@repos/evlog/packages/evlog/src/logger.ts`:

```typescript
const _log: Log = {
  info: createLogMethod('info'),
  error: createLogMethod('error'),
  warn: createLogMethod('warn'),
  debug: createLogMethod('debug'),
}
```

From `@repos/evlog/packages/evlog/src/types.ts`, `RequestLogger` exposes no `debug`:

```typescript
export interface RequestLogger<T extends object = Record<string, unknown>> {
  set: (context: FieldContext<T>) => void
  setLevel: (level: LogLevel) => void
  error: (error: Error | string, context?: FieldContext<T>) => void
  info: (message: string, context?: FieldContext<T>) => void
  warn: (message: string, context?: FieldContext<T>) => void
  emit: (overrides?: FieldContext<T> & { _forceKeep?: boolean }) => WideEvent | null
  getContext: () => FieldContext<T> & Record<string, unknown>
}
```

### Pattern notes

- `useLogger(event)` returns an `AuditableLogger` that has no `debug` method.
- The supported debug mechanism is the global evlog `log.debug({ message, ...context })`.
- Recommended change: in `logToRequestLog`, route `case 'debug'` to `logToEvlogGlobal('debug', message, context)` instead of `requestLog.info`.
- Remove the `RequestLogWithDebug` cast.

---

## 4. Module log configuration — `packages/nuxt-galaxy/src/log-options.ts`

| | |
|---|---|
| **Role** | Resolves module-level logging options before passing them to `evlog/nuxt`. |
| **Data flow** | `module.ts` calls `resolveLogOptions(nuxt.options.dev, moduleOptions.logs)` and feeds the result into `installModule('evlog/nuxt', ...)`. |
| **Create / modify** | Read / reference only (likely no change). |
| **Closest analog** | Existing `log-options.ts`. |

### Analog excerpt

```typescript
export interface ResolvedLogOptions {
  enabled: boolean
  service: string
  minLevel: 'debug' | 'info' | 'warn' | 'error'
  pretty: boolean
  console: boolean
  file: ResolvedLogFileOptions | false
  redact: boolean
}

export function resolveLogOptions(isDev: boolean, logs: LogOptions = {}): ResolvedLogOptions {
  const fileInput = logs.file === false
    ? false
    : (logs.file === true ? {} : (logs.file ?? {}))
  return {
    enabled: logs.enabled ?? true,
    service: logs.service ?? 'nuxt-galaxy',
    minLevel: logs.minLevel ?? 'debug',
    pretty: logs.pretty ?? isDev,
    console: logs.console ?? true,
    file: fileInput === false
      ? false
      : {
          dir: fileInput.dir ?? '.evlog/logs',
          maxFiles: fileInput.maxFiles ?? 7,
          pretty: fileInput.pretty ?? isDev,
        },
    redact: logs.redact ?? !isDev,
  }
}
```

### Pattern notes

- `minLevel: 'debug'` is already the default; no new option is required.
- The debug-path fix lives in `evlog-effect.ts`, not here.

---

## 5. FS drain wiring — `packages/nuxt-galaxy/src/runtime/server/utils/evlog-drain.ts` and `packages/nuxt-galaxy/src/runtime/server/plugins/evlog.server.ts`

| | |
|---|---|
| **Role** | Registers the evlog file-system drain from Nitro runtime config. |
| **Data flow** | `evlog.server.ts` reads `runtimeConfig.galaxy.logs.file` → `registerEvlogFsDrain(...)` → `nitroApp.hooks.hook('evlog:drain', createFsDrain(...))`. |
| **Create / modify** | Reference only (no expected change). |
| **Closest analog** | Existing files. |

### Analog excerpt — `evlog-drain.ts`

```typescript
import type { ResolvedLogFileOptions } from '../../../log-options'
import { createFsDrain } from 'evlog/fs'

export interface EvlogDrainNitroApp {
  hooks: {
    hook: (name: 'evlog:drain', handler: (ctx: any) => void | Promise<void>) => void
  }
}

export function registerEvlogFsDrain(nitroApp: EvlogDrainNitroApp, fileOptions: ResolvedLogFileOptions | false): void {
  if (!fileOptions)
    return
  nitroApp.hooks.hook('evlog:drain', createFsDrain({
    dir: fileOptions.dir,
    maxFiles: fileOptions.maxFiles,
    pretty: fileOptions.pretty,
  }))
}
```

### Analog excerpt — `evlog.server.ts`

```typescript
import { useRuntimeConfig } from '#imports'
import { defineNitroPlugin } from 'nitropack/runtime'
import { registerEvlogFsDrain } from '../utils/evlog-drain'

export default defineNitroPlugin((nitroApp) => {
  const file = useRuntimeConfig().galaxy?.logs?.file
  registerEvlogFsDrain(nitroApp, file)
})
```

---

## 6. Module wiring — `packages/nuxt-galaxy/src/module.ts`

| | |
|---|---|
| **Role** | Installs `evlog/nuxt`, resolves log options, and wires runtime config. |
| **Data flow** | Module options → `resolveLogOptions` → `installModule('evlog/nuxt', ...)` → runtime config `galaxy.logs`. |
| **Create / modify** | Reference only (no expected change unless debug wiring is needed). |
| **Closest analog** | Existing `module.ts`. |

### Analog excerpt

```typescript
const _resolvedLogs = logOptions.resolveLogOptions(nuxt.options.dev, moduleOptions.logs)

await installModule('evlog/nuxt', {
  enabled: _resolvedLogs.enabled,
  env: { service: _resolvedLogs.service },
  minLevel: _resolvedLogs.minLevel,
  pretty: _resolvedLogs.pretty,
  console: _resolvedLogs.console,
  redact: _resolvedLogs.redact,
})

nuxt.options.runtimeConfig.galaxy = defu(
  runtimeConfig.galaxy || {},
  {
    apiKey: moduleOptions.apiKey,
    email: moduleOptions.email,
    drizzle: {
      databaseUrl: moduleOptions.databaseUrl,
    },
    logs: _resolvedLogs,
  },
) as typeof nuxt.options.runtimeConfig.galaxy
```

### Pattern notes

- Keep passing the resolved log options into `evlog/nuxt`.
- Do not add a separate debug flag unless the spec requires it.

---

## 7. Server route pattern (reference) — `packages/nuxt-galaxy/src/runtime/server/api/**/*.ts`

| | |
|---|---|
| **Role** | Correct existing usage to imitate when fixing server routes or adding new ones. |
| **Data flow** | Handler calls `runGalaxyEffect(event, effect)` so Effect logs attach to the request logger. |
| **Create / modify** | Reference / audit. |
| **Closest analog** | `packages/nuxt-galaxy/src/runtime/server/api/galaxy/workflows.get.ts` and `probe.get.ts`. |

### Analog excerpt — `workflows.get.ts`

```typescript
import { getWorkflowsEffect, toGalaxyServiceUnavailable } from 'blendtype'
import { Effect } from 'effect'
import { defineEventHandler } from 'h3'
import { runGalaxyEffect } from '../../utils/evlog-effect'
import { useGalaxyLayer } from '../../utils/galaxy'

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

### Analog excerpt — `probe.get.ts`

```typescript
import { useLogger } from 'evlog'
import { defineEventHandler } from 'h3'

export default defineEventHandler(async (event) => {
  const log = useLogger(event)
  log.set({ handler: 'probe' })
  log.info('probe:ok')
  return 'ok'
})
```

---

## 8. Scheduled task pattern (reference) — `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts`

| | |
|---|---|
| **Role** | Correct existing task usage to imitate. |
| **Data flow** | `defineTask` creates a task logger with `createRequestLogger` → `runTaskEffect` routes Effect logs → `taskLog.emit({ status })`. |
| **Create / modify** | Reference / audit. |
| **Closest analog** | Same file. |

### Analog excerpt

```typescript
import { createRequestLogger } from 'evlog'
import { defineTask } from 'nitropack/runtime/task'
import { runTaskEffect } from '../../utils/evlog-effect'

export default defineTask({
  meta: {
    name: 'galaxy:sync-analyses',
    description: 'Sync pending Galaxy analyses to Supabase',
  },
  run: async ({ payload }) => {
    const taskLog = createRequestLogger({
      operation: 'galaxy:sync-analyses',
      requestId: crypto.randomUUID(),
    } as Parameters<typeof createRequestLogger>[0])

    const result = await runTaskEffect(taskLog, Effect.gen(function* () {
      // ...
      yield* Effect.logInfo('task started', payload)
      // ...
    }).pipe(
      Effect.catchAll(error =>
        Effect.logError('task error', error).pipe(
          Effect.as({ synced: 0, failed: 1, skipped: 0, error: String(error) }),
        ),
      ),
    ))

    taskLog.emit({ status: result.failed > 0 ? 500 : 200 })
    return { result }
  },
})
```

---

## 9. Client composable pattern (reference) — `packages/nuxt-galaxy/src/runtime/app/composables/**/*.ts`

| | |
|---|---|
| **Role** | Correct client-side evlog usage to imitate when replacing raw `console.*` in `@gaas/ui`. |
| **Data flow** | Import `log` from `evlog/client` and call structured methods. |
| **Create / modify** | Reference. |
| **Closest analog** | `packages/nuxt-galaxy/src/runtime/app/composables/useUploadFileToStorage.ts` and `useSupabaseRealtime.ts`. |

### Analog excerpt — `useUploadFileToStorage.ts`

```typescript
import { log } from 'evlog/client'

function uploadFileToStorage(file: File) {
  pending.value = true
  log.info({
    message: 'starting upload',
    tag: 'useUploadFileToStorage',
    fileName: file.name,
    fileSize: file.size,
  })

  return Effect.runPromise(/* ... */)
    .then((result) => {
      log.info({
        message: 'upload success',
        tag: 'useUploadFileToStorage',
        fileName: file.name,
      })
      return result
    })
    .catch((error) => {
      log.error({
        message: 'upload failed',
        tag: 'useUploadFileToStorage',
        fileName: file.name,
        error: String(error),
      })
      throw error
    })
    .finally(() => {
      pending.value = false
    })
}
```

### Analog excerpt — `useSupabaseRealtime.ts`

```typescript
import { log } from 'evlog/client'

function subscribe() {
  if (!channels[channelName]) {
    const channel = supabase.channel(channelName)
    // ...
    log.info({
      message: 'subscribing to Supabase realtime channel',
      tag: 'useSupabaseRealtime',
      channelName,
      tableName,
    })
    channel.on(/* ... */).subscribe()
  }
  // ...
}
```

### Pattern notes

- Use `log.warn({ action: '...', ...context })` and `log.error({ action: '...', error: String(e), ...context })`.
- Prefer `action` or `tag` to identify the source composable/component.
- Never pass raw `Error` objects unserialized.

---

## 10. Raw `console.*` cleanup — `@gaas/ui` client files

All files below are in `packages/ui/app/` and currently use `console.warn` / `console.error`. They should be migrated to `evlog/client` calls following the pattern in §9.

### 10.1 `composables/meili/useLoadMore.ts`

| | |
|---|---|
| **Role** | Paginated MeiliSearch loader. |
| **Data flow** | `runPaginatedSearch` catches errors from `useMeiliSearch.search`. |
| **Create / modify** | Modify. |
| **Closest analog** | `packages/nuxt-galaxy/src/runtime/app/composables/useUploadFileToStorage.ts`. |

#### Target excerpt

```typescript
const runPaginatedSearch = async () => {
  try {
    await fetchData({
      searchTerm: toValue(searchTermRef),
      searchParams: toValue(searchParams),
    })
  }
  catch (e) {
    console.error('MeiliSearch Error:', e)
  }
}
```

#### Replacement pattern

```typescript
import { log } from 'evlog/client'

const runPaginatedSearch = async () => {
  try {
    await fetchData({
      searchTerm: toValue(searchTermRef),
      searchParams: toValue(searchParams),
    })
  }
  catch (e) {
    log.error({
      action: 'meilisearch:paginated_search_failed',
      tag: 'useLoadMore',
      error: String(e),
    })
  }
}
```

---

### 10.2 `composables/meili/useMeiliSearch.ts`

| | |
|---|---|
| **Role** | Low-level MeiliSearch index query. |
| **Data flow** | `search()` catches MeiliSearch exceptions and stores them in a reactive `error` ref. |
| **Create / modify** | Modify. |
| **Closest analog** | `packages/nuxt-galaxy/src/runtime/app/composables/useUploadFileToStorage.ts`. |

#### Target excerpt

```typescript
const search = async (query: string, searchParams?: SearchParams) => {
  try {
    const resp = await meilisearch.index(index).search(query, searchParams)
    result.value = resp
    return resp
  }
  catch (e) {
    console.error('MeiliSearch Error:', e)
    result.value = null
    error.value = getErrorMessage(e)
  }
}
```

#### Replacement pattern

```typescript
import { log } from 'evlog/client'

catch (e) {
  log.error({
    action: 'meilisearch:search_failed',
    tag: 'useMeiliSearch',
    index,
    error: getErrorMessage(e),
  })
  result.value = null
  error.value = getErrorMessage(e)
}
```

---

### 10.3 `composables/useMosaicData.ts`

| | |
|---|---|
| **Role** | Mosaic data client; warns about missing params and errors during query execution. |
| **Data flow** | `watchEffect` validates dependencies and runs Mosaic `coordinator.query`. |
| **Create / modify** | Modify. |
| **Closest analog** | `packages/nuxt-galaxy/src/runtime/app/composables/useSupabaseRealtime.ts`. |

#### Target excerpts

Missing-dependency warnings:

```typescript
if (!tableName) {
  console.warn('Table name is not defined.')
  return
}
```

Query errors:

```typescript
catch (error) {
  console.error('Error in prepare phase:', error)
  isError.value = true
}
```

#### Replacement pattern

```typescript
import { log } from 'evlog/client'

if (!tableName) {
  log.warn({ action: 'mosaic:missing_table', tag: 'useMosaicData' })
  return
}

catch (error) {
  log.error({
    action: 'mosaic:prepare_failed',
    tag: 'useMosaicData',
    error: String(error),
  })
  isError.value = true
}
```

---

### 10.4 `composables/plot/table/useHistogramHeader.ts`

| | |
|---|---|
| **Role** | Returns a histogram header VNode; warns when dependencies are missing. |
| **Data flow** | `getHeader` validates `selection` and `coordinator`. |
| **Create / modify** | Modify. |
| **Closest analog** | `packages/nuxt-galaxy/src/runtime/app/composables/useSupabaseRealtime.ts`. |

#### Target excerpt

```typescript
if (!selection || !coordinator) {
  console.warn('Missing required parameters for histogram header:', { table, selection, coordinator })
  return h('div', { class: 'w-full' }, 'No data available')
}
```

#### Replacement pattern

```typescript
import { log } from 'evlog/client'

if (!selection || !coordinator) {
  log.warn({
    action: 'histogram_header:missing_params',
    tag: 'useHistogramHeader',
    hasSelection: !!selection,
    hasCoordinator: !!coordinator,
  })
  return h('div', { class: 'w-full' }, 'No data available')
}
```

---

### 10.5 `composables/plot/table/useCategoryHeader.ts`

| | |
|---|---|
| **Role** | Returns a category header VNode; warns when dependencies are missing. |
| **Data flow** | Same as `useHistogramHeader`. |
| **Create / modify** | Modify. |
| **Closest analog** | `useHistogramHeader` replacement pattern. |

#### Target excerpt

```typescript
if (!selection || !coordinator) {
  console.warn('Missing required parameters for category header:', { table, selection, coordinator })
  return h('div', { class: 'w-full' }, 'No data available')
}
```

#### Replacement pattern

```typescript
log.warn({
  action: 'category_header:missing_params',
  tag: 'useCategoryHeader',
  hasSelection: !!selection,
  hasCoordinator: !!coordinator,
})
```

---

### 10.6 `utils/table/columns/header.ts`

| | |
|---|---|
| **Role** | Header factory used by tables; warns when dependencies are missing. |
| **Data flow** | `getHistogramHeader` / `getCategoryHeader` validate params before rendering VNodes. |
| **Create / modify** | Modify. |
| **Closest analog** | Same replacement pattern as §10.4/§10.5. |

#### Target excerpt

```typescript
if (!selection || !coordinator) {
  console.warn('Missing required parameters for histogram header:', { table, selection, coordinator })
  return h('div', { class: 'w-full' }, 'No data available')
}
```

#### Replacement pattern

```typescript
import { log } from 'evlog/client'

log.warn({
  action: 'table_header:missing_params',
  tag: 'getHistogramHeader',
  hasSelection: !!selection,
  hasCoordinator: !!coordinator,
})
```

---

### 10.7 `components/plot/table/header/Histogram.vue`

| | |
|---|---|
| **Role** | Histogram plot component; warns on unmount. |
| **Data flow** | `onUnmounted` lifecycle hook. |
| **Create / modify** | Modify. |
| **Closest analog** | `packages/nuxt-galaxy/src/runtime/app/composables/useSupabaseRealtime.ts` lifecycle logging. |

#### Target excerpt

```typescript
onUnmounted(() => {
  console.warn('Unmounting histogram plot for variable:', toValue(variable))
})
```

#### Replacement pattern

```typescript
import { log } from 'evlog/client'

onUnmounted(() => {
  log.info({
    action: 'histogram:unmounted',
    tag: 'Histogram',
    variable: toValue(variable),
  })
})
```

---

### 10.8 `components/meili/index/filter/AssistedBuilder.vue`

| | |
|---|---|
| **Role** | Filter-builder UI; warns when a filter cannot be added. |
| **Data flow** | `checkAndAddFilter` validates `validatedFilter`. |
| **Create / modify** | Modify. |
| **Closest analog** | §9 client pattern. |

#### Target excerpt

```typescript
function checkAndAddFilter() {
  const validatedFilterVal = validatedFilter.value
  if (!validatedFilterVal) {
    console.warn('Cannot add filter: filter is not valid', {
      attribute: filterAttribute.value,
      operator: filterOperator.value,
      values: filterValues.value,
    })
    return
  }
  addFilter(validatedFilterVal)
}
```

#### Replacement pattern

```typescript
import { log } from 'evlog/client'

function checkAndAddFilter() {
  const validatedFilterVal = validatedFilter.value
  if (!validatedFilterVal) {
    log.warn({
      action: 'filter_builder:invalid_filter',
      tag: 'AssistedBuilder',
      attribute: filterAttribute.value,
      operator: filterOperator.value,
      values: filterValues.value,
    })
    return
  }
  addFilter(validatedFilterVal)
}
```

---

### 10.9 `components/meili/index/filter/form/SetInput.vue`

| | |
|---|---|
| **Role** | Set-value filter input; warns (and throws) when operator is invalid. |
| **Data flow** | Module-level prop validation. |
| **Create / modify** | Modify. |
| **Closest analog** | §9 client pattern. |

#### Target excerpt

```typescript
if (!setOperators.includes(filterOperator.value)) {
  console.warn(`MeiliFilterInputSet: filterOperator should be 'in' or 'not in', got '${filterOperator.value}'`)
  throw createError(`MeiliFilterInputSet: filterOperator should be 'in', got '${filterOperator.value}'`)
}
```

#### Replacement pattern

```typescript
import { log } from 'evlog/client'

if (!setOperators.includes(filterOperator.value)) {
  log.error({
    action: 'filter_set_input:invalid_operator',
    tag: 'SetInput',
    operator: filterOperator.value,
  })
  throw createError(`MeiliFilterInputSet: filterOperator should be 'in', got '${filterOperator.value}'`)
}
```

---

### 10.10 `components/meili/index/filter/plot/CategoryBuilder.vue`

| | |
|---|---|
| **Role** | Category plot builder; has warnings for sizing, missing facet data, and missing column. |
| **Data flow** | Computed `computedWidth`, `nextFacet`, and `createFilter`. |
| **Create / modify** | Modify. |
| **Closest analog** | §9 client pattern. |

#### Target excerpts

```typescript
console.warn('plotContainerWidthVal', plotContainerWidthVal, ' - widthVal', widthVal)

console.warn('Cannot go to next facet, missing item to filter on or facet attribute')

console.warn('Column is undefined, cannot create filter')
```

#### Replacement pattern

```typescript
import { log } from 'evlog/client'

// in computedWidth
log.debug({
  action: 'category_builder:width_debug',
  tag: 'CategoryBuilder',
  plotContainerWidth: plotContainerWidthVal,
  width: widthVal,
})

// in nextFacet
log.warn({
  action: 'category_builder:next_facet_missing_data',
  tag: 'CategoryBuilder',
})

// in createFilter
log.warn({
  action: 'category_builder:create_filter_missing_column',
  tag: 'CategoryBuilder',
})
```

---

## 11. Raw `console.*` cleanup — `@gaas/wiki` layer

### 11.1 `nuxt.config.ts`

| | |
|---|---|
| **Role** | Nuxt config hook `content:file:afterParse` logs parsed content during build/content processing. |
| **Data flow** | Hook receives `ctx`; logs `ctx.file.id`. |
| **Create / modify** | Modify. |
| **Closest analog** | `packages/nuxt-galaxy/src/module.ts` uses `@nuxt/kit`'s `logger.withTag`. |

#### Target excerpt

```typescript
hooks: {
  'content:file:afterParse': function (ctx: FileAfterParseHook) {
    if (ctx.file.id.startsWith('content/wiki/')) {
      console.log('Parsed content:', ctx.file.id)
      // ...
    }
  },
}
```

#### Replacement pattern

```typescript
import { logger } from '@nuxt/kit'

const log = logger.withTag('@gaas/wiki')

hooks: {
  'content:file:afterParse': function (ctx: FileAfterParseHook) {
    if (ctx.file.id.startsWith('content/wiki/')) {
      log.info(`Parsed content: ${ctx.file.id}`)
      // ...
    }
  },
}
```

### Pattern notes

- This hook runs at build/content-processing time, not in a browser, so it is module lifecycle / build-time diagnostics.
- `AGENTS.md` and `EVLOG-CONVENTIONS.md` agree that module lifecycle / build-time diagnostics should use `@nuxt/kit`'s logger.

---

## 12. Summary of target files

| # | File | Action | Primary analog |
|---|------|--------|----------------|
| 1 | `.planning/LOGGING-SPEC.md` | Create | `EVLOG-CONVENTIONS.md` + `01-SKELETON.md` |
| 2 | `AGENTS.md` | Modify | Existing `AGENTS.md` logging section |
| 3 | `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts` | Modify | Same file + evlog global `log.debug` |
| 4 | `packages/nuxt-galaxy/src/log-options.ts` | Reference | Existing file |
| 5 | `packages/nuxt-galaxy/src/runtime/server/utils/evlog-drain.ts` | Reference | Existing file |
| 6 | `packages/nuxt-galaxy/src/runtime/server/plugins/evlog.server.ts` | Reference | Existing file |
| 7 | `packages/nuxt-galaxy/src/module.ts` | Reference | Existing file |
| 8 | `packages/ui/app/composables/meili/useLoadMore.ts` | Modify | `useUploadFileToStorage.ts` |
| 9 | `packages/ui/app/composables/meili/useMeiliSearch.ts` | Modify | `useUploadFileToStorage.ts` |
| 10 | `packages/ui/app/composables/useMosaicData.ts` | Modify | `useSupabaseRealtime.ts` |
| 11 | `packages/ui/app/composables/plot/table/useHistogramHeader.ts` | Modify | `useSupabaseRealtime.ts` |
| 12 | `packages/ui/app/composables/plot/table/useCategoryHeader.ts` | Modify | `useSupabaseRealtime.ts` |
| 13 | `packages/ui/app/utils/table/columns/header.ts` | Modify | `useSupabaseRealtime.ts` |
| 14 | `packages/ui/app/components/plot/table/header/Histogram.vue` | Modify | `useSupabaseRealtime.ts` |
| 15 | `packages/ui/app/components/meili/index/filter/AssistedBuilder.vue` | Modify | `useUploadFileToStorage.ts` |
| 16 | `packages/ui/app/components/meili/index/filter/form/SetInput.vue` | Modify | `useUploadFileToStorage.ts` |
| 17 | `packages/ui/app/components/meili/index/filter/plot/CategoryBuilder.vue` | Modify | `useUploadFileToStorage.ts` |
| 18 | `packages/wiki/nuxt.config.ts` | Modify | `packages/nuxt-galaxy/src/module.ts` |

---

## PATTERN MAPPING COMPLETE
