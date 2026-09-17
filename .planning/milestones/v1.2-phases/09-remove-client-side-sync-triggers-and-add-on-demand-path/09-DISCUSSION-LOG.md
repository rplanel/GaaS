# Phase 9: Remove Client-Side Sync Triggers and Add On-Demand Path - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-09
**Phase:** 9-Remove Client-Side Sync Triggers and Add On-Demand Path
**Areas discussed:** On-demand route shape, On-demand execution semantics, Client trigger cleanup scope, Realtime contract documentation

---

## On-demand route shape

| Option | Description | Selected |
|--------|-------------|----------|
| POST /api/db/analyses/:id/sync | Resource-oriented, reuses the existing /api/db/analyses route family and naturally scopes auth to the analysis owner. | ✓ |
| POST /api/tasks/sync-analyses | Task-oriented, mirrors the scheduled task name and keeps sync machinery grouped under /api/tasks. | |
| Internal handler only | Do not expose a public API route. | |

**User's choice:** POST /api/db/analyses/:id/sync
**Notes:** Preferred because it follows the existing analyses handler pattern.

---

## On-demand route auth

| Option | Description | Selected |
|--------|-------------|----------|
| Analysis owner only | Caller must match analyses.owner_id. | |
| Owner or admin | Analysis owner or any user with an admin/operator role. | |
| Any authenticated user | Any logged-in user can request a sync for any analysis. | |

**User's choice:** Owner or admin
**Notes:** Later refined to owner-only for Phase 9; admin override deferred.

---

## On-demand execution semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Enqueue via Nitro runTask | Handler calls runTask('galaxy:sync-analyses', { payload: { analysisId } }) and returns 202 Accepted immediately. | ✓ |
| Run syncAnalysisEffect inline | Handler imports and awaits syncAnalysisEffect directly. | |
| Support ?wait=true toggle | Default async enqueue, optional inline wait. | |

**User's choice:** Enqueue via Nitro runTask
**Notes:** Reuses the existing task, lock logic, evlog traces, and finalizer.

---

## Pre-enqueue validation

| Option | Description | Selected |
|--------|-------------|----------|
| Validate in handler | Handler checks analysis exists and caller owns it before runTask. | ✓ |
| Let task validate | Handler enqueues blindly; task handles missing analysis. | |
| Validate ownership only | Handler checks ownership/admin but not existence. | |

**User's choice:** Validate in handler
**Notes:** Keeps the API contract clear and avoids wasted task runs.

---

## Admin override

| Option | Description | Selected |
|--------|-------------|----------|
| Use existing galaxy_rbac roles | Query RBAC tables for admin/operator role. | |
| Defer admin override | Implement owner-only auth for Phase 9; add admin override later. | ✓ |
| Check a runtimeConfig admin list | Compare user email/id against a configured list. | |

**User's choice:** Defer admin override
**Notes:** Simplifies Phase 9 and avoids expanding RBAC scope.

---

## Handler logging

| Option | Description | Selected |
|--------|-------------|----------|
| Standard evlog request logger | Use useLogger(event) and emit an info log with analysisId and caller id. | ✓ |
| No handler-level logging | Rely on scheduled task traces only. | |
| Effect.log via runGalaxyEffect | Wrap enqueue in an Effect program. | |

**User's choice:** Standard evlog request logger
**Notes:** Follows LOGGING-SPEC for server routes.

---

## Lock conflict handling

| Option | Description | Selected |
|--------|-------------|----------|
| Always return 202 Accepted | Enqueue anyway; task skips if lock held. | ✓ |
| Return 409 Conflict if locked | Query sync_locks before enqueueing. | |
| Return 202 with a hint | Always accept, include uncertain lockStatus hint. | |

**User's choice:** Always return 202 Accepted (after agent recommendation)
**Notes:** Agent recommended this to avoid duplicating lock logic and race windows; user agreed.

---

## Response shape

| Option | Description | Selected |
|--------|-------------|----------|
| 202 Accepted with JSON body | Return { analysisId, status: 'queued', task: 'galaxy:sync-analyses' }. | ✓ |
| 202 Accepted with no body | Return empty 202. | |
| 200 OK with sync metadata | Return 200 with queued metadata. | |

**User's choice:** 202 Accepted with JSON body
**Notes:** Provides clear async signal and identifiers.

---

## UI trigger

| Option | Description | Selected |
|--------|-------------|----------|
| No UI trigger | Only expose server handler and tests. | |
| Wire the existing Run Again icon | Add click handler to the detail-page refresh-ccw icon. | |
| Add a dedicated Sync now button | Add an explicit 'Sync now' action. | ✓ |

**User's choice:** Add a dedicated Sync now button
**Notes:** Chose to keep Run Again separate from refresh/sync.

---

## Post-click behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Fire and forget with toast | Call endpoint and show success toast; wait for Realtime. | ✓ |
| Poll until state changes | Poll analysis query until is_sync true or terminal. | |
| Refresh the analysis query once | Call endpoint and immediately refresh local query. | |

**User's choice:** Fire and forget with toast
**Notes:** Avoids reintroducing client polling.

---

## Which icons to wire

| Option | Description | Selected |
|--------|-------------|----------|
| Only the analysis detail Run Again icon | Wire only the detail-page refresh-ccw icon. | |
| Detail and list refresh icons | Wire detail and list-level refresh icons. | |
| Replace tooltip text | Keep same icon behavior but rename tooltip. | |

**User's choice:** "the run again and refresh are 2 differents actions. Thet should have 2 differents icons"
**Notes:** User clarified that Run Again and refresh/sync are distinct actions; led to adding a separate 'Sync now' icon.

---

## Sync now icon representation

| Option | Description | Selected |
|--------|-------------|----------|
| Add a new 'Sync now' icon | Separate UButton with a sync-specific icon and 'Sync now' tooltip next to Run Again. | ✓ |
| Reuse the existing refresh icon | Attach sync call to existing refresh-ccw and rename tooltip. | |
| Put sync in an actions menu | Dropdown with both Run Again and Sync now. | |

**User's choice:** Add a new 'Sync now' icon
**Notes:** Distinct icon from Run Again; exact icon left to implementer.

---

## Realtime documentation location

| Option | Description | Selected |
|--------|-------------|----------|
| Both inline comments and docs page | Add JSDoc/comments plus a docs page. | ✓ |
| Inline comments only | Document in code only. | |
| Docs page only | Write user-facing docs page only. | |

**User's choice:** Both inline comments and docs page
**Notes:** Keeps the rule visible to developers and users.

---

## Docs page content

| Option | Description | Selected |
|--------|-------------|----------|
| Short statement only | Concise explanation of display-only contract. | |
| Add a sequence diagram | Include a Mermaid diagram of the full sync flow. | ✓ |
| Include manual sync instructions | Document the new on-demand endpoint and UI button. | |

**User's choice:** Add a sequence diagram
**Notes:** Visual trace of scheduled task / enqueue -> lock -> Galaxy -> DB -> Realtime -> UI.

---

## Docs page name

| Option | Description | Selected |
|--------|-------------|----------|
| concepts/sync-contract.md | Next to existing sync contract concept from Phase 6. | ✓ |
| concepts/realtime.md | Focus on Realtime boundary. | |
| concepts/client-server-sync.md | Explicit title about sync responsibilities. | |

**User's choice:** concepts/sync-contract.md
**Notes:** Centralizes sync architecture documentation.

---

## Inline comment scope

| Option | Description | Selected |
|--------|-------------|----------|
| useSupabaseRealtime composable + analysis pages | Add JSDoc to composable and comments at usage sites. | |
| useSupabaseRealtime composable only | Document once in composable JSDoc. | |
| Also mention in sync-analyses task | Add comments in composable, pages, and scheduled task. | ✓ |

**User's choice:** Also mention in sync-analyses task
**Notes:** Reinforces that the scheduled task is the sole sync-state mutator.

---

## the agent's Discretion

- Exact icon choice for the new "Sync now" button.
- Toast utility selection from existing `@gaas/ui` patterns.
- Handler file location under `runtime/server/api/db/analyses/` as long as the route is `POST /api/db/analyses/:id/sync`.

## Deferred Ideas

- Admin override for on-demand sync — deferred to a later RBAC-focused phase.
- Real "Run Again" functionality (rerun workflow) — deferred to its own phase.
- Client polling until sync completion — intentionally avoided.
- List-level manual sync button — deferred; not needed for Phase 9.
