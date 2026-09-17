# Milestones

## v1.3 Analysis Usage Statistics (Shipped: 2026-08-11)

**Phases completed:** 5 phases, 10 plans, 20 tasks

**Key accomplishments:**

- Extended `galaxy.analysis_monitoring` with three nullable deletion-surviving snapshot columns (workflow_name/galaxy_workflow_id/workflow_version), two named composite indexes, a drizzle-kit generated migration with an idempotent local `workflows`-backfill, and a migration/schema test contract — fully offline/file-based.
- Applied the Plan-12-01 `schema_survival_columns` drizzle migration to the running local Supabase and regenerated `src/runtime/types/database.ts` to expose the three nullable snapshot columns, closing the D-11 type-sync / compile-schema gate (success criterion 4).
- The analysis create path now snapshots `workflowName`/`galaxyWorkflowId`/`workflowVersion` onto the `analysis_monitoring` row at creation, via a single canonical effect helper that runs on the same DB transaction as the `analyses` insert — so per-workflow usage stats survive workflow deletion (WRIT-01).
- The analysis delete path now finalizes a stranded `pending` analysis_monitoring row to `cancelled` (with `completed_at` set), pending-guarded on `outcome='pending'` and located by `analysisId` + `ownerId`, running in the same DB transaction as the `analyses` DELETE and only after a successful external Galaxy history delete — so usage statistics never count phantom `pending` rows, while the sync task remains the sole terminal-state writer for all non-delete transitions (WRIT-02).
- 1. [Rule 1 - Bugfix] Explicit onRejected handler on the Drizzle thenable
- Continuous, zero-filled UTC time-bucket trend series (`date_trunc(gran, started_at AT TIME ZONE 'UTC')`) with a canonical UTC key merge, calendar-aware month stepping, and closed day/week/month granularity allowlist — `getTrend(ownerId)` self + `getAllTrend()` admin parity (STAT-03)
- getAnalysisMonitoringStats/
- Wired the Phase 14 AnalysisMonitoringStats composite onto GET /api/db/analyses/monitoring (self) and /admin (all-users), extracting the inline admin-role check into a generic requireRole(user, role) Effect helper in utils/grizzle/supabase.ts
- Added the two pieces of genuinely net-new test code Phase 16 needed: the D-07 integrated create → delete → survive flow test (the milestone's core guarantee in one end-to-end place) and the D-06 requireRole role-agnosticism sub-test — both DB-free / mock-based per locked decisions D-01/D-03.
- Green root quality gates (lint / typecheck / test all exit 0) evidenced for the milestone, with TEST-01/03/04 confirmed covered by the passing existing suites rather than re-implemented.

---

## v1.2 Harden Galaxy Analysis Sync (Shipped: 2026-08-10)

**Phases completed:** 6 phases, 13 plans, 40 tasks

**Key accomplishments:**

- Structured evlog traces across the canonical Galaxy analysis sync path with a single task finalizer and documented field allowlist.
- Sanitized the `releaseSyncLock` error log and added structured boundary logs after the two missing state-transition writes in the canonical Galaxy analysis sync path.
- Tracer slice for the hardened server-driven sync path: added sync-attempt tracking columns to the analyses table and replaced the read-delete-insert lock acquisition with an atomic PostgreSQL function invoked via supabase.rpc.
- Exposed five flat sync tunables on the nuxt-galaxy ModuleOptions, flowed them through private runtimeConfig.galaxy.sync, and wired the scheduled task and syncAnalysisEffect to consume them.
- syncAnalysisEffect now retries transient Galaxy/Supabase/network failures with capped exponential backoff and persists sync-attempt metadata so the scheduler can avoid immediate re-selection.
- Added an early-return idempotency guard in syncOutputDatasetEffect that skips redundant Galaxy downloads and storage uploads when the existing analysis output dataset already references a storage object and its state matches the Galaxy dataset state.
- 1. [Rule 3 - Blocking] Non-sync callers found in files scheduled for deletion
- Added integration-level tests for the canonical server-driven sync path and verified the monorepo quality gates stay green.
- Tracer slice for the hardened server-driven sync path: added sync-attempt tracking columns to the analyses table and replaced the read-delete-insert lock acquisition with an atomic PostgreSQL function invoked via supabase.rpc.
- Owner-scoped POST /api/db/analyses/:id/sync handler that enqueues the canonical galaxy:sync-analyses task, a registered Nitro route, a distinct "Sync now" button on the analysis detail page, and an integration test proving ownership and runTask payload correctness.
- Real-time display-only contract codified in code comments and user-facing docs, with the scheduled task marked as the sole sync-state mutator, and a "No analyses yet" empty-state row added to the analyses list.
- Enhanced the Galaxy sync transient-error classifier to honor HTTP 503/429 status codes and expanded test coverage across retry, lock contention, partial output-sync failure, and batch-summary paths.
- Root quality gates restored to green for the v1.2 milestone by working around a Nitro layer-generated typed-route mismatch in the on-demand sync UI call.

---

## v1.1 Restore Quality Gates (Shipped: 2026-08-06)

**Phases completed:** 3 phases, 3 plans, 9 tasks

**Key accomplishments:**

- Resolved the four pre-existing TypeScript errors in `@gaas/ui` by switching the HeroShaders dynamic import to a relative path, typing the plot Table's columnVisibility model generically, and guarding the landing-page copy button on a defined command string.
- Switched all Vitest configurations to the `threads` pool to eliminate the forks-pool IPC write failure (`Unknown system error -122`) and restored a green root `pnpm test` run.
- Ran the full root quality gate suite end-to-end, confirmed a green baseline, and closed both broken windows in `.planning/WINDOWS.md`.

---

## evlog-review GaaS evlog Integration Review (Shipped: 2026-08-05)

**Phases completed:** 2 phases, 6 plans, 12 tasks

**Key accomplishments:**

- Produced a research-backed walking skeleton, conventions document, and Phase 2 review checklist for evlog integration across server routes, scheduled tasks, client composables, module lifecycle, and Effect programs.
- Tracer plan for the Phase 2 review milestone: produced the mandated written audit report and implemented the D-04 real debug path for the Effect→evlog bridge.
- Five `@gaas/ui` client composables now emit structured evlog/client logs instead of raw `console.error`/`console.warn`, with errors serialized as strings and no secrets in payloads.
- Five remaining `@gaas/ui` runtime files now emit structured `evlog/client` logs instead of raw `console.warn`/`console.error`, with explicit imports and no secrets in payloads.
- `packages/wiki/nuxt.config.ts` now uses `@nuxt/kit`'s `logger.withTag('@gaas/wiki')` for build-time diagnostics, and every project/package `AGENTS.md` defers logging conventions to `.planning/LOGGING-SPEC.md` while keeping the secrets rule.
- Produced the authoritative `.planning/LOGGING-SPEC.md`, cleaned up remaining runtime logging inconsistencies and CLI-init artifacts, and ran final secrets, boundary, and quality-gate audits — lint is green; root typecheck and test gates are blocked by pre-existing/environment issues documented below.

---
