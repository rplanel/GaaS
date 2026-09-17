# Phase 6: Audit and Freeze the Sync Contract - Pattern Map

**Mapped:** 2026-08-07
**Files analyzed:** 10
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.planning/phases/06-audit-and-freeze-the-sync-contract/06-SYNC-CONTRACT.md` | doc | transform | `docs/superpowers/specs/2026-07-23-nuxt-galaxy-evlog-logging-design.md` | exact |
| `docs/content/2.concepts/2.sync-contract.md` (tentative mirror path) | doc | transform | `docs/content/2.concepts/1.index.md` | exact |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts` | service | CRUD | itself + `grizzle/sync/analysis.ts` | exact |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/histories.ts` | service | CRUD | itself | exact |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/jobs.ts` | service | CRUD | itself + `grizzle/sync/job.ts` | exact |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/input.ts` | service | CRUD | itself + `grizzle/sync/output.ts` | exact |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/datasets/output.ts` | service | CRUD | itself + `grizzle/sync/output.ts` | exact |
| `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` | service | batch | itself | exact |
| `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts` | utility | transform | itself | exact |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts` | utility | request-response | itself | exact |

## Pattern Assignments

### Sync contract document

**Analog:** `docs/superpowers/specs/2026-07-23-nuxt-galaxy-evlog-logging-design.md`

This existing design spec is the closest match for a technical contract document: it uses frontmatter metadata, a goal/non-goals section, a decision table, code blocks, and an implementation order checklist.

**Header / metadata pattern** (lines 1-5):
```markdown
# nuxt-galaxy structured logging with evlog

**Date:** 2026-07-23  
**Scope:** `packages/nuxt-galaxy`  
**Status:** Design review
```

**Decision table pattern** (lines 24-32):
```markdown
## Design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Auto-wire logging | Yes, inside the module | Consumers get logging out of the box. |
| Effect logs | Bridge to evlog (B2) with safe fallback | Keep `Effect.log*` call sites unchanged... |
```

**Code block with language** (lines 38-64):
````markdown
## Module configuration

```ts
interface LogFileOptions {
  /** Directory for NDJSON log files. Default: `.evlog/logs` */
  dir?: string
  ...
}
```
````

**Implementation order checklist** (lines 296-305):
```markdown
## Implementation order

1. Add `LogOptions` to `ModuleOptions` and resolve defaults in `src/module.ts`.
2. Install `evlog/nuxt` and register the file-drain plugin.
3. Create `src/runtime/server/utils/evlog-effect.ts` with bridge + `runGalaxyEffect`.
```

**Docs content frontmatter pattern** (from `docs/content/2.concepts/1.index.md`, lines 1-3):
```markdown
---
title: "Concepts"
---
```

For the docs mirror, follow the docs content convention: a `title` (and optional `description`) in YAML frontmatter, then `##` section headers and MDC components such as `::warning` if callout blocks are needed.

---

### Inline legacy-sync comment tag

**Analog:** existing phase-style comments in `grizzle/datasets/input.ts` and `grizzle/datasets/output.ts`

**Existing phase comment** (`datasets/input.ts`, line 84):
```typescript
// Phase 2: Write to galaxyMetadata JSONB only
```

**Existing phase comment** (`datasets/output.ts`, line 95):
```typescript
// Phase 2: Write to galaxyMetadata JSONB only
```

**Pattern to copy** for every legacy `synchronize*Effect` definition and remaining call site:
```typescript
// LEGACY-SYNC: remove in Phase 8
export function synchronizeAnalysisEffect(...) { ... }
```

Place the tag on the line immediately before the function definition or import that references the legacy helper.

---

### Effect error handling

**Analog:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts`

**Tagged error class** (lines 86-88):
```typescript
export class DeleteAnalysisError extends Data.TaggedError('DeleteAnalysisError')<{
  readonly message: string
}>() { }
```

**Try/catch with Drizzle** (lines 99-105):
```typescript
return yield* Effect.tryPromise({
  try: () => useDrizzle
    .delete(analyses)
    .where(and(eq(analyses.id, analysisId), eq(analyses.ownerId, ownerId)))
    .returning(),
  catch: error => new DeleteAnalysisError({ message: `Error deleting analysis: ${error}` }),
})
```

**Analog (canonical path):** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` (lines 11-13):
```typescript
export class SyncAnalysisError extends Data.TaggedError('SyncAnalysisError')<{
  readonly message: string
}>() {}
```

Use `Data.TaggedError` with a unique symbol, wrap DB/Galaxy calls in `Effect.tryPromise`, and propagate via `yield* Effect.fail(new SyncAnalysisError({ message: ... }))`.

---

### evlog / Effect logging bridge

**Analog:** `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts`

**Custom logger forwarding to evlog** (lines 99-116):
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

**Run helpers that set AsyncLocalStorage** (lines 127-136):
```typescript
export function runGalaxyEffect<T, E>(event: H3Event, effect: EffectType.Effect<T, E, never>): Promise<T> {
  const requestLog = useLogger(event)
  requestLog.set({ handler: event.path, method: event.method })

  return evlogAsyncStorage.run(requestLog, () => runWithEvlogLogger(effect))
}

export function runTaskEffect<T, E>(taskLog: ReturnType<typeof useLogger>, effect: EffectType.Effect<T, E, never>): Promise<T> {
  return evlogAsyncStorage.run(taskLog, () => runWithEvlogLogger(effect))
}
```

**Key point:** `Effect.logDebug` is routed to the global evlog logger because `useLogger(event)` does not expose a `debug` method (see `LOGGING-SPEC.md`).

---

### Scheduled task pattern

**Analog:** `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts`

**Imports and task definition** (lines 1-15):
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

export default defineTask({
  meta: {
    name: 'galaxy:sync-analyses',
    description: 'Sync pending Galaxy analyses to Supabase',
  },
  run: async ({ payload }) => {
    ...
  },
})
```

**Per-run logger and result emit** (lines 16-24, 91-92):
```typescript
const taskLog = createRequestLogger({
  operation: 'galaxy:sync-analyses',
  requestId: crypto.randomUUID(),
} as Parameters<typeof createRequestLogger>[0])

const result = await runTaskEffect(taskLog, Effect.gen(function* () {
  yield* Effect.logInfo('task started', payload)
  ...
}))

taskLog.emit({ status: result.failed > 0 ? 500 : 200 })
return { result }
```

**Paging loop** (lines 49-78):
```typescript
const PAGE_SIZE = 20
let synced = 0
let failed = 0
let offset = 0
let page

do {
  page = yield* Effect.tryPromise(() =>
    supabase
      .schema('galaxy')
      .from('analyses')
      .select('id, owner_id')
      .or('is_sync.eq.false,state.in.(new,requires_materialization,ready,scheduled,cancelling)')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1),
  )
  ...
  offset += PAGE_SIZE
} while (page.data && page.data.length === PAGE_SIZE)
```

**Top-level catchAll** (lines 82-89):
```typescript
}).pipe(
  Effect.tap(taskResult => Effect.logInfo('task result', taskResult)),
  Effect.catchAll(error =>
    Effect.logError('task error', error).pipe(
      Effect.as({ synced: 0, failed: 1, skipped: 0, error: String(error) }),
    ),
  ),
))
```

---

### Canonical sync path (Supabase-based)

**Analog:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts`

**Effect.gen with lock, annotation, and scope** (lines 91-258):
```typescript
export function syncAnalysisEffect(
  analysisId: number,
  ownerId: string,
  supabase: SupabaseClient<Database>,
  galaxyLayer: Layer.Layer<bt.GalaxyFetch>,
) {
  return Effect.gen(function* () {
    yield* Effect.logDebug('starting analysis')
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

    const { data: analysis, error: analysisError } = yield* Effect.tryPromise({ ... })
    ...
  }).pipe(
    Effect.annotateLogs({ analysisId: String(analysisId) }),
    Effect.scoped,
  )
}
```

**Lock helper** (`grizzle/sync/lock.ts`, lines 9-60):
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
    ...
  })
}
```

**Job upsert** (`grizzle/sync/job.ts`, lines 11-113): query existing, fetch Galaxy job, build payload, `update().eq('id', ...)` if existing else `insert().select('id').single()`.

**Output dataset sync + stream upload** (`grizzle/sync/output.ts`, lines 36-268): query existing output/history, fetch dataset, if terminal-ok call `downloadDatasetStreamEffect`, upload via `uploadStreamToStorage`, update `storage.objects.owner`, then upsert `datasets` + `analysis_outputs`.

---

### Legacy Drizzle sync helper pattern

**Analog:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts` (legacy `synchronizeAnalysisEffect`)

**Legacy orchestration** (lines 219-274):
```typescript
export function synchronizeAnalysisEffect(
  analysisId: number,
  ownerId: string,
  event: H3Event<EventHandlerRequest>,
) {
  return Effect.gen(function* () {
    const invocationDb = yield* getHistoryAnalysis(analysisId, ownerId)

    if (!invocationDb || invocationDb.analyses.isSync) {
      return
    }
    yield* synchronizeHistoryEffect(invocationDb.histories.id, ownerId, event)
    const galaxyInvocationId = invocationDb.analyses.galaxyId
    const invocation = yield* bt.getInvocationEffect(galaxyInvocationId)

    if (!isInvocationTerminalState(invocationDb.analyses.state)) {
      if (isInvocationTerminalState(invocation.state)) {
        const stderr = invocation.state === 'failed'
          ? yield* getAnalysisStderrEffect(analysisId, ownerId)
          : null
        yield* updateAnalysisTerminalState(analysisId, invocation, ownerId, stderr)
      }
      ...
    }
  })
}
```

**History sync** (`grizzle/histories.ts`, lines 24-65):
```typescript
export function synchronizeHistoryEffect(historyId: number, ownerId: string, event: H3Event<EventHandlerRequest>) {
  return Effect.gen(function* () {
    const historyDb = yield* getAnalysisHistory(historyId, ownerId)
    if (historyDb) {
      const isSync = yield* isHistorySyncEffect(historyId, historyDb.histories.id, ownerId)
      if (isSync) {
        return
      }
      const analysisInputsDb = yield* getAllAnalysisInputDatasets(historyDb.analyses.id, ownerId)
      yield* Effect.all(
        analysisInputsDb.map((analysisInput) => {
          return synchronizeInputDatasetEffect(...)
        }),
      )
      yield* synchronizeJobsEffect(...)
      ...
    }
  })
}
```

**Job sync** (`grizzle/jobs.ts`, lines 104-123):
```typescript
export function synchronizeJobEffect(galaxyJobId: string, stepId: number, analysisId: number, historyId: number, galaxyDatasetIds: string[], ownerId: string, event: H3Event<EventHandlerRequest>) {
  return Effect.gen(function* () {
    const jobDb = yield* getOrCreateJobEffect(analysisId, galaxyJobId, stepId, ownerId)
    if (!jobDb) {
      return
    }
    const isSync = yield* isJobSyncEffect(jobDb.id, jobDb.state, galaxyDatasetIds, ownerId)
    if (isSync) {
      return
    }
    yield* synchronizeOutputDatasetsEffect(jobDb.id, galaxyDatasetIds, analysisId, historyId, ownerId, event)
    ...
  })
}
```

---

### Supabase service-role client and storage upload

**Analog:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts`

**Service client creation** (lines 86-109):
```typescript
export function createServiceRoleSupabaseClient() {
  return Effect.gen(function* () {
    const config = useRuntimeConfig()
    const url = (config.public.supabase?.url as string | undefined)
      || process.env.SUPABASE_URL
      || process.env.NUXT_PUBLIC_SUPABASE_URL
    const secretKey = ((config.supabase as any)?.secretKey as string | undefined)
      || process.env.NUXT_SUPABASE_SECRET_KEY
      || process.env.SUPABASE_SERVICE_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY
      || process.env.NUXT_SUPABASE_SERVICE_KEY
      || process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY
    const serviceKey = (config.supabase as any)?.serviceKey as string | undefined
    const serverKey = secretKey || serviceKey
    if (!url || !serverKey) {
      return yield* Effect.fail(new ServerSupabaseClientError({
        message: 'Missing Supabase URL or service role key in runtime config or environment variables',
      }))
    }
    return createClient<Database>(url, serverKey, {
      auth: { detectSessionInUrl: false, persistSession: false, autoRefreshToken: false },
    })
  })
}
```

**Stream upload helper** (lines 111-125):
```typescript
export function uploadStreamToStorage(
  supabase: SupabaseClient<Database>,
  path: string,
  stream: NodeJS.ReadableStream | ReadableStream<Uint8Array>,
) {
  return Effect.gen(function* () {
    const { data, error } = yield* Effect.promise(() =>
      supabase.storage.from('analysis_files').upload(path, stream),
    )
    if (error) {
      return yield* Effect.fail(new UploadFileToStorageError({ message: error.message }))
    }
    return { id: data!.id, path: data!.path }
  })
}
```

---

### Galaxy layer pattern

**Analog:** `packages/nuxt-galaxy/src/runtime/server/utils/galaxy.ts`

**Lazy singleton layer** (lines 6-18):
```typescript
let _galaxyLayer: ReturnType<typeof makeGalaxyLayer> | null = null

/**
 * Returns the GalaxyFetch layer built from runtime config.
 *
 * The layer is created once (lazy singleton) and reused across all requests.
 * This replaces the old `initializeGalaxyClient()` + `runWithConfig()` pattern.
 */
export function useGalaxyLayer(): ReturnType<typeof makeGalaxyLayer> {
  if (!_galaxyLayer) {
    const { public: { galaxy: { url } }, galaxy: { apiKey } } = useRuntimeConfig()
    _galaxyLayer = makeGalaxyLayer({ apiKey, url })
  }
  return _galaxyLayer
}
```

In the scheduled task, call `useGalaxyLayer()` once at task start and pass the layer to child effects, then `Effect.provide(galaxyLayer)` or rely on the caller to provide it.

---

### Schema / RLS policy pattern

**Analog:** `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/syncLocks.ts`

**Table with operational policy note** (lines 7-29):
```typescript
export const syncLocks = galaxy.table(
  'sync_locks',
  {
    id: serial('id').primaryKey(),
    analysisId: integer('analysis_id')
      .notNull()
      .unique()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    lockedAt: timestamp('locked_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  () => [
    // This table is managed by the service-role scheduled task (galaxy:sync-analyses).
    // The permissive policy is intentional: sync locks are an internal operational
    // concern, not user data, and are only touched by server-side service-role code.
    pgPolicy('Authenticated users can manage sync locks', {
      for: 'all',
      to: authenticatedRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
)
```

**Analog:** `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts` (lines 21-66) for table + indexes + user-scoped policies.

---

## Shared Patterns

### Authentication / authorization

**Source:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts`
**Apply to:** canonical sync path and any new server handlers
- HTTP routes use `serverSupabaseClient(event)` + `serverSupabaseUser(event)`.
- Scheduled tasks / background code use `createServiceRoleSupabaseClient()` (env/runtime-config based) and must not use request-scoped Supabase clients.

### Error handling

**Source:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` and `grizzle/analyses.ts`
**Apply to:** all new Effect programs
- Define `Data.TaggedError('Name')<{ readonly message: string }>` for each domain error.
- Wrap external calls (`supabase`, `bt.*Effect`) in `Effect.tryPromise` with a `catch` that returns the tagged error.
- Check `error`/`updateAnalysisError` after Supabase calls and `yield* Effect.fail(...)` with a clear message.
- Top-level scheduled task uses `Effect.catchAll` to log and return a failure-count result instead of throwing.

### Logging

**Source:** `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts` and `LOGGING-SPEC.md`
**Apply to:** all sync paths
- Inside Effect programs use `Effect.logInfo`, `Effect.logDebug`, `Effect.logError`.
- Run programs through `runTaskEffect(taskLog, ...)` or `runGalaxyEffect(event, ...)` so logs reach evlog.
- Annotate logs with `Effect.annotateLogs({ analysisId: String(analysisId) })` near the top of each effect.
- Never log secrets (API keys, service keys, JWTs, dataset contents).

### Validation / state rules

**Source:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts`
**Apply to:** sync state derivation
- Use `terminalOutcomeMap` and `isInvocationTerminalState` from `analysisMonitoring.ts`.
- Derive terminal outcome from Galaxy invocation jobs summary via `deriveInvocationOutcomeFromJobsSummary`.
- Validate state/outcome consistency explicitly (`Effect.die` for programming errors, `Effect.fail` for operational errors).

### Drizzle access pattern

**Source:** `packages/nuxt-galaxy/src/runtime/server/utils/drizzle.ts` and `grizzle/analyses.ts`
**Apply to:** legacy helpers only (Phase 6 comments, Phase 8 removal)
```typescript
const useDrizzle = yield* Drizzle
return yield* Effect.tryPromise({
  try: () => useDrizzle.select().from(analyses).where(...),
  catch: error => new GetAnalysisError({ message: `Error getting analysis: ${error}` }),
})
```

---

## No Analog Found

No files in this phase lack a codebase analog. The Mermaid sequence diagram required by the contract document has no existing example in the docs, but it should be written as a standard fenced `mermaid` code block.

---

## Metadata

**Analog search scope:**
- `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/**/*.ts`
- `packages/nuxt-galaxy/src/runtime/server/tasks/**/*.ts`
- `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/*.ts`
- `packages/nuxt-galaxy/src/module.ts`
- `docs/content/**/*.md`
- `docs/superpowers/specs/*.md`
- `.planning/LOGGING-SPEC.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`

**Files scanned:** 20+
**Pattern extraction date:** 2026-08-07
