---
phase: 09-remove-client-side-sync-triggers-and-add-on-demand-path
verified: 2026-08-09T15:45:00Z
status: passed
score: 10/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps: []
human_verification: []
behavior_unverified_items: []
---

# Phase 09: Remove Client-Side Sync Triggers and Add On-Demand Path

**Phase Goal:** Eliminate unauthorized client-driven Galaxy sync triggers, document the Realtime display-only contract, and expose a server-owned on-demand sync path that enqueues the canonical scheduled task.

**Verified:** 2026-08-09T15:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | D-01: `POST /api/db/analyses/:id/sync` returns `202` for the owner with body `{ analysisId, status: 'queued', task: 'galaxy:sync-analyses' }`. | ✓ VERIFIED | `sync.post.ts` lines 78-84 set status 202 and return the exact shape; integration test `returns 202 queued for owner` passes. |
| 2 | D-02/D-03: The endpoint returns `403` for non-owners, `404` for missing analyses, `401` when unauthenticated; ownership is verified before enqueueing. | ✓ VERIFIED | `sync.post.ts` lines 34-47 query `owner_id` and fail before `onRight`; tests `returns 404 when analysis is missing`, `returns 403 when caller is not the owner`, and `returns 401 when user is unauthenticated` pass. |
| 3 | D-04: The handler enqueues `galaxy:sync-analyses` via `runTask` and never calls `syncAnalysisEffect` inline or reads `sync_locks`. | ✓ VERIFIED | `sync.post.ts` imports `runTask` from `nitropack/runtime/task` and calls it at line 82; no import or reference to `syncAnalysisEffect`/`sync_locks`. |
| 4 | D-08: The analysis detail page exposes a primary "Sync now" `UButton` that POSTs the endpoint, shows a success toast, and leaves the existing "Run Again" button untouched. | ✓ VERIFIED | `[analysisId].vue` lines 114-116 render the primary `Sync now` button; `syncAnalysis()` (lines 57-80) POSTs and toasts; lines 117-118 leave `Run Again` with `refresh-ccw` untouched; UI typecheck passes. |
| 5 | D-07: No client component/composable in `packages/ui`, `packages/wiki`, or `playground` triggers Galaxy sync outside the scheduled task. | ✓ VERIFIED | Grepping those packages (excluding `node_modules`/generated dirs) for `syncAnalysisEffect`, `synchronizeAnalysisEffect`, `synchronizeAnalysesEffect`, `galaxy:sync-analyses`, and `runTask('galaxy:sync` returned zero hits. |
| 6 | D-10: Every `useSupabaseRealtime` call site in analysis pages and panels carries a display-only refresh comment. | ✓ VERIFIED | Comments present above all 7 call sites in `[analysisId].vue` (line 48), `AnalysisHistoryPanel.vue` (lines 60/62/64), and `AnalysisListPanel.vue` (line 24). |
| 7 | D-10: The `useSupabaseRealtime` composable JSDoc states it refreshes displayed rows only and must not trigger Galaxy sync state mutations. | ✓ VERIFIED | `useSupabaseRealtime.ts` lines 14-26 contain the JSDoc paragraph. |
| 8 | D-10: The `galaxy:sync-analyses` task carries a comment identifying itself as the sole mutator of sync state. | ✓ VERIFIED | `sync-analyses.ts` lines 14-17 contain the sole-mutator comment. |
| 9 | D-11: `docs/content/2.concepts/2.sync-contract.md` documents the on-demand POST endpoint, the Realtime display-only contract, and includes an updated Mermaid sequence diagram. | ✓ VERIFIED | Sections `## On-demand sync path` (line 135), `## Realtime display-only contract` (line 149), and updated `sequenceDiagram` with `OnDemandAPI`/`Realtime`/`UI` participants (lines 159-237) are present. |
| 10 | UI-SPEC backstop: `AnalysisListPanel.vue` renders a "No analyses yet" row when `sanitizedAnalyses` is empty. | ✓ VERIFIED | `AnalysisListPanel.vue` lines 188-192 render the empty-state row; UI tests pass. |

**Score:** 10/10 truths verified (0 present, behavior-unverified)

### Roadmap Success Criteria Coverage

| # | Success Criterion | Mapped Truths | Status |
| --- | ----------------- | ------------- | ------ |
| 1 | No client component/composable/page triggers Galaxy sync outside the scheduled task. | D-07 | ✓ VERIFIED |
| 2 | Supabase Realtime documented in code comments and user-facing docs as display-only refresh; server task owns mutations. | D-10 (comments, JSDoc, sole-mutator), D-11 | ✓ VERIFIED |
| 3 | A server action or API handler accepts a single `analysisId` payload and enqueues `galaxy:sync-analyses` without bypassing the lock table. | D-01, D-04 | ✓ VERIFIED |
| 4 | The on-demand path is covered by at least one integration test that verifies the lock is respected and no duplicate sync is started. | D-01, D-04 test coverage | ✓ VERIFIED |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/[id]/sync.post.ts` | Owner-scoped POST handler returning 202 and enqueuing the canonical task | ✓ VERIFIED | Exists (87 lines), parses route ID with radix 10 and NaN check, enqueues `runTask` without awaiting. |
| `packages/nuxt-galaxy/src/module.ts` | `addServerHandler` registration for `/api/db/analyses/:id/sync` | ✓ VERIFIED | Registered at lines 392-396 immediately after the DELETE handler. |
| `packages/ui/app/pages/analyses/[analysisId].vue` | "Sync now" button + click handler with loading/toast | ✓ VERIFIED | Button and handler present; Run Again untouched. |
| `packages/nuxt-galaxy/test/server/api/db/analyses/[id]/sync.post.test.ts` | Integration tests for 202/404/403/401 and runTask payload | ✓ VERIFIED | Exists (189 lines), 6 test cases, all pass. |
| `packages/nuxt-galaxy/src/runtime/app/composables/useSupabaseRealtime.ts` | JSDoc display-only contract | ✓ VERIFIED | JSDoc extended. |
| `packages/ui/app/components/analysis/AnalysisHistoryPanel.vue` | Display-only comments on Realtime subscriptions | ✓ VERIFIED | Comments above 3 subscriptions. |
| `packages/ui/app/components/analysis/AnalysisListPanel.vue` | Display-only comment + "No analyses yet" empty row | ✓ VERIFIED | Comment and empty state present. |
| `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` | Sole-mutator comment | ✓ VERIFIED | Comment present above `defineTask`. |
| `docs/content/2.concepts/2.sync-contract.md` | Updated contract docs with on-demand path and revised diagram | ✓ VERIFIED | Sections and diagram updated. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `sync.post.ts` | `module.ts` | `addServerHandler` registration | ✓ WIRED | Route `/api/db/analyses/:id/sync` registered at module.ts:392-396. |
| `module.ts` | `[analysisId].vue` | `$fetch` call | ✓ WIRED | `$fetch(\`/api/db/analyses/${analysisIdFromRoute.value}/sync\`, { method: 'POST' })` at [analysisId].vue:60. |
| `sync.post.ts` | `galaxy:sync-analyses` | `runTask('galaxy:sync-analyses', { payload: { analysisId } })` | ✓ WIRED | Called at sync.post.ts:82 without awaiting; `.catch` logs startup failures. |
| `galaxy:sync-analyses` | `sync_locks` | `syncAnalysisEffect` → `acquireSyncLock`/`releaseSyncLock` | ✓ WIRED | Centralized in Phase 8; task calls `syncAnalysisEffect` at sync-analyses.ts:50/95. |
| `useSupabaseRealtime.ts` JSDoc | Analysis call-site comments | Consistent `Display-only refresh` wording | ✓ WIRED | All 7 call sites carry matching comments. |
| `sync-analyses.ts` sole-mutator comment | `sync-contract.md` docs | Cross-referenced contract | ✓ WIRED | Docs state the server task is the sole mutator and on-demand requests must enqueue it. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `[analysisId].vue` | `isSyncing` | Local `ref(false)` toggled in `syncAnalysis()` | N/A (UI state) | ✓ FLOWING |
| `[analysisId].vue` | `$fetch` POST | Nitro route `/api/db/analyses/:id/sync` | Real registered route | ✓ FLOWING |
| `sync.post.ts` | `parsedAnalysisId` | `getRouterParam(event, 'id')` | Route param | ✓ FLOWING |
| `sync.post.ts` | `runTask` payload | Supabase `analyses.owner_id` validated against `getSupabaseUser(event).id` | DB query + auth | ✓ FLOWING |
| `sync-analyses.ts` | `payload.analysisId` | Passed from `runTask` | On-demand path passes validated integer; batch path omits it | ⚠️ STATIC (no runtime validation of payload shape; see Warnings) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| On-demand sync integration tests (full server suite) | `pnpm --filter ./packages/nuxt-galaxy test:server` | 36 files passed, 231 tests passed, 3 skipped | ✓ PASS |
| On-demand sync integration tests (single file) | `pnpm exec vitest run --config vitest.config.server.ts 'test/server/api/db/analyses/[id]/sync.post.test.ts'` | 1 file passed, 6 tests passed | ✓ PASS |
| nuxt-galaxy typecheck | `pnpm --filter ./packages/nuxt-galaxy typecheck` | Exits 0 | ✓ PASS |
| UI typecheck | `pnpm --filter ./packages/ui typecheck` | Exits 0 | ✓ PASS |
| UI unit tests | `pnpm --filter ./packages/ui test -- --reporter=dot` | 5 files passed, 12 tests passed | ✓ PASS |
| Client-side sync trigger audit | `grep -R --exclude-dir=node_modules ...` | No hits | ✓ PASS |
| Display-only comment audit | `grep -R --exclude-dir=node_modules useSupabaseRealtime ...` | 7 call sites, all commented | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CLIENT-01 | 09-01, 09-02 | Remove/redirect client-side sync triggers | ✓ SATISFIED | No unauthorized triggers found in `packages/ui`, `packages/wiki`, or `playground`; Realtime documented as display-only. |
| CLIENT-02 | 09-02 | Document Realtime as display-only; server task owns mutations | ✓ SATISFIED | Comments/JSDoc in 5 files; `sync-contract.md` updated with on-demand and Realtime sections. |
| CLIENT-03 | 09-01 | Expose server handler that enqueues `galaxy:sync-analyses` without bypassing locks | ✓ SATISFIED | `POST /api/db/analyses/:id/sync` handler validates ownership and enqueues the canonical task; integration tests pass. |

### Anti-Patterns / Review Findings

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` | 32 | `payload` cast to `{ analysisId?: number }` without runtime validation | ⚠️ Warning | Defense-in-depth gap; on-demand caller already validates, but direct task invocation could misbehave with malformed payloads. |
| `packages/ui/app/pages/analyses/[analysisId].vue` | 21 | `Number.parseInt(analysisIdParam as string)` omits radix 10 | ℹ️ Info | Pre-existing inconsistency; can mis-parse hex or truncated values. |
| `packages/ui/app/components/analysis/AnalysisHistoryPanel.vue` | 201-225 | Commented-out `enterMotion`, `scrollMotion`, `staggerMotion` helpers remain | ℹ️ Info | Dead code reduces readability; unrelated to Phase 09 behavior. |

No `TBD`, `FIXME`, `XXX`, `PLACEHOLDER`, or `not yet implemented` markers were found in any Phase 09 modified file.

### Notes

- The `docs` package typecheck fails due to pre-existing TypeScript errors in `docs/app/pages/[...slug].vue` and `@nuxt/image` that reproduce independently of Phase 09 changes. This is tracked for Phase 11 (Verify Quality Gates / VERIFY-02) and is not a Phase 09 gap.
- The post-review commit `18096b7ecd` already addressed earlier review items WR-01 (handler awaited `runTask`) and WR-02 (route ID parsed without radix/NaN check); the current code returns 202 without awaiting and validates the numeric route ID.

### Gaps Summary

No gaps. All Phase 09 must-haves and roadmap success criteria are satisfied in the codebase.

---

_Verified: 2026-08-09T15:45:00Z_
_Verifier: gsd-verifier_
