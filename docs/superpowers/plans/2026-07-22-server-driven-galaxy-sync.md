# Server-Driven Galaxy Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser-driven `/sync` long-poll with a Nitro scheduled task that streams terminal-ok Galaxy output datasets into Supabase Storage, keeps analysis/job/output metadata in sync, and pushes updates to the UI via Supabase Realtime.

**Architecture:** A Nitro scheduled task `galaxy:sync-analyses` runs every 30 s. It queries analyses where `is_sync = false` or `state` is non-terminal, acquires a row-level lock in `sync_locks` per analysis, fetches fresh invocation metadata from Galaxy, and updates the database. Terminal-ok datasets are streamed from Galaxy's `/display` endpoint directly into Supabase Storage. The UI removes all `$fetch('/sync')` calls and refreshes from Realtime events.

**Tech Stack:** Nuxt 4.4.8 (Nitro tasks), `@nuxtjs/supabase` service role client, `blendtype` Galaxy API client, Effect-TS, Drizzle ORM, Supabase Realtime, Vitest.

## Global Constraints

- Nuxt version is `^4.3.0` / installed `4.4.8`; Nitro tasks enabled via `nitro.experimental.tasks = true`.
- All database changes use `drizzle-kit generate` and Supabase migrations; never edit `supabase/migrations/` or `src/runtime/server/db/migrations/` manually.
- Server-side background code must use the Supabase service role key; never use `serverSupabaseClient(event)` outside an HTTP request.
- Cross-package import direction: `wiki → ui → nuxt-galaxy → blendtype`.
- Effect-TS is required for server-side abstractions; keep using `Effect.gen`, `Data.TaggedError`, and `Layer`.
- **TDD is mandatory:** every task starts with a failing test, then minimal implementation, then refactor.
- Tests must pass before each commit; run `pnpm --filter ./packages/<name> test` for affected packages.

## File Map

| File | Responsibility |
|---|---|
| `packages/blendtype/src/histories.ts` | Add `downloadDatasetStreamEffect` for streaming Galaxy dataset downloads. |
| `packages/blendtype/test/histories.test.ts` | Tests for streaming effect. |
| `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/syncLocks.ts` | New `sync_locks` table for distributed row locks. |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts` | Add `createServiceRoleSupabaseClient()` and `uploadStreamToStorage()` helpers. |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts` | Lock acquisition/release helpers. |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` | Per-analysis sync orchestrator (no `event`, streaming downloads). |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts` | Job sync helper using fresh invocation steps. |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts` | Output dataset metadata sync + streaming upload for terminal-ok datasets. |
| `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` | Nitro scheduled task entry point. |
| `packages/nuxt-galaxy/src/module.ts` | Enable tasks, register schedule, remove `/sync` route. |
| `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/histories.ts` | Fix `isHistoryTerminalState` enum bug. |
| `packages/nuxt-galaxy/src/runtime/app/composables/useSupabaseRealtime.ts` | Fix channel lifecycle counter. |
| `packages/ui/app/pages/analyses.vue` | Remove `$fetch('/sync')`. |
| `packages/ui/app/pages/workflows/[workflowId]/analyses.vue` | Remove `$fetch('/sync')`. |
| `packages/nuxt-galaxy/src/runtime/server/routes/sync.ts` | Delete file. |

## Task 1: blendtype streaming download effect

**Files:**
- Create: none
- Modify: `packages/blendtype/src/histories.ts`
- Test: `packages/blendtype/test/histories.test.ts`

**Interfaces:**
- Consumes: `GalaxyFetch`, `getDatasetEffect`, `HistoryError`.
- Produces: `downloadDatasetStreamEffect(historyId, datasetId): Effect.Effect<ReadableStream<Uint8Array> | NodeJS.ReadableStream | null, HistoryError, GalaxyFetch>`.

- [ ] **Step 1: Write failing tests**

```ts
import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { downloadDatasetStreamEffect } from '../src/histories'
import { createMockGalaxyLayer } from './fixtures'

describe('downloadDatasetStreamEffect', () => {
  it('returns null for zero-byte dataset', async () => {
    const layer = createMockGalaxyLayer({
      'api/histories/hid/contents/did/display': null,
      'api/histories/hid/contents/did': { file_size: 0, id: 'did', state: 'ok' },
    })
    const result = await downloadDatasetStreamEffect('hid', 'did').pipe(
      Effect.provide(layer),
      Effect.runPromise,
    )
    expect(result).toBeNull()
  })

  it('returns a stream for non-empty dataset', async () => {
    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1, 2, 3])); c.close() } })
    const layer = createMockGalaxyLayer({
      'api/histories/hid/contents/did': { file_size: 3, id: 'did', state: 'ok' },
      'api/histories/hid/contents/did/display': stream,
    })
    const result = await downloadDatasetStreamEffect('hid', 'did').pipe(
      Effect.provide(layer),
      Effect.runPromise,
    )
    expect(result).toBe(stream)
  })
})
```

- [ ] **Step 2: Verify tests fail**

```bash
pnpm --filter ./packages/blendtype vitest run test/histories.test.ts
```

Expected: `downloadDatasetStreamEffect` not found.

- [ ] **Step 3: Implement minimal streaming effect**

```ts
export function downloadDatasetStreamEffect(historyId: string, datasetId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const datasetDescription = yield* getDatasetEffect(datasetId, historyId)
    if (datasetDescription.file_size === 0) {
      return null
    }
    const stream = yield* Effect.tryPromise({
      try: () =>
        fetchApi<ReadableStream<Uint8Array> | NodeJS.ReadableStream>(
          `api/histories/${historyId}/contents/${datasetId}/display`,
          { method: 'GET', responseType: 'stream' },
        ),
      catch: caughtError =>
        new HistoryError({
          message: formatErrorMessage('dataset', datasetId, 'Error downloading stream', caughtError),
          historyId,
          statusCode: extractStatusCode(caughtError),
          cause: caughtError,
        }),
    })
    return stream
  }).pipe(withRetry)
}
```

- [ ] **Step 4: Verify tests pass**

```bash
pnpm --filter ./packages/blendtype vitest run test/histories.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/blendtype/src/histories.ts packages/blendtype/test/histories.test.ts
git commit -m "feat(blendtype): add downloadDatasetStreamEffect"
```

## Task 2: task-safe Supabase service client & stream upload helper

**Files:**
- Modify: `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts`
- Test: `packages/nuxt-galaxy/test/server/utils/grizzle/supabase.test.ts`

**Interfaces:**
- Consumes: `useRuntimeConfig`, `@supabase/supabase-js` `createClient`.
- Produces: `createServiceRoleSupabaseClient()` and `uploadStreamToStorage(supabase, path, stream)`.

- [ ] **Step 1: Write failing tests**

```ts
describe('createServiceRoleSupabaseClient', () => {
  it('creates a client from runtime config', async () => {
    const client = await Effect.runPromise(createServiceRoleSupabaseClient())
    expect(client).toBeDefined()
  })

  it('fails when service key is missing', async () => {
    const { useRuntimeConfig } = await import('#imports')
    vi.mocked(useRuntimeConfig).mockReturnValueOnce({
      public: { supabase: { url: 'http://localhost:54321' } },
      supabase: {},
    } as any)
    const exit = await Effect.runPromiseExit(createServiceRoleSupabaseClient())
    expect(exit._tag).toBe('Failure')
  })
})

describe('uploadStreamToStorage', () => {
  it('uploads a stream to analysis_files bucket', async () => {
    const supabase = {
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(() => Promise.resolve({ data: { id: 'oid', path: 'path' }, error: null })),
        })),
      },
    } as any
    const stream = new ReadableStream()
    const result = await Effect.runPromise(uploadStreamToStorage(supabase, 'folder/file.txt', stream))
    expect(result).toEqual({ id: 'oid', path: 'path' })
  })
})
```

- [ ] **Step 2: Verify tests fail**

```bash
pnpm --filter ./packages/nuxt-galaxy vitest run test/server/utils/grizzle/supabase.test.ts
```

- [ ] **Step 3: Implement helpers**

```ts
export function createServiceRoleSupabaseClient() {
  return Effect.gen(function* () {
    const config = useRuntimeConfig()
    const url = config.public.supabase?.url as string | undefined
    const secretKey = (config.supabase as any)?.secretKey as string | undefined
    const serviceKey = (config.supabase as any)?.serviceKey as string | undefined
    const serverKey = secretKey || serviceKey
    if (!url || !serverKey) {
      return yield* Effect.fail(new ServerSupabaseClientError({
        message: 'Missing Supabase URL or service role key in runtime config',
      }))
    }
    return createClient<Database>(url, serverKey, {
      auth: { detectSessionInUrl: false, persistSession: false, autoRefreshToken: false },
    })
  })
}

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

Refactor existing `uploadFileToStorage` to delegate to `uploadStreamToStorage`.

- [ ] **Step 4: Verify tests pass**

```bash
pnpm --filter ./packages/nuxt-galaxy vitest run test/server/utils/grizzle/supabase.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts
git add packages/nuxt-galaxy/test/server/utils/grizzle/supabase.test.ts
git commit -m "feat(nuxt-galaxy): add service-role client and stream upload helper"
```

## Task 3: sync_locks schema & migration

**Files:**
- Create: `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/syncLocks.ts`
- Modify: `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/index.ts`
- Migration: generated via `pnpm drizzle:generate`

**Interfaces:**
- Produces: `syncLocks` Drizzle schema; `galaxy.sync_locks` table.

- [ ] **Step 1: Write schema file**

```ts
import { integer, pgPolicy, serial, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { authenticatedRole } from 'drizzle-orm/supabase'
import { galaxy } from '../galaxy'
import { analyses } from './analyses'

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
  table => [
    pgPolicy('Authenticated users can manage sync locks', {
      for: 'all',
      to: authenticatedRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
)
```

- [ ] **Step 2: Export from index**

```ts
export { syncLocks } from './syncLocks'
```

- [ ] **Step 3: Generate migration**

```bash
cd packages/nuxt-galaxy
pnpm drizzle:generate
```

- [ ] **Step 4: Regenerate types**

```bash
pnpm supabase:generate:types
```

- [ ] **Step 5: Commit**

```bash
git add packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/syncLocks.ts
git add packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/index.ts
git add packages/nuxt-galaxy/supabase/migrations/
git add packages/nuxt-galaxy/src/runtime/server/db/migrations/
git add packages/nuxt-galaxy/src/runtime/types/database.ts
git commit -m "feat(nuxt-galaxy): add sync_locks table"
```

## Task 4: sync lock helpers

**Files:**
- Create: `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts`
- Test: `packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts`

**Interfaces:**
- Produces: `acquireSyncLock(supabase, analysisId, ttlSeconds): Effect.Effect<boolean, SyncLockError, never>` and `releaseSyncLock(supabase, analysisId): Effect.Effect<void, SyncLockError, never>`.

- [ ] **Step 1: Write failing tests**

```ts
describe('acquireSyncLock', () => {
  it('returns true when no lock exists', async () => {
    const supabase = createMockSupabase({ upsertResult: { data: [{}], error: null } })
    const result = await Effect.runPromise(acquireSyncLock(supabase, 1, 300))
    expect(result).toBe(true)
  })

  it('returns false when a non-expired lock exists', async () => {
    const supabase = createMockSupabase({
      upsertResult: { data: null, error: { message: 'conflict' } },
      selectResult: { data: { expires_at: new Date(Date.now() + 60000).toISOString() }, error: null },
    })
    const result = await Effect.runPromise(acquireSyncLock(supabase, 1, 300))
    expect(result).toBe(false)
  })
})

describe('releaseSyncLock', () => {
  it('deletes the lock row', async () => {
    const supabase = createMockSupabase({ deleteResult: { error: null } })
    await Effect.runPromise(releaseSyncLock(supabase, 1))
    expect(supabase.schema().from().delete).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Verify tests fail**

- [ ] **Step 3: Implement helpers using Supabase upsert**

```ts
export function acquireSyncLock(supabase, analysisId, ttlSeconds) {
  return Effect.gen(function* () {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)
    const { error } = yield* Effect.tryPromise(() =>
      supabase.schema('galaxy').from('sync_locks').upsert(
        { analysis_id: analysisId, locked_at: now.toISOString(), expires_at: expiresAt.toISOString() },
        { onConflict: 'analysis_id' },
      ),
    )
    if (error) {
      const { data: existing } = yield* Effect.tryPromise(() =>
        supabase.schema('galaxy').from('sync_locks').select('expires_at').eq('analysis_id', analysisId).single(),
      )
      if (existing && new Date(existing.expires_at) > now) {
        return false
      }
      return yield* Effect.fail(new SyncLockError({ message: `Lock conflict for analysis ${analysisId}` }))
    }
    return true
  })
}

export function releaseSyncLock(supabase, analysisId) {
  return Effect.gen(function* () {
    yield* Effect.tryPromise(() =>
      supabase.schema('galaxy').from('sync_locks').delete().eq('analysis_id', analysisId),
    )
  })
}
```

- [ ] **Step 4: Verify tests pass**

- [ ] **Step 5: Commit**

```bash
git add packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts
git add packages/nuxt-galaxy/test/server/utils/grizzle/sync/lock.test.ts
git commit -m "feat(nuxt-galaxy): add sync lock helpers"
```

## Task 5: sync job helper

**Files:**
- Create: `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/job.ts`
- Test: `packages/nuxt-galaxy/test/server/utils/grizzle/sync/job.test.ts`

**Interfaces:**
- Produces: `syncJobEffect(galaxyJobId, stepId, analysisId, ownerId, supabase, galaxyLayer): Effect.Effect<number, SyncJobError, never>` returning the job DB id.

- [ ] **Step 1: Write failing tests**

```ts
describe('syncJobEffect', () => {
  it('inserts a new job', async () => {
    const supabase = createMockSupabase({ singleResult: null, insertResult: { data: { id: 42 }, error: null } })
    const result = await Effect.runPromise(syncJobEffect('gjid', 1, 1, 'owner', supabase, layer))
    expect(result).toBe(42)
  })

  it('updates an existing job and returns its id', async () => {
    const supabase = createMockSupabase({ singleResult: { id: 7, state: 'running' }, updateResult: { error: null } })
    const result = await Effect.runPromise(syncJobEffect('gjid', 1, 1, 'owner', supabase, layer))
    expect(result).toBe(7)
  })
})
```

- [ ] **Step 2: Implement**

```ts
export function syncJobEffect(galaxyJobId, stepId, analysisId, ownerId, supabase, galaxyLayer) {
  return Effect.gen(function* () {
    const existing = yield* Effect.tryPromise(() =>
      supabase.schema('galaxy').from('jobs').select('id').eq('galaxy_id', galaxyJobId).eq('analysis_id', analysisId).maybeSingle(),
    )
    const galaxyJob = yield* bt.getJobEffect(galaxyJobId).pipe(bt.toGalaxyServiceUnavailable, Effect.provide(galaxyLayer))
    const isTerminal = bt.JobTerminalStates.includes(galaxyJob.state as any)
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
    if (existing.data) {
      yield* Effect.tryPromise(() =>
        supabase.schema('galaxy').from('jobs').update(payload).eq('id', existing.data.id),
      )
      return existing.data.id
    }
    const { data, error } = yield* Effect.tryPromise(() =>
      supabase.schema('galaxy').from('jobs').insert(payload).select('id').single(),
    )
    if (error)
      return yield* Effect.fail(new SyncJobError({ message: `Insert failed: ${error}` }))
    return data!.id
  })
}
```

- [ ] **Step 3: Commit**

## Task 6: sync output dataset helper (with streaming)

**Files:**
- Create: `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts`
- Test: `packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts`

**Interfaces:**
- Produces: `syncOutputDatasetEffect(galaxyDatasetId, analysisId, historyId, jobId, ownerId, supabase, galaxyLayer): Effect.Effect<void, SyncOutputError, never>`.

- [ ] **Step 1: Write failing tests**

```ts
describe('syncOutputDatasetEffect', () => {
  it('inserts output metadata without download for non-terminal dataset', async () => {
    const result = await Effect.runPromise(syncOutputDatasetEffect('gdid', 1, 1, 42, 'owner', supabase, layer))
    expect(mockStorageUpload).not.toHaveBeenCalled()
  })

  it('streams terminal-ok dataset to storage', async () => {
    const result = await Effect.runPromise(syncOutputDatasetEffect('gdid', 1, 1, 42, 'owner', supabase, layer))
    expect(mockStorageUpload).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Implement**

```ts
export function syncOutputDatasetEffect(galaxyDatasetId, analysisId, historyId, jobId, ownerId, supabase, galaxyLayer) {
  return Effect.gen(function* () {
    const existing = yield* Effect.tryPromise(() =>
      supabase.schema('galaxy').from('analysis_outputs').select('id, dataset_id, state').eq('analysis_id', analysisId).eq('job_id', jobId).eq('datasets.galaxy_id', galaxyDatasetId).maybeSingle(),
    )

    const history = yield* Effect.tryPromise(() =>
      supabase.schema('galaxy').from('histories').select('galaxy_id').eq('id', historyId).single(),
    )
    const historyGalaxyId = history.data!.galaxy_id

    const galaxyDataset = yield* bt.getDatasetEffect(galaxyDatasetId, historyGalaxyId).pipe(
      bt.toGalaxyServiceUnavailable,
      Effect.provide(galaxyLayer),
    )

    const isTerminalOk = bt.DatasetsTerminalStates.includes(galaxyDataset.state as any) && galaxyDataset.state === 'ok'

    let storageObjectId: string | null = null
    let storagePath: string | null = null

    if (isTerminalOk) {
      const stream = yield* bt.downloadDatasetStreamEffect(historyGalaxyId, galaxyDatasetId).pipe(
        bt.toGalaxyServiceUnavailable,
        Effect.provide(galaxyLayer),
      )
      if (stream) {
        const path = `${crypto.randomUUID()}/${galaxyDataset.name}`
        const uploaded = yield* uploadStreamToStorage(supabase, path, stream)
        storageObjectId = uploaded.id
        storagePath = uploaded.path
      }
    }

    if (existing.data) {
      const updates: any = { state: galaxyDataset.state }
      if (storageObjectId)
        updates.storage_object_id = storageObjectId
      if (storagePath)
        updates.storage_path = storagePath
      yield* Effect.tryPromise(() =>
        supabase.schema('galaxy').from('datasets').update(updates).eq('id', existing.data.dataset_id),
      )
      yield* Effect.tryPromise(() =>
        supabase.schema('galaxy').from('analysis_outputs').update({ state: galaxyDataset.state }).eq('id', existing.data.id),
      )
      return
    }

    const { data: datasetRow, error: datasetError } = yield* Effect.tryPromise(() =>
      supabase.schema('galaxy').from('datasets').insert({
        owner_id: ownerId,
        history_id: historyId,
        storage_object_id: storageObjectId,
        storage_path: storagePath,
        uuid: galaxyDataset.uuid,
        galaxy_id: galaxyDatasetId,
        dataset_name: galaxyDataset.name,
        galaxy_metadata: {
          extension: galaxyDataset.extension,
          data_lines: galaxyDataset.metadata_data_lines || 0,
          misc_blurb: galaxyDataset.misc_blurb || undefined,
          peek: galaxyDataset.peek || undefined,
        },
      }).select('id').single(),
    )
    if (datasetError)
      return yield* Effect.fail(new SyncOutputError({ message: `Insert dataset failed: ${datasetError}` }))

    yield* Effect.tryPromise(() =>
      supabase.schema('galaxy').from('analysis_outputs').insert({
        analysis_id: analysisId,
        dataset_id: datasetRow!.id,
        job_id: jobId,
        state: galaxyDataset.state,
      }),
    )
  })
}
```

- [ ] **Step 3: Commit**

## Task 7: per-analysis sync orchestrator

**Files:**
- Create: `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts`
- Test: `packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts`

**Interfaces:**
- Produces: `syncAnalysisEffect(analysisId, ownerId, supabase, galaxyLayer): Effect.Effect<void, SyncAnalysisError, never>`.

- [ ] **Step 1: Write failing tests**

```ts
describe('syncAnalysisEffect', () => {
  it('skips when lock cannot be acquired', async () => {
    const result = await Effect.runPromise(syncAnalysisEffect(1, 'owner', supabase, layer))
    expect(acquireSyncLock).toHaveBeenCalledWith(supabase, 1, 900)
  })

  it('updates analysis state from Galaxy invocation', async () => {
    // mocks + assertions
  })
})
```

- [ ] **Step 2: Implement**

```ts
export function syncAnalysisEffect(analysisId, ownerId, supabase, galaxyLayer) {
  return Effect.gen(function* () {
    const acquired = yield* acquireSyncLock(supabase, analysisId, 900)
    if (!acquired)
      return
    yield* Effect.addFinalizer(() => releaseSyncLock(supabase, analysisId))

    const analysis = yield* Effect.tryPromise(() =>
      supabase.schema('galaxy').from('analyses').select('id, state, galaxy_id, history_id, owner_id').eq('id', analysisId).single(),
    )
    if (analysis.error || !analysis.data) {
      return yield* Effect.fail(new SyncAnalysisError({ message: `Analysis ${analysisId} not found` }))
    }
    if (analysis.data.owner_id !== ownerId) {
      return yield* Effect.fail(new SyncAnalysisError({ message: `Ownership mismatch` }))
    }

    const invocation = yield* bt.getInvocationEffect(analysis.data.galaxy_id).pipe(
      bt.toGalaxyServiceUnavailable,
      Effect.provide(galaxyLayer),
    )

    const isTerminal = bt.InvocationTerminalStates.includes(invocation.state as any)
    const stderr = isTerminal && invocation.state === 'failed'
      ? yield* getAnalysisStderr(analysisId, ownerId, supabase)
      : null

    yield* Effect.tryPromise(() =>
      supabase.schema('galaxy').from('analyses').update({
        state: invocation.state,
        invocation: invocation as any,
        is_sync: isTerminal,
        stderr,
      }).eq('id', analysisId),
    )

    if (isTerminal) {
      yield* updateAnalysisMonitoringOutcome(supabase, analysis.data.galaxy_id, ownerId, invocation.state, stderr)
    }

    for (const step of invocation.steps || []) {
      if (step.job_id) {
        const jobDbId = yield* syncJobEffect(step.job_id, step.order_index, analysisId, ownerId, supabase, galaxyLayer)
        const outputs = Object.values(invocation.outputs || {}).filter(o => o.workflow_step_id === step.workflow_step_id)
        for (const output of outputs) {
          yield* syncOutputDatasetEffect(output.id, analysisId, analysis.data.history_id, jobDbId, ownerId, supabase, galaxyLayer)
        }
      }
    }

    yield* Effect.tryPromise(() =>
      supabase.schema('galaxy').from('histories').update({
        state: isTerminal ? 'ok' : 'running',
        is_sync: isTerminal,
      }).eq('id', analysis.data.history_id),
    )
  }).pipe(Effect.catchAll(error => Effect.sync(() => console.error(`syncAnalysisEffect ${analysisId} failed:`, error))))
}
```

- [ ] **Step 3: Commit**

## Task 8: Nitro scheduled task

**Files:**
- Create: `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts`
- Test: `packages/nuxt-galaxy/test/server/tasks/galaxy/sync-analyses.test.ts`

**Interfaces:**
- Produces: Nitro task `galaxy:sync-analyses`.

- [ ] **Step 1: Write failing tests**

```ts
describe('galaxy:sync-analyses task', () => {
  it('has correct meta', () => {
    expect(task.meta.name).toBe('galaxy:sync-analyses')
  })

  it('processes a requested analysisId', async () => {
    const result = await task.run({ name: 'galaxy:sync-analyses', payload: { analysisId: 1 }, context: {} })
    expect(result.result.synced).toBe(1)
  })
})
```

- [ ] **Step 2: Implement**

```ts
export default defineTask({
  meta: {
    name: 'galaxy:sync-analyses',
    description: 'Sync pending Galaxy analyses to Supabase',
  },
  run: async ({ payload }) => {
    const result = await Effect.gen(function* () {
      const supabase = yield* createServiceRoleSupabaseClient()
      const galaxyLayer = useGalaxyLayer()

      if (payload?.analysisId) {
        const { data, error } = yield* Effect.tryPromise(() =>
          supabase.schema('galaxy').from('analyses').select('id, owner_id').eq('id', payload.analysisId).single(),
        )
        if (error || !data)
          return { synced: 0, failed: 1, skipped: 0 }
        yield* syncAnalysisEffect(data.id, data.owner_id, supabase, galaxyLayer)
        return { synced: 1, failed: 0, skipped: 0 }
      }

      const PAGE_SIZE = 20
      let synced = 0; let failed = 0; let offset = 0
      let page
      do {
        page = yield* Effect.tryPromise(() =>
          supabase.schema('galaxy').from('analyses').select('id, owner_id').or('is_sync.is.false,state.in.(new,requires_materialization,ready,scheduled,cancelling)').range(offset, offset + PAGE_SIZE - 1),
        )
        if (page.error)
          return yield* Effect.fail(new Error(page.error.message))
        for (const row of page.data || []) {
          const outcome = yield* syncAnalysisEffect(row.id, row.owner_id, supabase, galaxyLayer).pipe(
            Effect.match({ onFailure: () => 'failed', onSuccess: () => 'synced' }),
          )
          outcome === 'synced' ? synced++ : failed++
        }
        offset += PAGE_SIZE
      } while (page.data && page.data.length === PAGE_SIZE)

      return { synced, failed, skipped: 0 }
    }).pipe(
      Effect.catchAll(error => Effect.succeed({ synced: 0, failed: 1, skipped: 0, error: String(error) })),
      Effect.runPromise,
    )
    return { result }
  },
})
```

- [ ] **Step 3: Commit**

## Task 9: module registration & removal of `/sync`

**Files:**
- Modify: `packages/nuxt-galaxy/src/module.ts`
- Test: `packages/nuxt-galaxy/test/module/tasks.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe('module task registration', () => {
  it('enables nitro experimental tasks', async () => {
    const nitro = await loadModuleConfig()
    expect(nitro.experimental?.tasks).toBe(true)
  })

  it('registers scheduled task every 30 seconds', async () => {
    const nitro = await loadModuleConfig()
    expect(nitro.scheduledTasks).toHaveProperty('*/30 * * * * *')
  })

  it('does not register legacy /sync route', async () => {
    const nitro = await loadModuleConfig()
    expect(nitro.handlers?.some((h: any) => h.route === '/sync')).toBeFalsy()
  })
})
```

- [ ] **Step 2: Update module.ts**

```ts
nuxt.options.nitro = defu(nuxt.options.nitro || {}, {
  experimental: { tasks: true },
  scheduledTasks: { '*/30 * * * * *': ['galaxy:sync-analyses'] },
  tasks: {
    'galaxy:sync-analyses': {
      handler: resolver.resolve('./runtime/server/tasks/galaxy/sync-analyses.ts'),
      description: 'Sync pending Galaxy analyses to Supabase',
    },
  },
})
```

Remove the `addServerHandler({ route: '/sync', ... })` block.

- [ ] **Step 3: Commit**

## Task 10: fix Realtime channel lifecycle

**Files:**
- Modify: `packages/nuxt-galaxy/src/runtime/app/composables/useSupabaseRealtime.ts`
- Test: `packages/nuxt-galaxy/test/app/composables/useSupabaseRealtime.test.ts`

- [ ] **Step 1: Write failing Vue test**

```ts
describe('useSupabaseRealtime', () => {
  it('shares one channel across multiple subscribers', async () => {
    // mount two components, assert only one channel created
  })

  it('removes channel only after last subscriber unsubscribes', async () => {
    // mount two components, unmount one, assert channel still active
  })
})
```

- [ ] **Step 2: Implement counter-based lifecycle**

```ts
function subscribe() {
  if (!channels[channelName]) {
    const channel = supabase.channel(channelName)
    channels[channelName] = { channel, count: 0, eventHandlers: [] }
    channel.on('postgres_changes', { event: '*', schema: 'galaxy', table: tableName }, () => {
      channels[channelName]?.eventHandlers.forEach(handler => handler())
    }).subscribe()
  }
  const channelData = channels[channelName]
  channelData.count++
  if (!channelData.eventHandlers.includes(eventHandler)) {
    channelData.eventHandlers.push(eventHandler)
  }
}

function unsubscribe() {
  const channelData = channels[channelName]
  if (!channelData)
    return
  channelData.count--
  channelData.eventHandlers = channelData.eventHandlers.filter(h => h !== eventHandler)
  if (channelData.count <= 0) {
    supabase.removeChannel(channelData.channel)
    delete channels[channelName]
  }
}
```

- [ ] **Step 3: Commit**

## Task 11: remove client `/sync` calls

**Files:**
- Modify: `packages/ui/app/pages/analyses.vue`
- Modify: `packages/ui/app/pages/workflows/[workflowId]/analyses.vue`
- Delete: `packages/nuxt-galaxy/src/runtime/server/routes/sync.ts`

- [ ] **Step 1: Remove `$fetch('/sync')` calls**
- [ ] **Step 2: Delete legacy route file**
- [ ] **Step 3: Commit**

## Task 12: fix history terminal-state bug

**Files:**
- Modify: `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/histories.ts`

- [ ] **Step 1: Write failing test**

```ts
it('isHistoryTerminalState uses HistoryStates, not DatasetStates', () => {
  expect(isHistoryTerminalState('ok')).toBe(true)
  expect(isHistoryTerminalState('running')).toBe(false)
})
```

- [ ] **Step 2: Fix implementation**

```ts
import { HistoryStates } from 'blendtype'

export function isHistoryTerminalState(state: HistoryState): boolean {
  return (HistoryStates as readonly string[]).includes(state) && ['ok', 'error', 'failed', 'deleted'].includes(state)
}
```

- [ ] **Step 3: Commit**

## Task 13: migrations, types, env, full verification

- [ ] Run `pnpm drizzle:generate` in `packages/nuxt-galaxy`
- [ ] Run `pnpm supabase:generate:types`
- [ ] Run `pnpm supabase:db:reset` and `pnpm drizzle:migrate`
- [ ] Run `pnpm test`, `pnpm lint`, `pnpm typecheck`
- [ ] Commit regenerated files

## Task 14: integration test

**Files:**
- Create: `packages/nuxt-galaxy/test/server/tasks/integration/sync-flow.test.ts`

- [ ] **Step 1: Write test**

```ts
describe('sync-flow integration', () => {
  it('scheduled task syncs a pending analysis and stores terminal-ok dataset', async () => {
    const result = await task.run({ name: 'galaxy:sync-analyses', payload: { analysisId: 1 }, context: {} })
    expect(result.result.failed).toBe(0)
    expect(result.result.synced).toBe(1)
  })
})
```

- [ ] **Step 2: Commit**

## Verification checkpoints

- `pnpm --filter ./packages/blendtype test`
- `pnpm --filter ./packages/nuxt-galaxy test`
- `pnpm --filter ./packages/ui test`
- `pnpm lint`
- `pnpm typecheck`
