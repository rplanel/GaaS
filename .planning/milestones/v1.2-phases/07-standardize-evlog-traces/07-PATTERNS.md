# Phase 07: Standardize evlog Traces - Pattern Map

**Mapped:** 2026-08-07
**Files analyzed:** 7
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts` | utility | transform | itself (unique Effect→evlog bridge) | exact |
| `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` | task | batch | itself + `LOGGING-SPEC.md` scheduled-task snippet | exact |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` | service | CRUD | itself + sibling `job.ts` / `output.ts` | exact |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts` | service | CRUD | `analysis.ts` | role-match |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts` | service | file-I/O | `analysis.ts` | role-match |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts` | service | CRUD | `analysis.ts` | role-match |
| `.planning/LOGGING-SPEC.md` | config | N/A | itself | exact |

## Pattern Assignments

### `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts` (utility, transform)

**Analog:** itself — the existing bridge is the authoritative pattern.

**Imports pattern** (lines 1-6):
```typescript
import type { Effect as EffectType } from 'effect'
import type { H3Event } from 'h3'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Cause, Effect, Logger, LogLevel } from 'effect'
import { log as evlogGlobal, useLogger } from 'evlog'
```

**Bridge core pattern** (lines 99-116):
```typescript
export const evlogEffectLogger = Logger.make((options) => {
  const requestLog = evlogAsyncStorage.getStore()
  const text = formatEffectMessage(options.message)
  const context = buildLogContext({
    cause: options.cause,
    spans: options.spans,
    annotations: options.annotations,
  })

  const level = mapEffectLogLevel(options.logLevel.label)

  if (!requestLog) {
    logToEvlogGlobal(level, text, context)
    return
  }

  logToRequestLog(requestLog, level, text, context)
})
```

**Debug fallback pattern** (lines 80-97):
```typescript
function logToRequestLog(
  requestLog: ReturnType<typeof useLogger>,
  level: 'error' | 'warn' | 'info' | 'debug',
  message: string,
  context: Record<string, unknown>,
): void {
  switch (level) {
    case 'error': requestLog.error(message, context); break
    case 'warn': requestLog.warn(message, context); break
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

**Execution helper pattern** (lines 118-136):
```typescript
function runWithEvlogLogger<T, E>(effect: EffectType.Effect<T, E, never>): Promise<T> {
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(Logger.replace(Logger.defaultLogger, evlogEffectLogger)),
      Effect.provide(Logger.minimumLogLevel(LogLevel.Debug)),
    ),
  )
}

export function runGalaxyEffect<T, E>(event: H3Event, effect: EffectType.Effect<T, E, never>): Promise<T> {
  const requestLog = useLogger(event)
  requestLog.set({ handler: event.path, method: event.method })

  return evlogAsyncStorage.run(requestLog, () => runWithEvlogLogger(effect))
}

export function runTaskEffect<T, E>(taskLog: ReturnType<typeof useLogger>, effect: EffectType.Effect<T, E, never>): Promise<T> {
  return evlogAsyncStorage.run(taskLog, () => runWithEvlogLogger(effect))
}
```

**Copy for:** Keeping the bridge intact; any change must preserve `Logger.replace`, `LogLevel.Debug`, and `AsyncLocalStorage` wiring.

---

### `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` (task, batch)

**Analog:** itself + `LOGGING-SPEC.md` scheduled-task snippet.

**Imports pattern** (lines 1-10):
```typescript
import type * as bt from 'blendtype'
import type { Layer } from 'effect'
import { Effect } from 'effect'
import { createRequestLogger } from 'evlog'
import { defineTask } from 'nitropack/runtime/task'
import { runTaskEffect } from '../../utils/evlog-effect'
import { useGalaxyLayer } from '../../utils/galaxy'
import { createServiceRoleSupabaseClient } from '../../utils/grizzle/supabase'
import { syncAnalysisEffect } from '../../utils/grizzle/sync/analysis'
```

**Task setup + finalizer pattern** (lines 11-21, 91-93):
```typescript
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

    // ... Effect.gen ...

    taskLog.emit({ status: result.failed > 0 ? 500 : 200 })
    return { result }
  },
})
```

**Current ad-hoc logging to replace** (lines 24, 29, 34, 64, 80, 83-88):
```typescript
yield* Effect.logInfo('task started', payload)
yield* Effect.logInfo('syncing single analysis', analysisId)
yield* Effect.logError('analysis not found or error', analysisId, error)
yield* Effect.logDebug('page query', { offset, rows: page.data?.length ?? 0, error: page.error?.message ?? 'none' })
yield* Effect.logInfo('finished', { synced, failed })
Effect.tap(taskResult => Effect.logInfo('task result', taskResult))
Effect.catchAll(error =>
  Effect.logError('task error', error).pipe(
    Effect.as({ synced: 0, failed: 1, skipped: 0, error: String(error) }),
  ),
)
```

**Copy for:** Task scaffold, `runTaskEffect` wrapping, and `taskLog.emit` placement. The new implementation must keep `emit` on every exit path and move the payload out of log context (D-04).

---

### `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` (service, CRUD)

**Analog:** itself — canonical Supabase + Effect sync service.

**Imports pattern** (lines 1-9):
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Layer } from 'effect'
import type { Database } from '../../../../types/database'
import * as bt from 'blendtype'
import { Data, Effect } from 'effect'
import { deriveInvocationOutcomeFromJobsSummary, isInvocationTerminalState, terminalOutcomeMap } from '../analysisMonitoring'
import { syncJobEffect } from './job'
import { acquireSyncLock, releaseSyncLock } from './lock'
import { syncOutputDatasetEffect } from './output'
```

**Tagged error pattern** (lines 11-13):
```typescript
export class SyncAnalysisError extends Data.TaggedError('SyncAnalysisError')<{
  readonly message: string
}> {}
```

**Supabase CRUD inside Effect pattern** (lines 110-126):
```typescript
const { data: analysis, error: analysisError } = yield* Effect.tryPromise({
  try: () =>
    supabase
      .schema('galaxy')
      .from('analyses')
      .select('id, state, galaxy_id, history_id, owner_id')
      .eq('id', analysisId)
      .single(),
  catch: error =>
    new SyncAnalysisError({ message: `Failed to fetch analysis: ${error}` }),
})

if (analysisError || !analysis) {
  return yield* Effect.fail(
    new SyncAnalysisError({ message: `Analysis ${analysisId} not found` }),
  )
}
```

**Lock + finalizer pattern** (lines 98-108):
```typescript
const acquired = yield* acquireSyncLock(supabase, analysisId, 900)
yield* Effect.logDebug('lock acquired', { acquired })
if (!acquired) {
  return
}
yield* Effect.addFinalizer(() =>
  releaseSyncLock(supabase, analysisId).pipe(
    Effect.catchAll(error => Effect.logError('failed to release sync lock', error)),
  ),
)
```

**Log annotation pattern** (lines 255-258):
```typescript
}).pipe(
  Effect.annotateLogs({ analysisId: String(analysisId) }),
  Effect.scoped,
)
```

**Copy for:** Extend `Effect.annotateLogs` to include all six trace IDs (`analysisId`, `ownerId`, `galaxyInvocationId`, `historyId`, `jobId`, `datasetId`) and add boundary `Effect.logInfo` / `Effect.logDebug` / `Effect.logError` calls without logging raw Galaxy objects.

---

### `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts` (service, CRUD)

**Analog:** `analysis.ts` (same Supabase + Effect service pattern).

**Function signature + error pattern** (lines 7-18):
```typescript
export class SyncJobError extends Data.TaggedError('SyncJobError')<{
  readonly message: string
}> {}

export function syncJobEffect(
  galaxyJobId: string,
  stepId: number,
  analysisId: number,
  ownerId: string,
  supabase: SupabaseClient<Database>,
  galaxyLayer: Layer.Layer<bt.GalaxyFetch>,
): Effect.Effect<number, SyncJobError, never> {
```

**Galaxy fetch + mapError pattern** (lines 41-50):
```typescript
const galaxyJob = yield* bt
  .getJobEffect(galaxyJobId)
  .pipe(
    Effect.mapError(error =>
      new SyncJobError({
        message: `Failed to fetch job from Galaxy: ${error instanceof Error ? error.message : String(error)}`,
      }),
    ),
    Effect.provide(galaxyLayer),
  )
```

**Upsert payload pattern** (lines 54-66):
```typescript
const payload = {
  galaxy_id: galaxyJobId,
  analysis_id: analysisId,
  owner_id: ownerId,
  step_id: stepId,
  state: galaxyJob.state,
  tool_id: galaxyJob.tool_id,
  exit_code: galaxyJob.exit_code ?? null,
  stderr: galaxyJob.stderr ?? null,
  stdout: galaxyJob.stdout ?? null,
  created_at: galaxyJob.create_time,
  is_sync: isTerminal,
}
```

**Copy for:** Wrap with `Effect.annotateLogs` (analysisId, ownerId, jobId) and add `Effect.logDebug` at start/end/error boundaries. Do not log `stderr`/`stdout` payloads (D-04).

---

### `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts` (service, file-I/O)

**Analog:** `analysis.ts`.

**Stream logging pattern** (lines 112-132):
```typescript
const runtime = yield* Effect.runtime()
yield* Effect.log('[sync-output] calling downloadDatasetStreamEffect').pipe(
  Effect.annotateLogs({ context: 'sync-output', analysisId, jobId, historyId: historyGalaxyId, datasetId: galaxyDatasetId }),
)
const stream = yield* bt
  .downloadDatasetStreamEffect(historyGalaxyId, galaxyDatasetId)
  .pipe(
    Effect.mapError(error =>
      new SyncOutputError({
        message: `Failed to download dataset stream from Galaxy: ${error instanceof Error ? error.message : String(error)}`,
      }),
    ),
    Effect.provide(galaxyLayer),
  )
yield* Effect.log(`[sync-output] downloadDatasetStreamEffect returned ${stream === null ? 'null' : 'stream'}`).pipe(
  Effect.annotateLogs({ context: 'sync-output', analysisId, jobId, historyId: historyGalaxyId, datasetId: galaxyDatasetId }),
)
```

**Storage upload + owner fixup pattern** (lines 131-157):
```typescript
const path = `${crypto.randomUUID()}/${galaxyDataset.name}`
const loggedStream = logStreamBytes(stream, runtime, historyGalaxyId, galaxyDatasetId)
const uploaded = yield* uploadStreamToStorage(supabase, path, loggedStream).pipe(
  Effect.mapError(error =>
    new SyncOutputError({ message: `Failed to upload stream to storage: ${error.message}` }),
  ),
)
storageObjectId = uploaded.id
storagePath = uploaded.path

const { error: ownerUpdateError } = yield* Effect.tryPromise({
  try: () => updateStorageObjectOwner(supabase, ownerId, uploaded.id),
  catch: error =>
    new SyncOutputError({
      message: `Failed to update storage object owner: ${error instanceof Error ? error.message : String(error)}`,
    }),
})
```

**Copy for:** Replace ad-hoc `Effect.log(...)` with `Effect.logDebug`, switch annotation keys to the six trace IDs (`analysisId`, `ownerId`, `galaxyInvocationId` if known, `historyId`, `jobId`, `datasetId`), and keep `logStreamBytes` as the stream-tracing boundary.

---

### `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts` (service, CRUD)

**Analog:** `analysis.ts`.

**Boolean effect + error pattern** (lines 9-60):
```typescript
export function acquireSyncLock(
  supabase: SupabaseClient<Database>,
  analysisId: number,
  ttlSeconds: number,
): Effect.Effect<boolean, SyncLockError, never> {
  return Effect.gen(function* () {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)

    const { data: existing, error: selectError } = yield* Effect.tryPromise({
      try: () => supabase.schema('galaxy').from('sync_locks').select('expires_at').eq('analysis_id', analysisId).maybeSingle(),
      catch: e => new SyncLockError({ message: `Failed to query sync lock: ${e}` }),
    })

    if (selectError) {
      return yield* Effect.fail(new SyncLockError({ message: `Failed to query sync lock: ${selectError.message}` }))
    }
    // ...
    return true
  })
}
```

**Release pattern** (lines 62-76):
```typescript
export function releaseSyncLock(
  supabase: SupabaseClient<Database>,
  analysisId: number,
): Effect.Effect<void, SyncLockError, never> {
  return Effect.gen(function* () {
    const { error } = yield* Effect.tryPromise({
      try: () => supabase.schema('galaxy').from('sync_locks').delete().eq('analysis_id', analysisId),
      catch: e => new SyncLockError({ message: `Failed to release sync lock: ${e}` }),
    })

    if (error) {
      return yield* Effect.fail(new SyncLockError({ message: `Failed to release sync lock: ${error.message}` }))
    }
  })
}
```

**Copy for:** Add `Effect.logDebug('acquiring sync lock', { analysisId })` and `Effect.logDebug('releasing sync lock', { analysisId })` boundaries; keep returning `false` on contention and never throw on expected lock-exists.

---

### `.planning/LOGGING-SPEC.md` (config)

**Analog:** itself — authoritative logging conventions doc.

**Section layout pattern**:
- Scope / surfaces
- Quick-start API snippets per surface
- Expected wide-event shape
- Per-surface context fields table
- Severity usage table
- Secret-redaction rules
- Effect `logDebug` path
- Changes from `AGENTS.md`

**Wide-event shape pattern** (lines 130-146):
```markdown
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
```

**Secret-redaction pattern** (lines 175-189):
```markdown
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
```

**Copy for:** Add a new top-level section `## Sync trace field allowlist` between `Secret-redaction rules` and `Effect logDebug path`, documenting the allowlist of scalar identifiers, states, counts, durations, and sanitized messages for the Galaxy sync path.

---

## Shared Patterns

### Effect Service Error Pattern
**Source:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` lines 11-13
**Apply to:** `analysis.ts`, `job.ts`, `output.ts`, `lock.ts`
```typescript
export class SyncAnalysisError extends Data.TaggedError('SyncAnalysisError')<{
  readonly message: string
}> {}
```

### Supabase Query Inside Effect
**Source:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` lines 110-126
**Apply to:** `analysis.ts`, `job.ts`, `output.ts`, `lock.ts`
```typescript
const { data: analysis, error: analysisError } = yield* Effect.tryPromise({
  try: () =>
    supabase
      .schema('galaxy')
      .from('analyses')
      .select('id, state, galaxy_id, history_id, owner_id')
      .eq('id', analysisId)
      .single(),
  catch: error =>
    new SyncAnalysisError({ message: `Failed to fetch analysis: ${error}` }),
})

if (analysisError || !analysis) {
  return yield* Effect.fail(
    new SyncAnalysisError({ message: `Analysis ${analysisId} not found` }),
  )
}
```

### Galaxy Effect + mapError + provide Layer
**Source:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` lines 133-144
**Apply to:** `analysis.ts`, `job.ts`, `output.ts`
```typescript
const invocation = yield* bt
  .getInvocationEffect(analysis.galaxy_id)
  .pipe(
    bt.toGalaxyServiceUnavailable,
    Effect.provide(galaxyLayer),
    Effect.mapError(
      error =>
        new SyncAnalysisError({
          message: `Failed to fetch invocation: ${error instanceof Error ? error.message : String(error)}`,
        }),
    ),
  )
```

### Effect Annotated Logs with Scoped Context
**Source:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` lines 255-258
**Apply to:** `analysis.ts`, `job.ts`, `output.ts`
```typescript
}).pipe(
  Effect.annotateLogs({ analysisId: String(analysisId) }),
  Effect.scoped,
)
```

### Task Logger Finalizer
**Source:** `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` lines 16-21, 91-93
**Apply to:** `sync-analyses.ts`
```typescript
const taskLog = createRequestLogger({
  operation: 'galaxy:sync-analyses',
  requestId: crypto.randomUUID(),
} as Parameters<typeof createRequestLogger>[0])

const result = await runTaskEffect(taskLog, Effect.gen(function* () {
  // ...
}))

taskLog.emit({ status: result.failed > 0 ? 500 : 200 })
return { result }
```

### Debug-Level Fallback to Global evlog Logger
**Source:** `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts` lines 80-97
**Apply to:** all Effect programs executed via `runTaskEffect` / `runGalaxyEffect`
```typescript
case 'debug':
  // Request logger has no debug method; preserve severity via global logger.
  logToEvlogGlobal('debug', message, context)
  break
```

---

## No Analog Found

No files in this phase lack a close match; every target file is either the authoritative implementation or has a direct sibling analog in `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/`.

## Metadata

**Analog search scope:**
- `packages/nuxt-galaxy/src/runtime/server/utils/`
- `packages/nuxt-galaxy/src/runtime/server/tasks/`
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/`
- `.planning/LOGGING-SPEC.md`

**Files scanned:** 12
**Pattern extraction date:** 2026-08-07
