# Phase 08: Consolidate and Harden the Server-Driven Sync Path - Pattern Map

**Mapped:** 2026-08-07
**Files analyzed:** 13
**Analogs found:** 12 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/runtime/server/utils/grizzle/sync/analysis.ts` | service | request-response / CRUD | itself (Phase 7 canonical path) | exact |
| `src/runtime/server/utils/grizzle/sync/output.ts` | service | file-I/O + CRUD | itself (Phase 7 canonical path) | exact |
| `src/runtime/server/utils/grizzle/sync/lock.ts` | service | CRUD | itself (Phase 7 canonical path) | exact |
| `src/runtime/server/tasks/galaxy/sync-analyses.ts` | task / controller | batch / request-response | itself (Phase 7 canonical path) | exact |
| `src/runtime/server/db/schema/galaxy/analyses.ts` | model / schema | config | existing `analyses.ts` schema | exact |
| `src/module.ts` | config | config | existing `module.ts` options block | exact |
| `src/runtime/server/utils/grizzle/analyses.ts` | service | cleanup | itself | exact |
| `src/runtime/server/utils/grizzle/histories.ts` | service | cleanup | itself | exact |
| `src/runtime/server/utils/grizzle/datasets/input.ts` | service | cleanup | itself | exact |
| `src/runtime/server/utils/grizzle/jobs.ts` | service | cleanup | itself | exact (for deletion) |
| `src/runtime/server/utils/grizzle/datasets/output.ts` | service | cleanup | itself | exact (for deletion) |
| `src/runtime/server/db/migrations/<timestamp>_sync_attempts_and_lock_function/` | migration | config | existing custom migration `20260722205417_analysis_files_dataset_owner_select/migration.sql` | partial |
| `test/server/utils/grizzle/sync/analysis.test.ts` | test | request-response | existing `analysis.test.ts` | exact |

## Pattern Assignments

### `src/runtime/server/utils/grizzle/sync/analysis.ts` (service, request-response)

**Analog:** itself (`packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts`)

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

**Tagged error pattern** (lines 13-15):
```typescript
export class SyncAnalysisError extends Data.TaggedError('SyncAnalysisError')<{
  readonly message: string
}> {}
```

**Effect.gen + Supabase query pattern** (lines 116-132):
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

**Finalizer pattern for lock release** (lines 108-114):
```typescript
yield* Effect.addFinalizer(() =>
  releaseSyncLock(supabase, analysisId).pipe(
    Effect.catchAll(error =>
      Effect.logError('failed to release sync lock', { message: error.message }),
    ),
  ),
)
```

**Annotation / six-ID trace pattern** (lines 268-278):
```typescript
}).pipe(
  Effect.annotateLogs({
    analysisId: String(analysisId),
    ownerId,
    galaxyInvocationId: null,
    historyId: null,
    jobId: null,
    datasetId: null,
  }),
  Effect.scoped,
)
```

**Retry pattern to copy from RESEARCH / Effect docs** (no current codebase example):
- Wrap the whole `Effect.gen(...)` block with `Effect.retry` using `Schedule.exponential('200 millis').pipe(Schedule.andThen...)` or `Schedule.recurs(3).pipe(Schedule.intersect(Schedule.exponential('200 millis').pipe(Schedule.capDelay('2 seconds'))))`.
- Use `Effect.catchIf` or a transient predicate to only retry on HTTP 503/429, Supabase 429, and network errors.
- `Effect.addFinalizer` must remain inside the retried effect so lock release runs even after retries are exhausted.

**Sync attempt tracking pattern to add**:
- On failure: update `analyses` setting `sync_attempts: sync_attempts + 1`, `last_sync_error_at: now()`, `next_sync_at: now() + min(30s * 2^sync_attempts, 1h)`.
- On success: update `analyses` setting `sync_attempts: 0`, `last_sync_error_at: null`, `next_sync_at: null`.
- Reuse the existing `Effect.tryPromise` + `supabase.schema('galaxy').from('analyses').update(...).eq('id', analysisId)` pattern from lines 183-203.

---

### `src/runtime/server/utils/grizzle/sync/lock.ts` (service, CRUD)

**Analog:** itself (`packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/lock.ts`)

**Tagged error pattern** (lines 7-9):
```typescript
export class SyncLockError extends Data.TaggedError('SyncLockError')<{
  readonly message: string
}> {}
```

**Old read-delete-insert lock pattern to replace** (lines 16-72):
```typescript
export function acquireSyncLock(
  supabase: SupabaseClient<Database>,
  analysisId: number,
  ttlSeconds: number,
): Effect.Effect<boolean, SyncLockError, never> {
  return Effect.gen(function* () {
    yield* Effect.logDebug('acquiring sync lock', { analysisId })
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)
    // ... select / delete / insert
  }).pipe(
    Effect.annotateLogs({ ... }),
  )
}
```

**New atomic RPC pattern to implement**:
```typescript
const { data, error } = yield* Effect.tryPromise({
  try: () =>
    supabase.rpc('acquire_sync_lock', {
      analysis_id: analysisId,
      ttl_seconds: ttlSeconds,
    }),
  catch: error =>
    new SyncLockError({ message: `Failed to acquire sync lock: ${error}` }),
})
if (error) {
  return yield* Effect.fail(
    new SyncLockError({ message: `Failed to acquire sync lock: ${error.message}` }),
  )
}
return data ?? false
```

**Release lock pattern to keep** (lines 74-97):
```typescript
export function releaseSyncLock(
  supabase: SupabaseClient<Database>,
  analysisId: number,
): Effect.Effect<void, SyncLockError, never> {
  return Effect.gen(function* () {
    yield* Effect.logDebug('releasing sync lock', { analysisId })
    const { error } = yield* Effect.tryPromise({
      try: () => supabase.schema('galaxy').from('sync_locks').delete().eq('analysis_id', analysisId),
      catch: e => new SyncLockError({ message: `Failed to release sync lock: ${e}` }),
    })
    if (error) {
      return yield* Effect.fail(new SyncLockError({ message: `Failed to release sync lock: ${error.message}` }))
    }
  }).pipe(
    Effect.annotateLogs({ ... }),
  )
}
```

---

### `src/runtime/server/utils/grizzle/sync/output.ts` (service, file-I/O + CRUD)

**Analog:** itself (`packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts`)

**Existing output query pattern** (lines 48-69):
```typescript
const { data: existing, error: existingError } = yield* Effect.tryPromise({
  try: () =>
    supabase
      .schema('galaxy')
      .from('analysis_outputs')
      .select('id, dataset_id, state, datasets!inner(galaxy_id)')
      .eq('analysis_id', analysisId)
      .eq('job_id', jobId)
      .eq('datasets.galaxy_id', galaxyDatasetId)
      .maybeSingle(),
  catch: error =>
    new SyncOutputError({
      message: `Failed to query existing output dataset: ${error instanceof Error ? error.message : String(error)}`,
    }),
})
```

**Dataset fetch pattern** (lines 100-109):
```typescript
const galaxyDataset = yield* bt
  .getDatasetEffect(galaxyDatasetId, historyGalaxyId)
  .pipe(
    Effect.mapError(error =>
      new SyncOutputError({
        message: `Failed to fetch dataset from Galaxy: ${error instanceof Error ? error.message : String(error)}`,
      }),
    ),
    Effect.provide(galaxyLayer),
  )
```

**Idempotency guard to insert** (after fetching `existing` and `galaxyDataset`):
```typescript
if (existing && existing.datasets.storage_object_id && existing.state === galaxyDataset.state) {
  yield* Effect.logDebug('output dataset unchanged, skipping upload', { datasetId: galaxyDatasetId })
  return
}
```
Note: the existing select does not include `storage_object_id`; extend the select to `datasets!inner(id, galaxy_id, storage_object_id, state)`.

---

### `src/runtime/server/tasks/galaxy/sync-analyses.ts` (task, batch / request-response)

**Analog:** itself (`packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts`)

**Task definition pattern** (lines 1-25):
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
    const taskLog = createRequestLogger({
      operation: 'galaxy:sync-analyses',
      requestId: crypto.randomUUID(),
    } as Parameters<typeof createRequestLogger>[0])
    // ...
  },
})
```

**Batch isolation pattern** (lines 84-101):
```typescript
for (const row of page.data || []) {
  const outcome = yield* syncAnalysisEffect(row.id, row.owner_id, supabase, galaxyLayer as Layer.Layer<bt.GalaxyFetch>).pipe(
    Effect.tapError(e => Effect.logError('analysis failed', { analysisId: row.id, message: e?.message ?? String(e) })),
    Effect.match({
      onFailure: e => ({ status: 'failed' as const, message: e?.message ?? String(e) }),
      onSuccess: () => ({ status: 'synced' as const, message: null }),
    }),
  )
  if (outcome.status === 'synced') {
    synced++
  }
  else {
    failed++
    errors.push({ analysisId: row.id, message: outcome.message.slice(0, 500) })
  }
}
```

**Runtime config consumption to add**:
Read options from `useRuntimeConfig().galaxy.sync`:
```typescript
const { sync: syncConfig } = useRuntimeConfig().galaxy
const pageSize = syncConfig?.batchSize ?? 20
const lockTtlSeconds = syncConfig?.lockTtlSeconds ?? 900
```
Pass `pageSize` to `.range(offset, offset + pageSize - 1)` and `lockTtlSeconds` to `syncAnalysisEffect` (which forwards it to `acquireSyncLock`).

---

### `src/runtime/server/db/schema/galaxy/analyses.ts` (model / schema, config)

**Analog:** existing `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts`

**Column pattern** (lines 21-38):
```typescript
export const analyses = galaxy.table(
  'analyses',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    state: invocationStateEnum('state').$type<InvocationState>().notNull(),
    parameters: json('parameters').notNull(),
    datamap: json('datamap').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    ownerId: uuid('owner_id').notNull().references(() => owners.id, { onDelete: 'cascade' }),
    historyId: integer('history_id').notNull().unique().references(() => histories.id, { onDelete: 'cascade' }),
    workflowId: integer('workflow_id').notNull().references(() => workflows.id),
    galaxyId: varchar('galaxy_id', { length: 256 }).notNull(),
    stderr: text('stderr'),
    stdout: text('stdout'),
    invocation: json('invocation').notNull(),
    isSync: boolean('is_sync').default(false),
  },
  table => [
    // ...
  ],
)
```

**New columns to append**:
```typescript
syncAttempts: integer('sync_attempts').default(0).notNull(),
lastSyncErrorAt: timestamp('last_sync_error_at', { withTimezone: true }),
nextSyncAt: timestamp('next_sync_at', { withTimezone: true }),
```

---

### `src/module.ts` (config)

**Analog:** existing `packages/nuxt-galaxy/src/module.ts`

**ModuleOptions pattern** (lines 20-85):
```typescript
export interface ModuleOptions {
  url: string
  apiKey: string
  email: string
  databaseUrl: string
  runMigrations: boolean
  useBlobUpload?: boolean
  logs?: logOptions.LogOptions
}
```

**Defaults pattern** (lines 123-131):
```typescript
defaults: {
  url: process.env.GALAXY_URL || 'http://localhost:9000',
  apiKey: process.env.GALAXY_API_KEY || 'fakekey',
  email: process.env.GALAXY_EMAIL || 'admin@example.org',
  databaseUrl: process.env.GALAXY_DRIZZLE_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  runMigrations: false,
  useBlobUpload: undefined,
  logs: {},
},
```

**Runtime config pattern** (lines 178-189):
```typescript
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

**New options to add**:
```typescript
export interface ModuleOptions {
  // ...existing
  syncLockTtlSeconds?: number
  syncBatchSize?: number
  syncMaxRetries?: number
  syncRetryBaseDelayMs?: number
  syncRetryMaxDelayMs?: number
}
```
Add defaults: `syncLockTtlSeconds: 900`, `syncBatchSize: 20`, `syncMaxRetries: 3`, `syncRetryBaseDelayMs: 200`, `syncRetryMaxDelayMs: 2000`.
Add to `runtimeConfig.galaxy.sync`:
```typescript
nuxt.options.runtimeConfig.galaxy = defu(
  runtimeConfig.galaxy || {},
  {
    // ...
    sync: {
      lockTtlSeconds: moduleOptions.syncLockTtlSeconds,
      batchSize: moduleOptions.syncBatchSize,
      maxRetries: moduleOptions.syncMaxRetries,
      retryBaseDelayMs: moduleOptions.syncRetryBaseDelayMs,
      retryMaxDelayMs: moduleOptions.syncRetryMaxDelayMs,
    },
  },
) as typeof nuxt.options.runtimeConfig.galaxy
```
Also extend the module augmentation at lines 354-363.

---

### `src/runtime/server/utils/grizzle/analyses.ts` (service, cleanup)

**Analog:** itself

**Non-sync utilities to keep** (lines 19-194, 279-438):
- `runAnalysis`
- `deleteAnalysis`
- `insertAnalysis`
- `getInvocationOutputs`
- `getAnalysis`
- `updateAnalysisTerminalState`
- `updateAnalysisState`
- `updateAnalysisIsSync`
- `getAllAnalyses`
- `getWorkflowAnalyses`
- `getHistoryAnalysis`

**Legacy exports to delete** (lines 196-218, 220-277, 370-381):
- `synchronizeJobsEffect`
- `synchronizeAnalysisEffect`
- `synchronizeAnalysesEffect`

**Import cleanup**:
Remove `import { getAnalysisStderrEffect, synchronizeJobEffect } from './jobs'` (line 15) and `import { isHistorySyncEffect, synchronizeHistoryEffect } from './histories'` (line 14) if they become unused after deletions. Verify `isHistorySyncEffect` is not used elsewhere first.

---

### `src/runtime/server/utils/grizzle/histories.ts` (service, cleanup)

**Analog:** itself

**Non-sync utilities to keep** (lines 70-255):
- `getHistoryDb`
- `getAnalysisHistory`
- `addHistoryEffect`
- `deleteHistory`
- `insertHistory`
- `isHistorySyncEffect`
- `isSynchronizedAnalysisJobs`
- `updateIsHistorySync`
- `updateHistoryState`
- `isHistoryTerminalState`

**Legacy export to delete** (lines 24-68):
- `synchronizeHistoryEffect`

**Import cleanup**:
After removing `synchronizeHistoryEffect`, remove `import { getAllAnalysisInputDatasets, synchronizeInputDatasetEffect } from './datasets/input'` and `import { getAnalysisJobs, isJobSyncEffect } from './jobs'` if unused.

---

### `src/runtime/server/utils/grizzle/datasets/input.ts` (service, cleanup)

**Analog:** itself

**Non-sync utilities to keep** (lines 14-123, 160-263):
- `getAllAnalysisInputDatasets`
- `getAnalysisInputDataset`
- `getOrCreateInputDatasetEffect`
- `insertAnalysisInputEffect`
- `getAnalysisInputState`
- `updateDatasetBlurbEffect`
- `updateAnalysisInputStateEffect`
- `isInputDatasetSyncEffect`

**Legacy export to delete** (lines 125-160):
- `synchronizeInputDatasetEffect`

---

### `src/runtime/server/utils/grizzle/jobs.ts` (service, cleanup)

**Analog:** itself (candidate for full deletion)

**Important:** Before deleting the file, verify whether `isJobTerminalState` or `getAnalysisStderrEffect` are referenced outside legacy sync code. If they are, migrate them to the canonical path or a shared helper.

If non-sync callers remain, create a new file (e.g. `src/runtime/server/utils/grizzle/jobs.ts` with only the kept helpers, or move them into `analysisMonitoring.ts` / `analysis.ts`).

If no non-sync callers remain, delete the entire file and remove all imports of it from `analyses.ts`, `histories.ts`, and tests.

---

### `src/runtime/server/utils/grizzle/datasets/output.ts` (service, cleanup)

**Analog:** itself (candidate for full deletion)

**Important:** Before deleting, confirm that `insertAnalysisOutputEffect` / `insertAnalysisOutputTags` are not used by the canonical `sync/output.ts` path. The canonical path currently has its own inline inserts.

If non-sync callers remain, keep only those helpers; otherwise delete the entire file.

---

### `src/runtime/server/db/migrations/<timestamp>_sync_attempts_and_lock_function/migration.sql` (migration, config)

**Analog:** partial — `packages/nuxt-galaxy/src/runtime/server/db/migrations/20260722205417_analysis_files_dataset_owner_select/migration.sql` for custom SQL migration file format.

**Migration file format pattern**:
```sql
-- Custom SQL migration file, put your code below! --
-- Add sync attempt tracking columns to analyses
ALTER TABLE "galaxy"."analyses"
  ADD COLUMN IF NOT EXISTS "sync_attempts" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "last_sync_error_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "next_sync_at" timestamp with time zone;

-- Atomic lock acquisition function
CREATE OR REPLACE FUNCTION "galaxy"."acquire_sync_lock"(
  analysis_id integer,
  ttl_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  now timestamp with time zone := now();
  expires_at timestamp with time zone := now + (ttl_seconds || ' seconds')::interval;
  inserted boolean;
BEGIN
  INSERT INTO "galaxy"."sync_locks" ("analysis_id", "locked_at", "expires_at")
  VALUES (analysis_id, now, expires_at)
  ON CONFLICT ("analysis_id") DO UPDATE
    SET "locked_at" = EXCLUDED."locked_at",
        "expires_at" = EXCLUDED."expires_at"
    WHERE "galaxy"."sync_locks"."expires_at" <= now
  RETURNING true INTO inserted;
  RETURN COALESCE(inserted, false);
END;
$$;
```

**Generation pattern**:
Run `pnpm drizzle:generate` after modifying the schema; this produces a timestamped migration directory under `src/runtime/server/db/migrations/`. The PostgreSQL function must be added to the generated migration manually (or in a separate manually-created migration under the same folder) because Drizzle ORM does not generate RPC functions.

---

### `test/server/utils/grizzle/sync/analysis.test.ts` (test, request-response)

**Analog:** existing `packages/nuxt-galaxy/test/server/utils/grizzle/sync/analysis.test.ts`

**Test setup pattern** (lines 1-30):
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type * as bt from 'blendtype'
import type { Database } from '../../../../../src/runtime/types/database'
import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { syncJobEffect } from '../../../../../src/runtime/server/utils/grizzle/sync/job'
import {
  acquireSyncLock,
  releaseSyncLock,
} from '../../../../../src/runtime/server/utils/grizzle/sync/lock'
import { syncOutputDatasetEffect } from '../../../../../src/runtime/server/utils/grizzle/sync/output'
import { createFailingGalaxyLayer, createMockGalaxyLayer, createRoutedGalaxyLayer } from '../../../fixtures'

vi.mock('../../../../../src/runtime/server/utils/grizzle/sync/lock', () => ({
  acquireSyncLock: vi.fn<typeof acquireSyncLock>(),
  releaseSyncLock: vi.fn<typeof releaseSyncLock>(),
}))

vi.mock('../../../../../src/runtime/server/utils/grizzle/sync/job', () => ({
  syncJobEffect: vi.fn<typeof syncJobEffect>(),
}))

vi.mock('../../../../../src/runtime/server/utils/grizzle/sync/output', () => ({
  syncOutputDatasetEffect: vi.fn<typeof syncOutputDatasetEffect>(),
}))
```

**Assertion patterns**:
- `await Effect.runPromise(syncAnalysisEffect(...))`
- `(supabase as any).__calls` for inspecting Supabase calls
- `expect(calls.update).toContainEqual([...])`
- `expect(releaseSyncLock).toHaveBeenCalledWith(supabase, analysisId)`

**New tests to add**:
- Retry exhausts after max retries and calls finalizer.
- Sync attempt columns are updated on failure and reset on success.
- Transient errors retry; permanent errors do not retry.

## Shared Patterns

### Effect-TS Error Handling
**Source:** `src/runtime/server/utils/grizzle/sync/analysis.ts`, `lock.ts`, `output.ts`
**Apply to:** All new/modified sync service files
```typescript
export class SyncAnalysisError extends Data.TaggedError('SyncAnalysisError')<{
  readonly message: string
}> {}

// Inside Effect.gen:
if (error) {
  return yield* Effect.fail(
    new SyncAnalysisError({ message: `...: ${error.message}` }),
  )
}
```

### Supabase Service-Role Query Pattern
**Source:** `src/runtime/server/utils/grizzle/sync/analysis.ts` (lines 116-132)
**Apply to:** `analysis.ts`, `output.ts`, `lock.ts`
```typescript
const { data, error } = yield* Effect.tryPromise({
  try: () => supabase.schema('galaxy').from('analyses').select(...).eq(...).single(),
  catch: error => new SyncAnalysisError({ message: `...: ${error}` }),
})
if (error || !data) {
  return yield* Effect.fail(new SyncAnalysisError({ message: `...: ${error?.message}` }))
}
```

### Six-ID Trace Annotation
**Source:** `src/runtime/server/utils/grizzle/sync/analysis.ts` (lines 268-278)
**Apply to:** All sync path files
```typescript
}).pipe(
  Effect.annotateLogs({
    analysisId: String(analysisId),
    ownerId,
    galaxyInvocationId: null,
    historyId: null,
    jobId: null,
    datasetId: null,
  }),
  Effect.scoped,
)
```

### Task Finalizer / Request Logger
**Source:** `src/runtime/server/tasks/galaxy/sync-analyses.ts` (lines 18-25, 114-124)
**Apply to:** `sync-analyses.ts`
```typescript
const taskLog = createRequestLogger({
  operation: 'galaxy:sync-analyses',
  requestId: crypto.randomUUID(),
} as Parameters<typeof createRequestLogger>[0])

const result = await runTaskEffect(taskLog, Effect.gen(function* () { ... }))

taskLog.emit({
  status: result.failed > 0 ? 500 : 200,
  synced: result.synced,
  failed: result.failed,
  skipped: result.skipped,
  durationMs,
  errors: result.errors,
})
```

### Module Options + Runtime Config
**Source:** `src/module.ts` (lines 20-85, 123-131, 178-189, 347-363)
**Apply to:** `src/module.ts`
- Add flat option to `ModuleOptions`.
- Add default to `defaults`.
- Add to `runtimeConfig.galaxy` via `defu`.
- Extend `declare module '@nuxt/schema'` interfaces.

### Migration Workflow
**Source:** `package.json` scripts (lines 61-63), `drizzle.config.ts`, `drizzle.config.galaxy.ts`
**Apply to:** Migration generation
1. Modify schema files.
2. Run `pnpm drizzle:generate`.
3. Manually add custom SQL (RPC function) to the generated migration directory.
4. Run `pnpm supabase:generate:types` to regenerate `src/runtime/types/database.ts`.
5. Run `pnpm supabase:migration:up` / `pnpm drizzle:migrate` to apply.

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md / Effect docs patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `acquire_sync_lock` Postgres function migration | migration | config | No existing RPC functions are defined in migrations; must be hand-written SQL and integrated into the generated Drizzle migration. |

## Metadata

**Analog search scope:** `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/`, `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/`, `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/`, `packages/nuxt-galaxy/src/module.ts`, `packages/nuxt-galaxy/src/runtime/server/db/migrations/`
**Files scanned:** 20+
**Pattern extraction date:** 2026-08-07
