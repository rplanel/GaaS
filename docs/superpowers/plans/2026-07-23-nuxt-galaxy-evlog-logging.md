# nuxt-galaxy evlog logging implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `evlog` into `packages/nuxt-galaxy` so the module emits structured, request-correlated logs for Nuxt server routes, Effect programs, scheduled tasks, and client composables.

**Architecture:** The `nuxt-galaxy` module will programmatically install `evlog/nuxt`, add a file-drain Nitro plugin, and provide a small Effect bridge that forwards `Effect.log*` calls to the current evlog request logger (with a global fallback). Existing handlers and tasks are refactored to a `runGalaxyEffect(event, effect)` helper.

**Tech Stack:** Nuxt 4, Nitro, Effect-TS, evlog, Vitest, @nuxt/test-utils.

## Global constraints

- **Never log secrets:** `GALAXY_API_KEY`, Supabase service keys, or user tokens must never be passed to `log.set`.
- **Use `catalog:` dependencies** — do not pin new versions in `package.json`.
- **Server-only DB access:** Drizzle/Supabase server utilities remain under `src/runtime/server/`.
- **Effect bridge fallback:** if the request logger cannot be resolved inside an Effect fiber, logs must fall back to evlog’s global `log`.
- **Tests first:** every task that adds behavior must start with a failing test.
- **Run QA before finishing:** `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## File structure

| File | Responsibility |
|---|---|
| `src/log-options.ts` | Pure function to resolve `LogOptions` defaults. |
| `src/module.ts` | Adds `LogOptions` to `ModuleOptions`, installs `evlog/nuxt`, registers file-drain plugin. |
| `src/runtime/server/utils/evlog-drain.ts` | Helper to register `evlog:drain` → `createFsDrain()`. |
| `src/runtime/server/plugins/evlog.server.ts` | Nitro plugin that calls the drain helper. |
| `src/runtime/server/utils/evlog-effect.ts` | Effect logger bridge + `runGalaxyEffect` + `runTaskEffect`. |
| `src/runtime/server/api/**/*.ts` | Refactored to use `runGalaxyEffect` or `useLogger(event)`. |
| `src/runtime/server/tasks/galaxy/sync-analyses.ts` | Refactored to use `runTaskEffect`. |
| `src/runtime/server/plugins/migrations.server.ts` | Uses `createRequestLogger` instead of `console`. |
| `src/runtime/server/lib/migrate.ts` | Uses `log` from `evlog`. |
| `src/runtime/server/lib/seed.ts` | Uses `log` from `evlog`. |
| `src/runtime/app/composables/**/*.ts` | Replace `console.*` with `log` from `evlog/client`. |
| `test/server/setup.ts` | Mock `useLogger` / `createRequestLogger` / `log` from `evlog`. |
| `test/server/utils/evlog-effect.test.ts` | Unit tests for the Effect bridge. |
| `test/server/utils/evlog-drain.test.ts` | Unit test for drain registration. |
| `test/module/log-options.test.ts` | Unit tests for option resolution. |

## Task 1: Resolve `LogOptions` with defaults

**Files:**
- Create: `src/log-options.ts`
- Modify: `src/module.ts`
- Test: `test/module/log-options.test.ts`

**Interfaces:**
- Consumes: `NuxtOptions['dev']` boolean, user-provided `logs` partial.
- Produces: `ResolvedLogOptions` object with exact defaults documented in the spec.

- [ ] **Step 1: Write the failing test**

```ts
// test/module/log-options.test.ts
import { describe, expect, it } from 'vitest'
import { resolveLogOptions } from '../../src/log-options'

describe('resolveLogOptions', () => {
  it('uses defaults in development', () => {
    const resolved = resolveLogOptions(true, {})
    expect(resolved).toEqual({
      enabled: true,
      service: 'nuxt-galaxy',
      minLevel: 'debug',
      pretty: true,
      console: true,
      file: { dir: '.evlog/logs', maxFiles: 7, pretty: true },
      redact: false,
    })
  })

  it('uses production defaults', () => {
    const resolved = resolveLogOptions(false, {})
    expect(resolved.redact).toBe(true)
    expect(resolved.pretty).toBe(false)
    expect(resolved.file.pretty).toBe(false)
  })

  it('merges custom options', () => {
    const resolved = resolveLogOptions(true, {
      service: 'custom',
      file: { dir: 'logs/galaxy', maxFiles: 14 },
    })
    expect(resolved.service).toBe('custom')
    expect(resolved.file.dir).toBe('logs/galaxy')
    expect(resolved.file.maxFiles).toBe(14)
    expect(resolved.file.pretty).toBe(true)
  })
})
```

Run: `pnpm vitest run test/module/log-options.test.ts`  
Expected: FAIL (`resolveLogOptions` not found).

- [ ] **Step 2: Implement `resolveLogOptions`**

```ts
// src/log-options.ts
export interface LogFileOptions {
  dir?: string
  maxFiles?: number
  pretty?: boolean
}

export interface LogOptions {
  enabled?: boolean
  service?: string
  minLevel?: 'debug' | 'info' | 'warn' | 'error'
  pretty?: boolean
  console?: boolean
  file?: boolean | LogFileOptions
  redact?: boolean
}

export interface ResolvedLogFileOptions {
  dir: string
  maxFiles: number
  pretty: boolean
}

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
  const fileInput = logs.file === false ? false : (logs.file ?? {})
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

Run: `pnpm vitest run test/module/log-options.test.ts`  
Expected: PASS.

- [ ] **Step 3: Integrate into `src/module.ts`**

```ts
// src/module.ts
import { resolveLogOptions, type LogOptions } from './log-options'

export interface ModuleOptions {
  // ... existing fields ...

  /**
   * Logging configuration for the module.
   * Uses evlog under the hood.
   */
  logs?: LogOptions
}

// defaults
logs: {},

// inside setup
const resolvedLogs = resolveLogOptions(nuxt.options.dev, moduleOptions.logs)
```

- [ ] **Step 4: Commit**

```bash
git add src/log-options.ts src/module.ts test/module/log-options.test.ts
git commit -m "feat(nuxt-galaxy): add log options resolution"
```

## Task 2: Install `evlog/nuxt` and register the file-drain plugin

**Files:**
- Modify: `src/module.ts`
- Create: `src/runtime/server/utils/evlog-drain.ts`
- Create: `src/runtime/server/plugins/evlog.server.ts`
- Test: `test/server/utils/evlog-drain.test.ts`

**Interfaces:**
- Consumes: `ResolvedLogOptions.file`.
- Produces: A Nitro plugin that hooks `'evlog:drain'` with `createFsDrain()`.

- [ ] **Step 1: Write the failing drain-registration test**

```ts
// test/server/utils/evlog-drain.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreateFsDrain = vi.hoisted(() => vi.fn(() => vi.fn()))

vi.mock('evlog/fs', () => ({
  createFsDrain: mockCreateFsDrain,
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: vi.fn(() => ({
    galaxy: {
      logs: {
        file: { dir: 'logs/test', maxFiles: 3, pretty: true },
      },
    },
  })),
}))

const { registerEvlogFsDrain } = await import('../../../src/runtime/server/utils/evlog-drain')

describe('registerEvlogFsDrain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers createFsDrain on evlog:drain when file logging is enabled', () => {
    const hook = vi.fn()
    const nitroApp = { hooks: { hook } } as any

    registerEvlogFsDrain(nitroApp)

    expect(hook).toHaveBeenCalledWith('evlog:drain', expect.any(Function))
    expect(mockCreateFsDrain).toHaveBeenCalledWith({ dir: 'logs/test', maxFiles: 3, pretty: true })
  })
})
```

Run: `pnpm vitest run test/server/utils/evlog-drain.test.ts`  
Expected: FAIL (`registerEvlogFsDrain` not defined).

- [ ] **Step 2: Implement drain helper**

```ts
// src/runtime/server/utils/evlog-drain.ts
import { createFsDrain } from 'evlog/fs'
import type { ResolvedLogFileOptions } from '../../../log-options'

export interface EvlogDrainNitroApp {
  hooks: {
    hook: (name: 'evlog:drain', handler: (ctx: any) => void | Promise<void>) => void
  }
}

export function registerEvlogFsDrain(nitroApp: EvlogDrainNitroApp, fileOptions: ResolvedLogFileOptions | false): void {
  if (!fileOptions) return
  nitroApp.hooks.hook('evlog:drain', createFsDrain({
    dir: fileOptions.dir,
    maxFiles: fileOptions.maxFiles,
    pretty: fileOptions.pretty,
  }))
}
```

Run: `pnpm vitest run test/server/utils/evlog-drain.test.ts`  
Expected: PASS.

- [ ] **Step 3: Create the Nitro plugin**

```ts
// src/runtime/server/plugins/evlog.server.ts
import { useRuntimeConfig } from '#imports'
import { defineNitroPlugin } from 'nitropack/runtime'
import { registerEvlogFsDrain } from '../utils/evlog-drain'

export default defineNitroPlugin((nitroApp) => {
  const file = useRuntimeConfig().galaxy?.logs?.file
  registerEvlogFsDrain(nitroApp, file)
})
```

- [ ] **Step 4: Wire everything in `src/module.ts`**

```ts
// src/module.ts
import { installModule, addServerPlugin } from '@nuxt/kit'

// inside setup, after runtime config checks
await installModule('evlog/nuxt', {
  enabled: resolvedLogs.enabled,
  env: { service: resolvedLogs.service },
  minLevel: resolvedLogs.minLevel,
  pretty: resolvedLogs.pretty,
  console: resolvedLogs.console,
  redact: resolvedLogs.redact,
})

const resolver = createResolver(import.meta.url)
addServerPlugin(resolver.resolve('./runtime/server/plugins/evlog.server'))
```

Also store `resolvedLogs` in runtime config so the plugin can read it:

```ts
nuxt.options.runtimeConfig.galaxy = defu(
  runtimeConfig.galaxy || {},
  {
    apiKey: moduleOptions.apiKey,
    email: moduleOptions.email,
    drizzle: { databaseUrl: moduleOptions.databaseUrl },
    logs: resolvedLogs,
  },
)
```

- [ ] **Step 5: Ignore `.evlog/`**

Append to `.gitignore`:

```gitignore
# evlog local log files
.evlog/
```

- [ ] **Step 6: Commit**

```bash
git add src/module.ts src/runtime/server/utils/evlog-drain.ts src/runtime/server/plugins/evlog.server.ts test/server/utils/evlog-drain.test.ts .gitignore
git commit -m "feat(nuxt-galaxy): install evlog and register fs drain"
```

## Task 3: Build the Effect → evlog bridge

**Files:**
- Create: `src/runtime/server/utils/evlog-effect.ts`
- Test: `test/server/utils/evlog-effect.test.ts`
- Modify: `test/server/setup.ts`

**Interfaces:**
- Consumes: `useLogger(event)` (from `#imports` auto-import), `log` from `evlog`.
- Produces: `runGalaxyEffect(event, effect)` and `runTaskEffect(taskLog, effect)`.

- [ ] **Step 1: Update server test setup with evlog mocks**

```ts
// test/server/setup.ts
export function createMockRequestLogger() {
  return {
    set: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    emit: vi.fn(() => null),
    getContext: vi.fn(() => ({})),
  }
}

vi.mock('evlog', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createRequestLogger: vi.fn(() => createMockRequestLogger()),
  useLogger: vi.fn(() => createMockRequestLogger()),
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: vi.fn(() => ({ /* existing config */ })),
  createError: vi.fn((opts) => { /* existing */ }),
  useLogger: vi.fn(() => createMockRequestLogger()),
}))
```

- [ ] **Step 2: Write the failing bridge test**

```ts
// test/server/utils/evlog-effect.test.ts
import { Effect, Logger } from 'effect'
import { useLogger } from 'evlog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evlogEffectLogger, runGalaxyEffect } from '../../../src/runtime/server/utils/evlog-effect'
import { createMockRequestLogger } from '../setup'

const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}

vi.mock('evlog', () => ({
  log: mockLog,
  createRequestLogger: vi.fn(() => createMockRequestLogger()),
}))

describe('evlogEffectLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards Effect info logs to the request logger', () => {
    const requestLog = createMockRequestLogger()

    evlogEffectLogger.log({
      date: new Date(),
      fiberId: {} as any,
      logLevel: { _tag: 'Info', label: 'INFO', syslog: 6 } as any,
      message: ['hello', { x: 1 }],
      cause: null as any,
      context: {} as any,
      spans: [] as any,
      annotations: {} as any,
    })

    // No ALS set → fallback
    expect(mockLog.info).toHaveBeenCalledWith('hello {"x":1}', expect.any(Object))
  })
})

describe('runGalaxyEffect', () => {
  it('runs an effect and attaches the request logger', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    const event = { path: '/api/test', method: 'GET' } as any
    const effect = Effect.succeed(42)

    const result = await runGalaxyEffect(event, effect)
    expect(result).toBe(42)
    expect(requestLog.set).toHaveBeenCalledWith({ handler: '/api/test', method: 'GET' })
  })
})
```

Run: `pnpm vitest run test/server/utils/evlog-effect.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement the bridge**

```ts
// src/runtime/server/utils/evlog-effect.ts
import { AsyncLocalStorage } from 'node:async_hooks'
import type { H3Event } from 'h3'
import { Effect, Logger, LogLevel } from 'effect'
import { log as evlogGlobal, useLogger } from 'evlog'

const evlogAsyncStorage = new AsyncLocalStorage<ReturnType<typeof useLogger>()

function formatEffectMessage(message: unknown): string {
  if (!Array.isArray(message)) return String(message)
  return message.map((part) => {
    if (typeof part === 'string') return part
    try {
      return JSON.stringify(part)
    }
    catch {
      return String(part)
    }
  }).join(' ')
}

function buildLogContext(options: {
  cause?: unknown
  spans?: unknown
  annotations?: unknown
}): Record<string, unknown> {
  const context: Record<string, unknown> = {}
  if (options.spans) context.effectSpans = options.spans
  if (options.annotations) context.effectAnnotations = options.annotations
  if (options.cause) context.effectCause = String(options.cause)
  return context
}

export const evlogEffectLogger = Logger.make((options) => {
  const requestLog = evlogAsyncStorage.getStore()
  const text = formatEffectMessage(options.message)
  const context = buildLogContext({
    cause: options.cause,
    spans: options.spans,
    annotations: options.annotations,
  })

  if (!requestLog) {
    evlogGlobal.info(text, context)
    return
  }

  switch (options.logLevel.label) {
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

export function runTaskEffect<T>(taskLog: ReturnType<typeof useLogger>, effect: Effect.Effect<T, any, any>): Promise<T> {
  return evlogAsyncStorage.run(taskLog, () =>
    Effect.runPromise(
      effect.pipe(
        Effect.provide(Logger.replace(Logger.defaultLogger, evlogEffectLogger)),
      ),
    ),
  )
}
```

Run: `pnpm vitest run test/server/utils/evlog-effect.test.ts`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/runtime/server/utils/evlog-effect.ts test/server/utils/evlog-effect.test.ts test/server/setup.ts
git commit -m "feat(nuxt-galaxy): add Effect to evlog bridge"
```

## Task 4: Refactor Galaxy API handlers

**Files:**
- Modify: `src/runtime/server/api/galaxy/workflows.get.ts`, `instance.get.ts`, `histories.get.ts`, `health.get.ts`, `workflows/[workflowId].get.ts`, `tools/[toolId]/[toolVersion].get.ts`
- Update corresponding tests if they mock handlers directly.

**Interfaces:**
- Consumes: `runGalaxyEffect(event, effect)` from `../../utils/evlog-effect`.

**Pattern:** replace `Effect.runPromise(...)` with `runGalaxyEffect(event, ...)`.

- [ ] **Step 1: Refactor `workflows.get.ts`**

```ts
import { getWorkflowsEffect, toGalaxyServiceUnavailable } from 'blendtype'
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

Run: `pnpm vitest run test/server/api/galaxy/workflows.test.ts`  
Expected: PASS (mock `useLogger` in setup handles it).

- [ ] **Step 2: Apply the same pattern to the remaining Galaxy handlers**

| Handler | Effect expression to wrap |
|---|---|
| `instance.get.ts` | `getVersionEffect.pipe(toGalaxyServiceUnavailable, Effect.provide(useGalaxyLayer()))` |
| `histories.get.ts` | The existing `program` defined in the handler |
| `health.get.ts` | `checkGalaxyHealthEffect().pipe(Effect.provide(Drizzle.Live), Effect.catchAll(...))` |
| `workflows/[workflowId].get.ts` | The existing `program.pipe(...)` expression |
| `tools/[toolId]/[toolVersion].get.ts` | `getToolEffect(...).pipe(...)` |

Each handler must:
1. Import `runGalaxyEffect` from the correct relative path (`../../utils/evlog-effect` for `galaxy/*`, `../../../utils/evlog-effect` for nested routes).
2. Change `async (event) => { ... Effect.runPromise(...) }` to `async (event) => runGalaxyEffect(event, ...)`.
3. Keep all existing validation, body reading, and parameter extraction logic before the effect is run.

- [ ] **Step 3: Run all Galaxy handler tests**

```bash
pnpm vitest run test/server/api/galaxy
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/runtime/server/api/galaxy
pnc test/server/api/galaxy  # if any test changes were needed
git commit -m "feat(nuxt-galaxy): log Galaxy API handlers with evlog"
```

## Task 5: Refactor DB API handlers

**Files:**
- Modify: `src/runtime/server/api/db/analyses.post.ts`, `workflows.post.ts`, `analyses/[analysisId].delete.ts`, `analyses/monitoring.get.ts`, `analyses/monitoring/admin.get.ts`
- Update corresponding tests.

**Interfaces:**
- Consumes: `runGalaxyEffect(event, effect)`.

- [ ] **Step 1: Refactor `analyses/[analysisId].delete.ts`**

```ts
import { toGalaxyServiceUnavailable } from 'blendtype'
import { Effect, Layer } from 'effect'
import { defineEventHandler, getRouterParam } from 'h3'
import { Drizzle } from '../../../utils/drizzle'
import { runGalaxyEffect } from '../../../utils/evlog-effect'
import { useGalaxyLayer } from '../../../utils/galaxy'
import { deleteAnalysis } from '../../../utils/grizzle/analyses'
import { getSupabaseUser, ServerSupabaseClaims, ServerSupabaseClient } from '../../../utils/grizzle/supabase'

export default defineEventHandler(async (event) => {
  const analysisId = getRouterParam(event, 'analysisId')
  if (!analysisId) return undefined

  const program = Effect.gen(function* () {
    const supabaseUser = yield* getSupabaseUser(event)
    if (!supabaseUser?.id) {
      return yield* Effect.fail(new Error('Unauthorized'))
    }
    return yield* deleteAnalysis(
      Number.parseInt(analysisId),
      supabaseUser.id,
      Number.parseInt(analysisId),
    )
  })

  return runGalaxyEffect(
    event,
    program.pipe(
      toGalaxyServiceUnavailable,
      Effect.provide(Layer.mergeAll(Drizzle.Live, ServerSupabaseClient.Live, ServerSupabaseClaims.Live, useGalaxyLayer())),
    ),
  )
})
```

Run: `pnpm vitest run test/server/api/db/analyses-delete.test.ts`  
Expected: PASS.

- [ ] **Step 2: Apply pattern to remaining DB handlers**

| Handler | Wrap the existing `program.pipe(...Effect.runPromise...)` with `runGalaxyEffect(event, ...)` |
|---|---|
| `analyses.post.ts` | Existing `program` in the handler |
| `workflows.post.ts` | Existing `program` in the handler |
| `analyses/monitoring.get.ts` | Existing `program` and `Effect.runPromiseExit` result |
| `analyses/monitoring/admin.get.ts` | Existing `program` and `Effect.runPromiseExit` result |

For handlers using `Effect.runPromiseExit`, `runGalaxyEffect` returns `Promise<T>` and will throw on failure, which preserves the existing error handling if the handler later inspects `Exit`. You may need to adjust the surrounding code so `runGalaxyEffect` is awaited and its result processed the same way `Exit` was.

- [ ] **Step 3: Run DB handler tests**

```bash
pnpm vitest run test/server/api/db
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/runtime/server/api/db
git commit -m "feat(nuxt-galaxy): log DB API handlers with evlog"
```

## Task 6: Refactor `probe.get.ts`

**Files:**
- Modify: `src/runtime/server/api/probe.get.ts`
- Test: `test/server/api/probe.test.ts`

- [ ] **Step 1: Update handler**

```ts
import { defineEventHandler } from 'h3'

export default defineEventHandler(async (event) => {
  const log = useLogger(event)
  log.set({ handler: 'probe' })
  log.info('probe:ok')
  return 'ok'
})
```

- [ ] **Step 2: Update test**

```ts
import { describe, expect, it, vi } from 'vitest'
import handler from '../../../src/runtime/server/api/probe.get'
import { createMockRequestLogger } from '../../setup'

describe('gET /api/probe', () => {
  it('should return "ok"', async () => {
    const log = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(log)
    const event = { path: '/api/probe', method: 'GET' } as any
    const result = await handler(event)
    expect(result).toBe('ok')
    expect(log.info).toHaveBeenCalledWith('probe:ok')
  })
})
```

Run: `pnpm vitest run test/server/api/probe.test.ts`  
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/runtime/server/api/probe.get.ts test/server/api/probe.test.ts
git commit -m "feat(nuxt-galaxy): log probe endpoint"
```

## Task 7: Refactor scheduled task `sync-analyses`

**Files:**
- Modify: `src/runtime/server/tasks/galaxy/sync-analyses.ts`
- Test: `test/server/tasks/galaxy/sync-analyses.test.ts`

- [ ] **Step 1: Update test to assert task logger behavior**

Add to existing tests:

```ts
import { createRequestLogger } from 'evlog'

it('creates a request logger for the task', async () => {
  const { mockClient } = createMockSupabaseForTask({
    pageResults: [{ data: [], error: null }],
  })
  mockCreateServiceRoleSupabaseClient.mockReturnValueOnce(Effect.succeed(mockClient))
  mockUseGalaxyLayer.mockReturnValueOnce(mockGalaxyLayer)

  const task = await loadTask()
  await task.run({ name: 'galaxy:sync-analyses', payload: {}, context: {} })

  expect(createRequestLogger).toHaveBeenCalledWith({ operation: 'galaxy:sync-analyses', requestId: expect.any(String) })
})
```

Run: `pnpm vitest run test/server/tasks/galaxy/sync-analyses.test.ts`  
Expected: FAIL.

- [ ] **Step 2: Refactor task**

```ts
import type * as bt from 'blendtype'
import type { Layer } from 'effect'
import { Effect } from 'effect'
import { createRequestLogger } from 'evlog'
import { defineTask } from 'nitropack/runtime/task'
import { useGalaxyLayer } from '../../utils/galaxy'
import { runTaskEffect } from '../../utils/evlog-effect'
import { createServiceRoleSupabaseClient } from '../../utils/grizzle/supabase'
import { syncAnalysisEffect } from '../../utils/grizzle/sync/analysis'

export default defineTask({
  meta: {
    name: 'galaxy:sync-analyses',
    description: 'Sync pending Galaxy analyses to Supabase',
  },
  run: async ({ payload }) => {
    const taskLog = createRequestLogger({
      operation: 'galaxy:sync-analyses',
      requestId: crypto.randomUUID(),
    })

    const result = await runTaskEffect(taskLog, Effect.gen(function* () {
      // ... existing body with Effect.logInfo calls preserved ...
    }).pipe(
      Effect.tap(taskResult => Effect.logInfo('task result', taskResult)),
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

Remove the old `Logger.withMinimumLogLevel(LogLevel.Debug)` and `Effect.provide(Logger.logFmt)` lines.

Update the test to assert the emitted status:

```ts
expect(taskLog.emit).toHaveBeenCalledWith({ status: 200 })
```

Run: `pnpm vitest run test/server/tasks/galaxy/sync-analyses.test.ts`  
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/runtime/server/tasks/galaxy/sync-analyses.ts test/server/tasks/galaxy/sync-analyses.test.ts
git commit -m "feat(nuxt-galaxy): route sync-analyses task logs through evlog"
```

## Task 8: Replace `console.*` in server plugins and scripts

**Files:**
- Modify: `src/runtime/server/plugins/migrations.server.ts`
- Modify: `src/runtime/server/lib/migrate.ts`
- Modify: `src/runtime/server/lib/seed.ts`
- Optional: `bin/migrate.mjs`, `bin/seed.mjs`

- [ ] **Step 1: Refactor `migrations.server.ts`**

```ts
import { useRuntimeConfig } from '#imports'
import { createRequestLogger } from 'evlog'
import { defineNitroPlugin } from 'nitropack/runtime'
import { runMigrations } from '../lib/migrate'

export default defineNitroPlugin(async () => {
  const { galaxy } = useRuntimeConfig()
  const databaseUrl = galaxy?.drizzle?.databaseUrl

  const log = createRequestLogger({ operation: 'migrations', requestId: crypto.randomUUID() })

  if (!databaseUrl) {
    log.warn('Cannot run migrations — GALAXY_DRIZZLE_DATABASE_URL is not configured')
    log.emit({ status: 'skipped' })
    return
  }

  try {
    log.info('Running database migrations on startup')
    await runMigrations(databaseUrl)
    log.info('Database migrations applied successfully')
    log.emit({ status: 'ok' })
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('Migration failed on startup', { error: message })
    log.emit({ status: 'error' })
  }
})
```

- [ ] **Step 2: Refactor `migrate.ts`**

```ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator'
import { initLogger, log } from 'evlog'
import postgres from 'postgres'

initLogger({ env: { service: 'nuxt-galaxy' } })

export function getMigrationsFolder(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  return resolve(currentDir, '..', 'db', 'migrations')
}

// ... MigrateOptions interface unchanged ...

export async function runMigrations(databaseUrl: string, options?: MigrateOptions): Promise<void> {
  const migrationsFolder = getMigrationsFolder()
  const client = postgres(databaseUrl, { max: 1 })
  const db = drizzle({ client })

  try {
    await drizzleMigrate(db, {
      migrationsFolder,
      ...(options?.migrationsTable && { migrationsTable: options.migrationsTable }),
      ...(options?.migrationsSchema && { migrationsSchema: options.migrationsSchema }),
    })
    log.info('migrations', 'Database migrations applied successfully')
  }
  finally {
    await client.end()
  }
}
```

- [ ] **Step 3: Refactor `seed.ts`**

Add at the top:

```ts
import { initLogger, log } from 'evlog'
initLogger({ env: { service: 'nuxt-galaxy' } })
```

Replace all `console.log` with `log.info('seed', ...)` and `console.warn` with `log.warn('seed', ...)`.

- [ ] **Step 4: Optional — migrate CLI scripts**

If time permits, replace `console.log` / `console.error` in `bin/migrate.mjs` and `bin/seed.mjs` with `log` from `evlog` after calling `initLogger({ env: { service: 'nuxt-galaxy' } })`.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/server/plugins/migrations.server.ts src/runtime/server/lib/migrate.ts src/runtime/server/lib/seed.ts
git commit -m "feat(nuxt-galaxy): replace server console logs with evlog"
```

## Task 9: Add client-side logging

**Files:**
- Modify: `src/runtime/app/composables/useSupabaseRealtime.ts`, `useUploadFileToStorage.ts`, `galaxy/useDatasetTags.ts`, `utils/supabase.ts`
- Update corresponding tests to mock `evlog/client`.

- [ ] **Step 1: Mock `evlog/client` in app tests**

Add to `test/setup.ts`:

```ts
vi.mock('evlog/client', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))
```

- [ ] **Step 2: Update `useSupabaseRealtime.ts`**

```ts
import { log } from 'evlog/client'

function subscribe() {
  if (!channels[channelName]) {
    // ... existing channel setup ...
    log.info('useSupabaseRealtime', 'subscribing', { channelName, tableName })
  }
  // ...
}

function unsubscribe() {
  log.info('useSupabaseRealtime', 'unsubscribing', { channelName })
  // ...
}
```

- [ ] **Step 3: Update `useUploadFileToStorage.ts`**

```ts
import { log } from 'evlog/client'

function uploadFileToStorage(file: File) {
  pending.value = true
  log.info('useUploadFileToStorage', 'starting', { fileName: file.name, fileSize: file.size })

  return Effect.runPromise(...)
    .then((result) => {
      log.info('useUploadFileToStorage', 'success', { fileName: file.name })
      return result
    })
    .catch((error) => {
      log.error('useUploadFileToStorage', 'failed', { fileName: file.name, error: String(error) })
      throw error
    })
    .finally(() => {
      pending.value = false
    })
}
```

- [ ] **Step 4: Update remaining client files**

Apply the same pattern to:

- `src/runtime/app/composables/galaxy/useDatasetTags.ts` — replace `console.warn` with `log.warn`.
- `src/runtime/app/utils/supabase.ts` — replace `console.error` with `log.error`.

- [ ] **Step 5: Run client tests**

```bash
pnpm vitest run test/app
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/runtime/app
git commit -m "feat(nuxt-galaxy): add client-side evlog logging"
```

## Task 10: Global verification

- [ ] **Step 1: Run lint**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Run server tests**

```bash
pnpm vitest run --config vitest.config.server.ts
```

Expected: PASS.

- [ ] **Step 4: Run client tests**

```bash
pnpm vitest run
```

Expected: PASS.

- [ ] **Step 5: Manual dev check**

```bash
pnpm dev
```

Hit `http://localhost:3000/api/probe` and `http://localhost:3000/api/galaxy/workflows`. Verify `.evlog/logs/<date>.jsonl` contains events with `service: 'nuxt-galaxy'`.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(nuxt-galaxy): integrate evlog structured logging"
```

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Auto-wire `evlog/nuxt` | Task 2 |
| Configurable file drain dir | Task 1 + Task 2 |
| Effect logs routed to evlog | Task 3 |
| Request attachment with global fallback | Task 3 |
| Server handlers logged | Tasks 4, 5, 6 |
| Scheduled task logged | Task 7 |
| Server plugins/lib logs migrated | Task 8 |
| Client composables logged | Task 9 |
| QA | Task 10 |

## Placeholder scan

- No `TODO`, `TBD`, or "implement later" items remain.
- Every handler migration references exact source/target files.
- Test commands and expected outputs are specified.
