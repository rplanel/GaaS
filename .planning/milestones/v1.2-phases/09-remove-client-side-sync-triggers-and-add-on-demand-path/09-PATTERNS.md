# Phase 09: Remove Client-Side Sync Triggers and Add On-Demand Path - Pattern Map

**Mapped:** 2026-08-09
**Files analyzed:** 9
**Analogs found:** 8 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[id]/sync.post.ts` | controller/handler | request-response | `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[analysisId].delete.ts` | exact |
| `packages/nuxt-galaxy/src/module.ts` | config | registration | `packages/nuxt-galaxy/src/module.ts` (existing `addServerHandler` block) | exact |
| `packages/ui/app/pages/analyses/[analysisId].vue` | page component | event-driven | itself | exact |
| `packages/nuxt-galaxy/src/runtime/app/composables/useSupabaseRealtime.ts` | composable | pub-sub | itself | exact |
| `packages/ui/app/components/analysis/AnalysisHistoryPanel.vue` | component | event-driven | itself | exact |
| `packages/ui/app/components/analysis/AnalysisListPanel.vue` | component | event-driven | itself | exact |
| `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` | scheduled task | batch | itself | exact |
| `docs/content/2.concepts/2.sync-contract.md` | documentation | prose | itself | exact |
| `packages/nuxt-galaxy/test/server/api/db/analyses/[id]/sync.post.test.ts` | test | request-response | `packages/nuxt-galaxy/test/server/api/db/analyses-delete.test.ts` | role-match |

## Pattern Assignments

### `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[id]/sync.post.ts` (handler, request-response)

**Analog:** `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[analysisId].delete.ts`

This is the closest existing handler: it parses a numeric route parameter, validates the authenticated user, performs an owner-scoped check via Supabase service-role client, and translates errors into H3 `createError` responses.

**Imports pattern** (lines 1-9):
```typescript
import { toGalaxyServiceUnavailable } from 'blendtype'
import { Cause, Effect, Either, Layer } from 'effect'
import { useLogger } from 'evlog'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { Drizzle } from '../../../utils/drizzle'
import { runGalaxyEffect } from '../../../utils/evlog-effect'
import { useGalaxyLayer } from '../../../utils/galaxy'
import { getSupabaseUser, GetSupabaseUserError, ServerSupabaseClaims, ServerSupabaseClient } from '../../../utils/grizzle/supabase'
```

**Route parameter + early return pattern** (lines 12-14):
```typescript
const analysisId = getRouterParam(event, 'analysisId')
if (!analysisId)
  return undefined
```

**Auth + owner-check pattern** (lines 16-25):
```typescript
const program = Effect.gen(function* () {
  const supabaseUser = yield* getSupabaseUser(event)
  if (!supabaseUser?.id) {
    return yield* Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' }))
  }
  return yield* deleteAnalysis(
    Number.parseInt(analysisId),
    supabaseUser.id,
  )
})
```

For the sync handler, replace `deleteAnalysis` with a service-role Supabase query that fetches `analyses(id, owner_id)` and compares `owner_id` to `supabaseUser.id`. Return 404 when the row is missing, 403 when the caller is not the owner.

**Effect execution + error translation pattern** (lines 27-46):
```typescript
const result = await runGalaxyEffect(
  event,
  program.pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(Layer.mergeAll(Drizzle.Live, ServerSupabaseClient.Live, ServerSupabaseClaims.Live, useGalaxyLayer())),
    Effect.either,
  ),
)

return Either.match(result, {
  onLeft: (error) => {
    if (error._tag === 'GetSupabaseUserError') {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
    const log = useLogger(event)
    log.error('delete analysis handler failed', { cause: Cause.pretty(Cause.fail(error)) })
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  },
  onRight: value => value,
})
```

Add a new branch for `NotFoundError` → 404 and `ForbiddenError` → 403. Keep the 500 fallback and log with `analysisId` and caller user id.

**Logging pattern** (D-06): use `const log = useLogger(event)` and emit an `info` log containing `analysisId` and the caller user id before enqueueing.

**Enqueue pattern** (no existing analog in repo): call Nitro's `runTask` with the task name and payload:
```typescript
await runTask('galaxy:sync-analyses', { payload: { analysisId: Number.parseInt(analysisId) } })
```

Return 202 with the exact body:
```typescript
return { analysisId: Number.parseInt(analysisId), status: 'queued', task: 'galaxy:sync-analyses' }
```

---

### `packages/nuxt-galaxy/src/module.ts` (config, registration)

**Analog:** existing `addServerHandler` block for `/api/db/analyses/:analysisId`

**Pattern** (lines 386-390):
```typescript
addServerHandler({
  route: '/api/db/analyses/:analysisId',
  handler: resolver.resolve('./runtime/server/api/db/analyses/[analysisId].delete'),
  method: 'delete',
})
```

Copy this block and register the new POST route immediately after it:
```typescript
addServerHandler({
  route: '/api/db/analyses/:id/sync',
  handler: resolver.resolve('./runtime/server/api/db/analyses/[id]/sync.post'),
  method: 'post',
})
```

---

### `packages/ui/app/pages/analyses/[analysisId].vue` (page component, event-driven)

**Analog:** the file itself

**Imports + setup pattern** (lines 1-15):
```typescript
<script setup lang="ts">
import type { Database } from 'nuxt-galaxy'
import { format } from 'date-fns'
import { useDefinedBreakpoints } from '../../composables/useDefinedBreakpoints'

const router = useRouter()
const route = useRoute('analysis-detail')
const supabase = useSupabaseClient<Database>()
const analysisId = ref<number | undefined>(undefined)
```

**Realtime subscription pattern** (lines 46-52):
```typescript
useSupabaseRealtime(`histories:${toValue(analysisIdFromRoute)}`, 'histories', handleUpdates)
useSupabaseRealtime(`jobs:${toValue(analysisIdFromRoute)}`, 'jobs', handleUpdates)
useSupabaseRealtime(`analysis_outputs:${toValue(analysisIdFromRoute)}`, 'analysis_outputs', handleUpdates)

function handleUpdates() {
  refreshAnalysis()
}
```

Add a JSDoc comment above these lines stating the subscriptions are display-only and must not trigger Galaxy sync mutations.

**Header button pattern** (lines 82-92):
```vue
<template #right>
  <UTooltip text="Rename Analysis">
    <UButton color="neutral" variant="ghost" icon="i-lucide-pen" />
  </UTooltip>
  <UTooltip text="Run Again">
    <UButton color="neutral" variant="ghost" icon="i-lucide:refresh-ccw" />
  </UTooltip>
  <UTooltip text="Delete Analysis">
    <UButton color="error" variant="ghost" icon="i-lucide-trash" />
  </UButton>
  </UTooltip>
</template>
```

Add a new "Sync now" `<UTooltip>` + `<UButton>` next to "Run Again". Use a visually distinct icon such as `i-lucide:refresh-cw` (D-08, D-10). The click handler should call the new endpoint and show a brief success toast.

**Client endpoint call + toast pattern** (from `packages/ui/app/components/analysis/AnalysisListPanel.vue` lines 136-158 and `packages/ui/app/pages/admin/workflows.vue` lines 92-96):
```typescript
const toast = useToast()

async function syncAnalysis() {
  try {
    await $fetch(`/api/db/analyses/${analysisIdFromRoute.value}/sync`, { method: 'POST' })
    toast.add({
      title: 'Sync queued',
      description: 'The analysis sync has been queued.',
      color: 'success',
      icon: 'i-lucide-circle-check',
    })
  }
  catch (error) {
    const { errorMessage } = useErrorMessage(error)
    const { errorStatus } = useErrorStatus(error)
    throw createError({
      message: toValue(errorMessage),
      statusCode: toValue(errorStatus),
    })
  }
}
```

---

### `packages/nuxt-galaxy/src/runtime/app/composables/useSupabaseRealtime.ts` (composable, pub-sub)

**Analog:** the file itself

**Pattern** (lines 14-22):
```typescript
/**
 * A composable function to manage Supabase realtime subscriptions.
 * It allows subscribing to a specific channel and table, and handles
 * the event when changes occur in the specified table.
 *
 * @param channelName - The name of the channel to subscribe to.
 * @param tableName - The name of the table to listen for changes.
 * @param eventHandler - The function to call when an event occurs.
 */
```

Extend the JSDoc (or add a top-level file comment) to document the display-only contract: this composable refreshes displayed Supabase rows only and must not trigger Galaxy sync state mutations.

---

### `packages/ui/app/components/analysis/AnalysisHistoryPanel.vue` (component, event-driven)

**Analog:** the file itself

**Realtime subscription pattern** (lines 60-62):
```typescript
useSupabaseRealtime(`galaxy:histories:${props.analysisId}`, 'histories', refresh)
useSupabaseRealtime(`galaxy:jobs:${props.analysisId}`, 'jobs', refresh)
useSupabaseRealtime(`galaxy:analysis_outputs:${props.analysisId}`, 'analysis_outputs', refresh)
```

Add a comment above these lines documenting that the subscriptions are for display refresh only and do not trigger Galaxy sync.

---

### `packages/ui/app/components/analysis/AnalysisListPanel.vue` (component, event-driven)

**Analog:** the file itself

**Realtime subscription pattern** (line 24):
```typescript
useSupabaseRealtime('galaxy:analyses', 'analyses', refreshAnalyses)
```

Add a comment documenting the display-only refresh contract.

---

### `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` (scheduled task, batch)

**Analog:** the file itself

**Pattern to document** (lines 14-18):
```typescript
export default defineTask({
  meta: {
    name: 'galaxy:sync-analyses',
    description: 'Sync pending Galaxy analyses to Supabase',
  },
```

Add a comment near the task definition stating that this scheduled task is the sole mutator of sync state and that on-demand requests must enqueue this task rather than invoke `syncAnalysisEffect` directly.

**Single-analysis payload handling** (lines 35-61):
```typescript
if (analysisId) {
  yield* Effect.logInfo('syncing single analysis', { analysisId })
  const { data, error } = yield* Effect.tryPromise(() =>
    supabase.schema('galaxy').from('analyses').select('id, owner_id').eq('id', analysisId).single(),
  )
  if (error || !data) {
    const message = error?.message ?? 'Analysis not found'
    yield* Effect.logError('analysis not found or error', { analysisId, message })
    return { synced: 0, failed: 1, skipped: 0, errors: [{ analysisId, message: 'Analysis not found' }] }
  }
  const outcome = yield* syncAnalysisEffect(data.id, data.owner_id, supabase, galaxyLayer as Layer.Layer<bt.GalaxyFetch>, syncConfig).pipe(
    Effect.tapError(e => Effect.logError('analysis failed', { analysisId, message: e?.message ?? String(e) })),
    Effect.match({
      onFailure: e => ({ status: 'failed' as const, message: e?.message ?? String(e) }),
      onSuccess: () => ({ status: 'synced' as const, message: null }),
    }),
  )
```

This block already supports `payload.analysisId`; the new handler reuses it by enqueueing the task with `{ analysisId }`.

---

### `docs/content/2.concepts/2.sync-contract.md` (documentation)

**Analog:** the file itself

**Existing structure to extend** (lines 1-4):
```markdown
---
title: "Sync Contract"
description: "Canonical contract for the Galaxy analysis sync workflow, lock semantics, and legacy helpers pending removal."
---
```

**Existing sequence diagram** (lines 137-208): update to include the new on-demand path. Add a new participant for the "On-Demand API Handler" that calls `runTask('galaxy:sync-analyses')` with `{ analysisId }`, leading into the existing Scheduler→Task flow. Include a Realtime→UI participant to show the display-only refresh path.

Keep the existing Mermaid diagram structure and add a section documenting:
- `POST /api/db/analyses/:id/sync` is owner-only and returns 202 Accepted.
- The handler enqueues `galaxy:sync-analyses`; it does not bypass the lock table.
- `useSupabaseRealtime` is display-only.

---

### `packages/nuxt-galaxy/test/server/api/db/analyses/[id]/sync.post.test.ts` (test, request-response)

**Analog:** `packages/nuxt-galaxy/test/server/api/db/analyses-delete.test.ts`

**Test file imports + mock pattern** (lines 1-60):
```typescript
import { Context, Effect, Layer } from 'effect'
import { useLogger } from 'evlog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRequestLogger } from '../../setup'

const mockSupabaseUser = {
  id: 'owner-uuid-1',
  email: 'user@example.com',
}

class GetSupabaseUserError extends Error {
  readonly _tag = 'GetSupabaseUserError'
  constructor(opts: { message: string }) {
    super(opts.message)
  }
}

class MockDrizzle extends Context.Tag('@nuxt-galaxy/Drizzle')<MockDrizzle, any>() {
  static readonly Live = Layer.succeed(MockDrizzle, {})
}

class MockServerSupabaseClient extends Context.Tag('@nuxt-galaxy/ServerSupabaseClient')<MockServerSupabaseClient, any>() {
  static readonly Live = Layer.succeed(MockServerSupabaseClient, () => Effect.succeed({}))
}

class MockServerSupabaseClaims extends Context.Tag('@nuxt-galaxy/ServerSupabaseClaims')<MockServerSupabaseClaims, any>() {
  static readonly Live = Layer.succeed(MockServerSupabaseClaims, () => Effect.succeed(null))
}
```

**Mock registration pattern** (lines 34-60):
```typescript
vi.mock('blendtype', () => ({
  toGalaxyServiceUnavailable: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  makeGalaxyLayer: vi.fn(() => Layer.empty),
}))

vi.mock('../../../../src/runtime/server/utils/galaxy', () => ({
  useGalaxyLayer: vi.fn(() => Layer.empty),
}))

vi.mock('../../../../src/runtime/server/utils/drizzle', () => ({
  Drizzle: MockDrizzle,
}))

vi.mock('../../../../src/runtime/server/utils/grizzle/supabase', () => ({
  ServerSupabaseClient: MockServerSupabaseClient,
  ServerSupabaseClaims: MockServerSupabaseClaims,
  getSupabaseUser: vi.fn(() => Effect.succeed(mockSupabaseUser)),
  GetSupabaseUserError,
}))
```

**h3 mock pattern** (lines 62-73):
```typescript
vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    getRouterParam: vi.fn((_event: unknown, param: string) => {
      if (param === 'analysisId')
        return '1'
      return undefined
    }),
  }
})
```

**Test structure pattern** (lines 79-149):
```typescript
beforeEach(() => {
  vi.clearAllMocks()
})

describe('post /api/db/analyses/:analysisId/sync', () => {
  it('returns 202 queued for owner', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    const handler = (await import('../../../../src/runtime/server/api/db/analyses/[id]/sync.post')).default
    const result = await handler({ path: '/api/db/analyses/1/sync', method: 'POST' } as any)

    expect(result).toEqual({ analysisId: 1, status: 'queued', task: 'galaxy:sync-analyses' })
    expect(requestLog.info).toHaveBeenCalledWith(expect.stringContaining('sync queued'), expect.objectContaining({ analysisId: 1, userId: 'owner-uuid-1' }))
  })
})
```

Also add tests for:
- 404 when analysis row missing.
- 403 when caller is not `owner_id`.
- 401 when user is unauthenticated.
- `runTask` called with `{ payload: { analysisId: 1 } }`.

Mock `runTask` with:
```typescript
vi.mock('#imports', () => ({
  runTask: vi.fn(() => Promise.resolve({ result: { synced: 1, failed: 0, skipped: 0, errors: [] } })),
}))
```

## Shared Patterns

### Authentication / Owner Check
**Source:** `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[analysisId].delete.ts` lines 16-25
**Apply to:** `sync.post.ts`
```typescript
const program = Effect.gen(function* () {
  const supabaseUser = yield* getSupabaseUser(event)
  if (!supabaseUser?.id) {
    return yield* Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' }))
  }
  // owner-scoped query via service-role supabase
})
```

### Request-Scoped Logging
**Source:** `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts` lines 165-170
**Apply to:** all server handlers
```typescript
export function runGalaxyEffect<T, E>(event: H3Event, effect: EffectType.Effect<T, E, never>): Promise<T> {
  const requestLog = useLogger(event)
  requestLog.set({ handler: event.path, method: event.method })
  return evlogAsyncStorage.run(requestLog, () => runWithEvlogLogger(effect))
}
```

### Error Translation to H3
**Source:** `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[analysisId].delete.ts` lines 36-46
**Apply to:** `sync.post.ts`
```typescript
return Either.match(result, {
  onLeft: (error) => {
    if (error._tag === 'GetSupabaseUserError') {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
    const log = useLogger(event)
    log.error('delete analysis handler failed', { cause: Cause.pretty(Cause.fail(error)) })
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  },
  onRight: value => value,
})
```

### Effect Layer Provision
**Source:** `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[analysisId].delete.ts` lines 27-34
**Apply to:** `sync.post.ts`
```typescript
const result = await runGalaxyEffect(
  event,
  program.pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(Layer.mergeAll(Drizzle.Live, ServerSupabaseClient.Live, ServerSupabaseClaims.Live, useGalaxyLayer())),
    Effect.either,
  ),
)
```

### Toast Feedback
**Source:** `packages/ui/app/pages/admin/workflows.vue` lines 92-96
**Apply to:** analysis detail page "Sync now" button
```typescript
toast.add({
  title: 'Workflow added to the webservice',
  color: 'success',
  icon: 'i-lucide-circle-check',
})
```

### $fetch POST Call
**Source:** `packages/ui/app/pages/admin/workflows.vue` lines 106-111
**Apply to:** "Sync now" click handler
```typescript
await $fetch('/api/db/workflows', {
  method: 'POST',
  body: {
    galaxyId,
  },
})
```

### Realtime Display-Only Contract Comment
**Source:** existing JSDoc in `packages/nuxt-galaxy/src/runtime/app/composables/useSupabaseRealtime.ts`
**Apply to:** all `useSupabaseRealtime` call sites and the composable itself
Add a concise comment such as:
```typescript
// Display-only refresh: this subscription re-fetches displayed rows and must not trigger Galaxy sync.
```

## No Analog Found

| File / Pattern | Role | Data Flow | Reason |
|----------------|------|-----------|--------|
| Nitro `runTask('galaxy:sync-analyses', { payload })` | task enqueue | request-response → batch | No existing handler in the codebase calls `runTask`; this is a new Nitro experimental-task pattern introduced by Phase 9. Use the documented Nitro signature and pass `{ payload: { analysisId } }`. |

## Metadata

**Analog search scope:** `packages/nuxt-galaxy/src/runtime/server/api/db/**`, `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/**`, `packages/nuxt-galaxy/src/runtime/app/composables/**`, `packages/ui/app/pages/analyses/**`, `packages/ui/app/components/analysis/**`, `packages/nuxt-galaxy/test/server/api/db/**`, `docs/content/2.concepts/`
**Files scanned:** 16
**Pattern extraction date:** 2026-08-09
