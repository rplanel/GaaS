---
phase: 09-remove-client-side-sync-triggers-and-add-on-demand-path
plan: 01
subsystem: api
tags:
  - nitro
  - supabase
  - effect
  - evlog
  - nuxt-ui
  - runtask

requires:
  - phase: 08-consolidate-and-harden-the-server-driven-sync-path
    provides: Atomic sync_locks acquisition, bounded retry/backoff, and the canonical galaxy:sync-analyses scheduled task

provides:
  - POST /api/db/analyses/:id/sync owner-scoped Nitro handler
  - Route registration in nuxt-galaxy module.ts
  - "Sync now" button on the analysis detail page with loading state and toast feedback
  - Integration test covering 202/404/403/401 and runTask payload verification
  - Client-side sync trigger audit with zero unauthorized callers

affects:
  - 09-remove-client-side-sync-triggers-and-add-on-demand-path
  - 10-expand-test-coverage
  - 11-verify-quality-gates

actuals:
  tokens: 3344
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - Owner-scoped server handler using getSupabaseUser + Supabase service-role query
    - Fire-and-forget task enqueue via Nitro runTask('galaxy:sync-analyses', { payload: { analysisId } })
    - Nuxt UI UButton + UTooltip + useToast for async action feedback
    - Display-only Realtime refresh comment on subscription call sites

key-files:
  created:
    - packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[id]/sync.post.ts
    - packages/nuxt-galaxy/test/server/api/db/analyses/[id]/sync.post.test.ts
  modified:
    - packages/nuxt-galaxy/src/module.ts
    - packages/ui/app/pages/analyses/[analysisId].vue

key-decisions:
  - "Imported runTask from nitropack/runtime/task because #imports did not export it in the server test/type environment; behavior is identical."
  - "Added a display-only Realtime refresh comment in [analysisId].vue while editing the file, aligning with D-10 even though the primary scope was the Sync now button."
  - "Left the existing Run Again button untouched as required by D-08/D-09."

patterns-established:
  - "Server-owned on-demand sync: the handler only enqueues the canonical scheduled task and never touches sync_locks or syncAnalysisEffect."
  - "Owner-only auth for sync requests: 404 masks missing analyses, 403 masks ownership failures."

requirements-completed:
  - CLIENT-01
  - CLIENT-03

status: complete
completed: 2026-08-09
---

# Phase 09 Plan 01: On-Demand Sync End-to-End Tracer Summary

**Owner-scoped POST /api/db/analyses/:id/sync handler that enqueues the canonical galaxy:sync-analyses task, a registered Nitro route, a distinct "Sync now" button on the analysis detail page, and an integration test proving ownership and runTask payload correctness.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-08-09T14:44:34Z
- **Completed:** 2026-08-09T15:01:04Z
- **Tasks:** 3
- **Files modified:** 4
- **Commits:** 3

## Accomplishments

- Created `POST /api/db/analyses/:id/sync` handler with owner-only access, 202/401/403/404 mapping, and evlog-structured logging.
- Registered the new route in `nuxt-galaxy` module.ts immediately after the existing analyses delete handler.
- Added a primary "Sync now" `UButton` to the analysis detail page with loading state, success/error toasts, and no page-level error throw.
- Left the existing "Run Again" button untouched.
- Wrote an integration test covering happy-path enqueue, missing analysis, wrong owner, unauthenticated caller, and repeated-call idempotency.
- Audited `packages/ui`, `packages/wiki`, and `playground` for unauthorized Galaxy sync triggers and found zero hits.

## Task Commits

1. **Task 1: Create owner-scoped POST /api/db/analyses/:id/sync handler** - `70ee034` (feat)
2. **Task 2: Register route and wire the "Sync now" button** - `c9581f1` (feat)
3. **Task 3: Add integration test and audit client-side sync triggers** - `cf6087e` (test)

## Files Created/Modified

- `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[id]/sync.post.ts` - New handler: auth, owner check, runTask enqueue, 202 response.
- `packages/nuxt-galaxy/src/module.ts` - Added `addServerHandler` registration for the sync route.
- `packages/ui/app/pages/analyses/[analysisId].vue` - Added `Sync now` button, click handler, loading state, toast feedback, and display-only Realtime comment.
- `packages/nuxt-galaxy/test/server/api/db/analyses/[id]/sync.post.test.ts` - Integration tests for 202/404/403/401 and runTask payload.

## Decisions Made

- Imported `runTask` from `nitropack/runtime/task` because `#imports` did not expose it for server code; this is the canonical Nitro source and preserves identical runtime behavior.
- Added a concise display-only Realtime comment on the analysis detail page subscriptions while the file was open, supporting the broader Phase 9 contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Changed runTask import source from #imports to nitropack/runtime/task**
- **Found during:** Task 1
- **Issue:** TypeScript reported `Module '"#imports"' has no exported member 'runTask'`. The server handler cannot import runTask from the Nuxt auto-import barrel.
- **Fix:** Imported `runTask` explicitly from `nitropack/runtime/task`, which is the canonical Nitro task runtime module.
- **Files modified:** `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[id]/sync.post.ts`
- **Verification:** `pnpm --filter ./packages/nuxt-galaxy typecheck` passes; integration test verifies the handler calls `runTask('galaxy:sync-analyses', { payload: { analysisId: 1 } })`.
- **Committed in:** `70ee034` (Task 1)

---

**Total deviations:** 1 auto-fixed (1 blocking import/source issue)
**Impact on plan:** No behavioral change; the handler still enqueues `galaxy:sync-analyses` with the exact payload and returns the specified 202 body.

## Issues Encountered

- UI typecheck initially failed because `.playground/.nuxt/types/nitro-routes.d.ts` was stale and did not include the new route. Resolved by running `pnpm --filter ./packages/nuxt-galaxy dev:prepare` (stub build) followed by `pnpm --filter ./packages/ui dev:prepare` to regenerate route types, after which UI typecheck passed.
- Integration test initially failed because the mock H3 event lacked `node.res`, causing `setResponseStatus` to throw. Resolved by adding `node: { res: {} }` to `createMockEvent()`.

## Coverage

- D1: Owner-scoped POST handler returning 202 and enqueuing the canonical task
  - verification:
    - kind: integration
      ref: "packages/nuxt-galaxy/test/server/api/db/analyses/[id]/sync.post.test.ts#returns 202 queued for owner"
      status: pass
    - kind: integration
      ref: "packages/nuxt-galaxy/test/server/api/db/analyses/[id]/sync.post.test.ts#enqueues runTask each time the handler is called"
      status: pass
  human_judgment: false

- D2: Route registration in nuxt-galaxy module.ts
  - verification:
    - kind: other
      ref: "pnpm --filter ./packages/nuxt-galaxy typecheck && pnpm --filter ./packages/ui typecheck"
      status: pass
  human_judgment: false

- D3: "Sync now" button on the analysis detail page with loading state and toast feedback
  - verification:
    - kind: other
      ref: "pnpm --filter ./packages/ui typecheck"
      status: pass
  human_judgment: true
  rationale: "Automated checks verify compile-time correctness only; visual confirmation of button placement, loading spinner, and toast behavior requires human review."

- D4: Client-side sync trigger audit finds zero unauthorized callers
  - verification:
    - kind: manual_procedural
      ref: "grep -R \"syncAnalysisEffect|synchronizeAnalysisEffect|synchronizeAnalysesEffect|galaxy:sync-analyses|runTask('galaxy:sync\" packages/ui packages/wiki playground"
      status: pass
  human_judgment: false

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 09-01 complete. Ready for Plan 09-02 (document Realtime contract and close remaining UI backstops) and then Phase 10 (expand test coverage) and Phase 11 (verify quality gates).
- The on-demand sync path is covered by tests and typechecks; no blockers.

## Self-Check: PASSED

- [x] `09-01-SUMMARY.md` exists at `.planning/phases/09-remove-client-side-sync-triggers-and-add-on-demand-path/09-01-SUMMARY.md`
- [x] All task commits present in `git log --oneline -5`:
  - `70ee034` feat(09-01): create owner-scoped POST /api/db/analyses/:id/sync handler
  - `c9581f1` feat(09-01): register sync route and wire Sync now button on analysis detail
  - `cf6087e` test(09-01): add integration tests for on-demand sync endpoint and audit client triggers
- [x] Metadata commit present: `a3bac08` docs(09-01): complete on-demand sync end-to-end tracer plan
