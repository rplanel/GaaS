# GaaS — Galaxy as a Service

## What This Is

GaaS is a TypeScript/Python monorepo that lowers the barrier for building web applications integrated with the Galaxy Project. It wraps Galaxy's REST API and operational plumbing into reusable packages — `blendtype` (Effect-TS API client), `nuxt-galaxy` (Nuxt module), `@gaas/ui` (UI layer), `@gaas/wiki` (content layer), and `gaas-cli` (Python automation CLI) — so developers can build Galaxy-powered web apps without reimplementing authentication, workflow orchestration, dataset management, job monitoring, or documentation sites.

## Core Value

Developers can reliably build, deploy, and operate custom Galaxy-powered web interfaces with clear observability, because structured logging makes runtime behavior understandable to both humans and LLMs.

## Current State

**Shipped:** v1.3 Analysis Usage Statistics (2026-08-11)

The analysis usage statistics API is now complete, deletion-surviving, and fully tested:
- **Schema & Survival**: extended `galaxy.analysis_monitoring` with nullable snapshot columns (`workflow_name`, `galaxy_workflow_id`, `workflow_version`) and composite indexes for per-workflow and trend queries; generated migration includes an idempotent backfill from the local `workflows` table.
- **Write Path Integrity**: create path snapshots workflow provenance at analysis creation via a canonical helper running on the same DB transaction; delete path finalizes stranded `pending` rows to `cancelled`, guarded on `pending` so the sync task remains the sole terminal-state writer.
- **Stats Query Layer**: per-user totals, per-workflow usage with a single `unknown` orphan bucket, UTC time-bucket trends with calendar-aware day/week/month zero-fill, and a shared `computeSuccessRate` formula applied consistently on every path.
- **API Endpoints**: self (`GET /api/db/analyses/monitoring`) and admin (`GET /api/db/analyses/monitoring/admin`) endpoints return the additive `AnalysisMonitoringStats` composite; admin endpoint uses a shared generic `requireRole(user, role)` Effect gate.
- **Verified**: all 18 v1.3 requirements satisfied, root `pnpm lint`/`pnpm typecheck`/`pnpm test` green.

## Next Milestone Goals

**Target:** v2.0 Usage Statistics UI

Expose the v1.3 server-side statistics in the web interface:
- [ ] Self-service usage dashboard for each user (`UIAU-01`)
- [ ] Admin/operator global usage dashboard across all users (`UIAU-02`)
- [ ] Time-range and workflow filters on the statistics view (`UIAU-03`)

## Requirements

### Validated

- ✓ Type-safe Galaxy REST API client with Effect-TS dual API (`*Effect()` + Promise wrappers) — existing
- ✓ Nuxt module wiring configuration, auto-imports, server handlers, scheduled tasks, and Supabase auth — existing
- ✓ Layered UI/content architecture (`@gaas/ui` → `@gaas/wiki` → `playground`) — existing
- ✓ Python CLI for bibliography/indexing automation (`gaas-cli`) — existing
- ✓ Drizzle/PostgreSQL metadata store and background sync for analyses — existing
- ✓ Review all changes in the `feat/evlog` branch for correct, consistent, and useful evlog integration — evlog-review
- ✓ Produce a logging spec/conventions document that defines how and where evlog should be used across GaaS — evlog-review
- ✓ Identify and fix incorrect, missing, or inconsistent logging patterns in the branch — evlog-review
- ✓ Verify the branch passes lint, typecheck, and tests after fixes — evlog-review (lint green; root typecheck/test blocked by pre-existing/environment issues documented in `.planning/WINDOWS.md`)
- ✓ Resolve `HeroShadersDynamic.vue` dynamic-import TypeScript error — TYPE-01
- ✓ Resolve `plot/Table.vue` `columnVisibility` `defineModel` typing — TYPE-02
- ✓ Resolve `plot/Table.vue` `tableApi` state typing — TYPE-03
- ✓ Resolve `pages/index.vue` `copy()` `ClipboardValue` typing — TYPE-04
- ✓ Diagnose the Vitest forks-pool root test failure (`Unknown system error -122 write`) — TEST-01
- ✓ Fix the root test runner configuration or environment issue — TEST-02
- ✓ Root `pnpm typecheck` passes — VERIFY-01
- ✓ Root `pnpm test` passes — VERIFY-02
- ✓ Both broken windows in `.planning/WINDOWS.md` are marked fixed — VERIFY-03
- ✓ Audit the current Galaxy analysis sync workflow (server function, client triggers, data flow, error paths) — AUDIT-01 (Phase 6)
- ✓ Use evlog traces to observe the sync workflow end-to-end and identify gaps — AUDIT-02 (Phase 6)
- ✓ Inventory every call site of legacy `synchronize*Effect` helpers and identify gaps — AUDIT-03 (Phase 6)
- ✓ Refactor the server-driven sync function to follow DRY and best practices — REFACTOR-01 (Phase 8)
- ✓ Harden `sync_locks` acquisition to be atomic and make lock TTL/batch size configurable — REFACTOR-02 (Phase 8)
- ✓ Add retry/backoff for transient Galaxy/Supabase failures and sync-attempt tracking columns — REFACTOR-03 (Phase 8)
- ✓ Ensure per-analysis failures do not crash the batch sync task and locks are released on failure — REFACTOR-04 (Phase 8)
- ✓ Ensure the sync workflow emits structured evlog logs at boundaries and error paths (no secrets) — OBSERVE-01 (Phase 7)
- ✓ Annotate sync logs with reconstructible trace IDs — OBSERVE-02 (Phase 7)
- ✓ Emit a single `taskLog.emit` wide event per scheduled run with summary fields — OBSERVE-03 (Phase 7)
- ✓ Verify no secrets are logged in sync paths or tests — OBSERVE-04 (Phase 7)
- ✓ Remove or redirect any client-side polling/composable/component that triggers Galaxy sync outside the scheduled task — CLIENT-01 (Phase 9)
- ✓ Document that Supabase Realtime remains display-only refresh and the server task owns sync state mutations — CLIENT-02 (Phase 9)
- ✓ Expose a server action/handler that enqueues `galaxy:sync-analyses` with a single `analysisId` payload without bypassing locks — CLIENT-03 (Phase 9)
- ✓ Add tests covering lock contention (held lock → skip; expired lock → reclaim) — TEST-01 (Phase 10)
- ✓ Add tests covering Galaxy unavailability (503 → retry succeeds; 503 × N → marked failed with `sync_attempts` incremented) — TEST-02 (Phase 10)
- ✓ Add tests covering partial failure (DB write failure inside output sync → lock released, batch continues) — TEST-03 (Phase 10)
- ✓ Add tests covering jobs-summary-derived terminal outcome and batch summary counts `{ synced, failed, skipped }` — TEST-04 (Phase 10)
- ✓ Root `pnpm lint` passes after all v1.2 changes — VERIFY-01 (Phase 11)
- ✓ Root `pnpm typecheck` passes after all v1.2 changes — VERIFY-02 (Phase 11)
- ✓ Root `pnpm test` passes after all v1.2 changes — VERIFY-03 (Phase 11)
- ✓ Extend the existing `analysis_monitoring` table to cover all four usage statistics — v1.3
- ✓ Per-user statistics: total analyses, success/error breakdown, per-workflow usage, time-bucket trends — v1.3
- ✓ Per-workflow usage query (GROUP BY workflowId) with workflow-name snapshot — v1.3
- ✓ Time-bucket trends (date_trunc on started_at, UTC) — v1.3
- ✓ Delete-time finalization of stranded `pending` rows to `cancelled` — v1.3
- ✓ Enrich self + admin monitoring endpoints with composite stats type (backward-compatible) — v1.3
- ✓ Supporting indexes on `(owner_id, workflow_id)` and `(owner_id, started_at)` — v1.3

### Active

- [ ] Self-service usage dashboard for each user (`UIAU-01`)
- [ ] Admin/operator global usage dashboard across all users (`UIAU-02`)
- [ ] Time-range and workflow filters on the statistics view (`UIAU-03`)

### Out of Scope

- Adding new user-facing features unrelated to usage statistics
- Rolling evlog conventions to remaining untouched code — deferred to a logging-rollout milestone
- Adding log-based observability checks to CI — deferred to a tooling/CI milestone
- Replacing evlog or changing logging dependencies
- New Galaxy API endpoints or blendtype schema changes unrelated to sync
- Analysis status page redesign outside the usage-statistics view
- Adding Redis/BullMQ/pgmq/Temporal job queue — kept Nitro scheduled task + Supabase (event-driven queue is a v2+ candidate)
- Streaming upload implementation — only hardened existing dataset sync path (new streaming is v2+)

## Context

Milestone v1.3 shipped the Analysis Usage Statistics server API. It extended `galaxy.analysis_monitoring` with deletion-surviving snapshot columns and composite indexes, hardened the create/delete write paths, built per-workflow and trend query helpers, exposed the composite `AnalysisMonitoringStats` on self + admin endpoints, and verified everything with root `pnpm lint`/`pnpm typecheck`/`pnpm test` green. The milestone required no new dependencies, no new table, and no UI work.

Prior state: v1.2 hardened the Galaxy analysis sync workflow (atomic Supabase-RPC lock, configurable tunables, bounded retry/backoff, evlog boundary traces, legacy helper removal, on-demand sync endpoint). v1.1 restored the default quality gates (fixed `@gaas/ui` TypeScript errors and the Vitest forks-pool failure by switching to `pool: 'threads'`). `.planning/LOGGING-SPEC.md` remains the authoritative reference for evlog usage across server routes, scheduled tasks, client composables/components, module lifecycle events, and Effect programs.

Target consumers include human developers wanting regression confidence, plus LLM assistants and CI automation that rely on default `pnpm typecheck`/`pnpm test` succeeding.

## Constraints

- **Tech stack**: Must stay within the existing Nuxt/Effect-TS/evlog stack; no new dependencies unless required to fix a defect.
- **Branch scope**: Changes stay scoped to the active milestone; no unrelated feature work.
- **Quality gates**: `pnpm lint`, `pnpm typecheck`, and `pnpm test` must pass.
- **Security**: No secrets (Galaxy API keys, Supabase service keys, tokens) may be logged.
- **Layer boundaries**: `@gaas/wiki` must not import `nuxt-galaxy` internals directly.
- **Sync ownership**: The `galaxy:sync-analyses` scheduled task is the sole mutator of sync state; client code is display-only.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use evlog for all Nuxt/Nitro server routes, scheduled tasks, client composables, and module lifecycle events | Project convention in AGENTS.md; structured logs aid both humans and LLMs | ✓ Validated and documented in `LOGGING-SPEC.md` |
| Review and fix the entire `feat/evlog` branch before merging | Ensures logging integration is consistent and correct before it becomes the new baseline | ✓ Complete: audit, spec, and targeted fixes done |
| Produce a written logging spec as a deliverable | Provides a reference for future contributors and LLMs analyzing the codebase | ✓ Complete: `.planning/LOGGING-SPEC.md` |
| Route `Effect.logDebug` to evlog's global `log.debug` | Request logger lacks a debug method; preserves severity rather than downgrading to `info` | ✓ Implemented and tested |
| Consolidate runtime evlog drain wiring in the Nuxt module | Avoid duplicate per-root plugins and drift | ✓ Duplicate drain plugins removed |
| Atomic `galaxy.acquire_sync_lock` RPC over read-delete-insert | Eliminates the lock race window; expired locks reclaimed atomically | ✓ Implemented and covered by tests |
| Configurable sync tunables via module options (private runtimeConfig) | Single source of truth for lock TTL, batch size, and retry backoff | ✓ Implemented; driven from `runtimeConfig.galaxy.sync` |
| Server-driven sync as single source of truth; on-demand POST enqueues the canonical task | No lock bypass; logging and mutations stay centralized in the task | ✓ Implemented (`POST /api/db/analyses/:id/sync` enqueues via runTask) |
| Six-ID evlog trace annotations across sync effects | Reconstructible traces across nested Galaxy calls | ✓ Implemented (analysis/job/output, incl. output outer effect) |
| Use TDD for v1.2 implementation work | Catch sync regressions early and make failure modes testable | ✓ Used — Phase 10 expanded server test coverage |
| Load domain-specific skills/references before implementation | Effect-TS, evlog, Supabase, and Galaxy references reduce guesswork and follow project conventions | ✓ Done |
| Run adversarial review after implementation | Independent correctness/security/edge-case check before considering the milestone done | ✓ Done (08-REVIEW.md, 09-REVIEW.md) |
| Stats computed from a durable survival record, not live `analyses` | Usage statistics must survive analysis deletion; a live query of `analyses` would lose deleted analyses | ✓ Validated: `analysis_monitoring` is the survival record (v1.3) |
| Extend existing `analysis_monitoring` rather than create a new stats table | Research verified the deletion-surviving survival record, write path, RLS, and count endpoints already exist; a parallel table would duplicate tested machinery | ✓ Validated: three snapshot columns + two indexes added to existing table (v1.3) |
| Minimal survival record over a full append-only audit log | Deliver per-user usage statistics without the audit-trail complexity; only what answers the four stats | ✓ Validated: analysis_monitoring extension covers counts, perWorkflow, trend (v1.3) |
| Server API + no UI in v1.3 | Usage stats are a data/API deliverable; a stats UI is a follow-up milestone | ✓ Validated: self + admin endpoints ship the composite; UI deferred to v2.0 |
| WorkflowSnapshot frozen at write | Snapshots must survive later workflow renames/re-versions; resolving at read time would misattribute historical analyses | ✓ Validated: snapshot written once at analysis creation (v1.3) |
| `insertAnalysisMonitoringEffect` accepts optional transaction client | Keeps the analyses insert and monitoring insert atomic on the same connection | ✓ Validated: helper uses `tx ?? yield* Drizzle` (v1.3) |
| `finalizeAnalysisMonitoringEffect` requires a transaction client | Ensures finalize UPDATE and analyses DELETE are atomic; prevents standalone use | ✓ Validated: helper never yields Drizzle, only accepts `tx` (v1.3) |
| Single shared `computeSuccessRate` formula | Every query path must return the same success rate; avoids inline ratio drift | ✓ Validated: `success/(success+error)`, `0` on zero denominator, used by composite/perWorkflow/trend (v1.3) |
| Generic `requireRole(user, role)` helper | Replaces the duplicated admin-role check and supports future admin-gated endpoints | ✓ Validated: used by monitoring admin endpoint, no logging inside (v1.3) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-11 after v1.3 Analysis Usage Statistics milestone completion*
