---
phase: 09-remove-client-side-sync-triggers-and-add-on-demand-path
reviewed: 2026-08-09T17:30:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[id]/sync.post.ts
  - packages/nuxt-galaxy/src/module.ts
  - packages/ui/app/pages/analyses/[analysisId].vue
  - packages/nuxt-galaxy/test/server/api/db/analyses/[id]/sync.post.test.ts
  - packages/nuxt-galaxy/src/runtime/app/composables/useSupabaseRealtime.ts
  - packages/ui/app/components/analysis/AnalysisHistoryPanel.vue
  - packages/ui/app/components/analysis/AnalysisListPanel.vue
  - packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
  - docs/content/2.concepts/2.sync-contract.md
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-08-09T17:30:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the Phase 09 implementation that adds an owner-scoped `POST /api/db/analyses/:id/sync` endpoint, registers the route, wires a "Sync now" button, and documents the Realtime display-only contract. The authorization model (owner-only, 404/403 masking, no direct sync state mutation) is sound and the client-side sync trigger audit is clean. However, the handler awaits the enqueued task, which undermines the 202 Accepted semantics, and there are several correctness and documentation defects in the changed files.

## Warnings

### WR-01: On-demand sync handler awaits `runTask`, blocking the 202 response

**File:** `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[id]/sync.post.ts:73`
**Issue:** The handler is intended to enqueue the canonical `galaxy:sync-analyses` task and return `202 Accepted` immediately. Instead, it `await`s `runTask`, so the HTTP response does not return until the sync task finishes. For non-trivial Galaxy analyses this can keep the request open for seconds or minutes, causing client timeouts, duplicate clicks, and defeating the asynchronous acceptance contract documented in the threat model.
**Fix:** Enqueue the task without blocking the response. Set the status and return before/without awaiting the task promise:

```typescript
onRight: (value) => {
  const log = useLogger(event)
  log.info('sync queued', { analysisId: parsedAnalysisId, userId: value.userId })
  setResponseStatus(event, 202, 'Accepted')
  // Intentionally not awaited — the scheduled task owns execution.
  runTask('galaxy:sync-analyses', { payload: { analysisId: parsedAnalysisId } })
    .catch(err => log.error('sync task failed to start', { analysisId: parsedAnalysisId, error: err.message }))
  return { analysisId: parsedAnalysisId, status: 'queued', task: 'galaxy:sync-analyses' }
}
```

### WR-02: Route ID parsed with `Number.parseInt` without radix or NaN check

**File:** `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[id]/sync.post.ts:20`
**Issue:** `Number.parseInt(analysisId)` omits the radix, so values such as `0x10` are parsed as hex and values such as `123abc` are silently truncated to `123`. Non-numeric IDs produce `NaN`, which is then passed to `.eq('id', NaN)` and surfaces as a 404 only because the query fails. This is fragile and can mask incorrect request shapes.
**Fix:** Parse with radix 10 and reject non-numeric IDs explicitly before querying:

```typescript
const parsedAnalysisId = Number.parseInt(analysisId, 10)
if (Number.isNaN(parsedAnalysisId)) {
  throw createError({ statusCode: 404, statusMessage: 'Analysis not found' })
}
```

### WR-03: Scheduled task trusts `payload.analysisId` type without runtime validation

**File:** `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts:32`
**Issue:** The task casts `payload` to `{ analysisId?: number } | undefined` and uses the value directly in a Supabase query. If the task is invoked directly with a string, object, or other unexpected payload shape, the query may silently misbehave or throw a runtime error later in the task.
**Fix:** Validate the payload before using it:

```typescript
const rawAnalysisId = (payload as { analysisId?: unknown } | undefined)?.analysisId
const analysisId = typeof rawAnalysisId === 'number' && Number.isInteger(rawAnalysisId) && rawAnalysisId > 0
  ? rawAnalysisId
  : undefined
```

### WR-04: Unexpected handler failures log full `Cause.pretty` output

**File:** `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[id]/sync.post.ts:67`
**Issue:** Unknown errors are logged using `Cause.pretty(Cause.fail(error))`, which stringifies the entire Effect failure cause. While evlog applies redaction, the project's logging spec states that choosing safe fields is the first line of defense. A Supabase or Effect error may carry internal details that should not enter request logs.
**Fix:** Log only safe, stable fields:

```typescript
log.error('sync analysis handler failed', {
  errorTag: error._tag,
  message: (error as { message?: string }).message ?? String(error),
  analysisId: parsedAnalysisId,
})
```

## Info

### IN-01: Sync contract docs document wrong task result shape

**File:** `docs/content/2.concepts/2.sync-contract.md:25`
**Issue:** The documented task result is `{ synced: number, failed: number, skipped: number, error?: string }`, but the actual task returns `{ synced, failed, skipped, errors }` where `errors` is an array of `{ analysisId: number | null, message: string }`.
**Fix:** Update the table to:

```markdown
| Task result | `{ synced: number, failed: number, skipped: number, errors: { analysisId: number \| null, message: string }[] }` |
```

### IN-02: Sync contract docs describe incorrect batch ordering and filter

**File:** `docs/content/2.concepts/2.sync-contract.md:99-105`
**Issue:** The paging rules state "Order by id ASC" and show a single `.or(...)` filter. The implementation orders by `next_sync_at` ascending and chains two `.or(...)` calls (`is_sync/state` and `next_sync_at`).
**Fix:** Update the docs to match the implementation:

```markdown
- Order by `next_sync_at ASC`
- Filter: `.or('is_sync.eq.false,state.in.(new,requires_materialization,ready,scheduled,cancelling)').or('next_sync_at.is.null,next_sync_at.lte.<iso>')`
```

### IN-03: Analysis detail page parses route param without radix

**File:** `packages/ui/app/pages/analyses/[analysisId].vue:21`
**Issue:** `Number.parseInt(analysisIdParam as string)` omits radix 10, matching the issue in the new sync handler. Although pre-existing, it is inconsistent with the rest of the codebase and can mis-parse hex or truncated values.
**Fix:** Use `Number.parseInt(analysisIdParam as string, 10)`.

### IN-04: Commented-out motion helpers remain in AnalysisHistoryPanel.vue

**File:** `packages/ui/app/components/analysis/AnalysisHistoryPanel.vue:201-225`
**Issue:** A block of commented-out `enterMotion`, `scrollMotion`, and `staggerMotion` helpers remains in the file. This dead code reduces readability and is unrelated to the Phase 09 changes.
**Fix:** Remove the commented-out functions.

---

_Reviewed: 2026-08-09T17:30:00Z_
_Reviewer: gsd-code-reviewer_
_Depth: standard_
