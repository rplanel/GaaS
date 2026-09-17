---
phase: 09-remove-client-side-sync-triggers-and-add-on-demand-path
plan: 02
subsystem: ui

tags:
  - supabase-realtime
  - sync-contract
  - on-demand-sync
  - documentation

requires:
  - phase: 09-01
    provides: On-demand POST /api/db/analyses/:id/sync endpoint and detail-page "Sync now" button

provides:
  - Realtime display-only contract comments/JSDoc across analysis pages, panels, composable, and scheduled task
  - "No analyses yet" empty-state row in AnalysisListPanel.vue
  - Updated docs/content/2.concepts/2.sync-contract.md with on-demand path, Realtime contract, and revised Mermaid diagram

affects:
  - Phase 10 (Expand Test Coverage) may reference the documented contract for client/server tests
  - Phase 11 (Verify Quality Gates) must resolve pre-existing docs package typecheck errors

actuals:
  tokens: 3559
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Display-only refresh" inline comments and JSDoc linking Realtime listeners to the server-owned sync contract
    - Conditional empty-state rendering with v-if/v-else in list panels
    - User-facing sync contract docs kept under docs/content/2.concepts/

key-files:
  created:
    - .planning/phases/09-remove-client-side-sync-triggers-and-add-on-demand-path/deferred-items.md
  modified:
    - packages/nuxt-galaxy/src/runtime/app/composables/useSupabaseRealtime.ts
    - packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts
    - packages/ui/app/components/analysis/AnalysisHistoryPanel.vue
    - packages/ui/app/components/analysis/AnalysisListPanel.vue
    - docs/content/2.concepts/2.sync-contract.md

key-decisions:
  - "The display-only contract is declared in code comments/JSDoc rather than runtime checks, because enforcement is already handled by the server-only sync path."
  - "The empty-state row reuses the existing text-muted/text-sm styling to stay consistent with the surrounding list."
  - "The sync-contract docs update preserves all Phase 6 sections and extends them with Phase 9 on-demand and Realtime content."

requirements-completed:
  - CLIENT-01
  - CLIENT-02

coverage:
  - id: D1
    description: Realtime display-only contract documented in code comments and JSDoc
    requirement: CLIENT-02
    verification:
      - kind: manual_procedural
        ref: "grep -n 'Display-only refresh\\|refreshes displayed Supabase rows only\\|sole mutator of Galaxy sync state' across five target files"
        status: pass
      - kind: other
        ref: "pnpm --filter ./packages/ui typecheck && pnpm --filter ./packages/nuxt-galaxy typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "No analyses yet" empty-state row in AnalysisListPanel.vue
    requirement: CLIENT-02
    verification:
      - kind: unit
        ref: "pnpm --filter ./packages/ui exec vitest run --reporter=dot"
        status: pass
    human_judgment: false
  - id: D3
    description: sync-contract docs page extended with on-demand endpoint, Realtime contract, and updated Mermaid diagram
    requirement: CLIENT-02
    verification:
      - kind: manual_procedural
        ref: "grep -n 'On-demand sync path\\|Realtime display-only contract\\|OnDemandAPI\\|postgres_changes' docs/content/2.concepts/2.sync-contract.md"
        status: pass
      - kind: other
        ref: "pnpm --filter ./docs typecheck (pre-existing unrelated failures in docs/app/pages/[...slug].vue and @nuxt/image)"
        status: unknown
    human_judgment: true
    rationale: "The docs content changes are markdown-only and do not introduce TypeScript errors; the docs package typecheck fails due to pre-existing issues in the docs app and @nuxt/image, which are out of scope for this plan."

duration: 6min
completed: 2026-08-09
status: complete
---

# Phase 09 Plan 02: Document Realtime Contract and Close UI Backstops Summary

**Real-time display-only contract codified in code comments and user-facing docs, with the scheduled task marked as the sole sync-state mutator, and a "No analyses yet" empty-state row added to the analyses list.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-09T15:06:56Z
- **Completed:** 2026-08-09T15:13:17Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Extended `useSupabaseRealtime` JSDoc to state the display-only refresh contract and the scheduled task's ownership of sync-state mutations.
- Added display-only refresh comments above every analysis-related Realtime subscription call site (`AnalysisHistoryPanel.vue`, `AnalysisListPanel.vue`; `pages/analyses/[analysisId].vue` already carried the comment).
- Marked `galaxy:sync-analyses` as the sole mutator of sync state and documented that on-demand requests must enqueue it.
- Added a conditional "No analyses yet" empty-state row to `AnalysisListPanel.vue` while preserving the existing populated row rendering.
- Updated `docs/content/2.concepts/2.sync-contract.md` with the frozen-after-Phase-9 preamble, an `## On-demand sync path` section, a `## Realtime display-only contract` section, and an updated Mermaid sequence diagram showing `OnDemandAPI`, `Realtime`, and `UI` participants.

## Task Commits

Each task was committed atomically:

1. **Task 1: Document the Realtime display-only contract in code** - `d1c9f93e46` (docs)
2. **Task 2: Add "No analyses yet" empty row to AnalysisListPanel.vue** - `e698d59ba4` (feat)
3. **Task 3: Update the sync-contract docs page with the on-demand path** - `06f5416dd6` (docs)

## Files Created/Modified
- `packages/nuxt-galaxy/src/runtime/app/composables/useSupabaseRealtime.ts` - Extended JSDoc with the display-only refresh contract.
- `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts` - Added sole-mutator comment above `defineTask`.
- `packages/ui/app/components/analysis/AnalysisHistoryPanel.vue` - Added display-only comments above the three Realtime subscription calls.
- `packages/ui/app/components/analysis/AnalysisListPanel.vue` - Added display-only comment and "No analyses yet" empty-state row.
- `docs/content/2.concepts/2.sync-contract.md` - Updated contract preamble and added on-demand path, Realtime contract, and revised Mermaid diagram.
- `packages/ui/app/pages/analyses/[analysisId].vue` - Already contained the display-only refresh comment; no change required.

## Decisions Made

- Followed the plan by using comments/JSDoc (not runtime checks) to document the contract, since enforcement is already server-side.
- Kept the empty-state row styling minimal (`text-muted text-sm`) to match existing list typography.
- Preserved all Phase 6 contract sections and extended them, per the plan's "only extend" rule.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `pnpm --filter ./docs typecheck` fails with pre-existing TypeScript errors in `docs/app/pages/[...slug].vue` and `node_modules/@nuxt/image/dist/runtime/components/NuxtPicture.vue`. These errors are unrelated to the `sync-contract.md` markdown changes and reproduce with the markdown change stashed. Deferred to Phase 11 (Verify Quality Gates) and recorded in `deferred-items.md`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 09 is complete. The client contract is documented, UI backstops are closed, and the sync path is ready for Phase 10 test coverage expansion and Phase 11 final quality-gate verification.

## Self-Check: PASSED

- `09-02-SUMMARY.md` exists.
- Task commits `d1c9f93e46`, `e698d59ba4`, `06f5416dd6` and metadata commit `5aa67c83ae` exist.
- Empty-state row text is present in `AnalysisListPanel.vue`.
- On-demand sync path and Realtime display-only contract sections are present in `docs/content/2.concepts/2.sync-contract.md`.
- Sole-mutator comment is present in `sync-analyses.ts`.
