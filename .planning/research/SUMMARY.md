# Project Research Summary

**Project:** GaaS — v1.3 Analysis Usage Statistics
**Domain:** Server-side, deletion-surviving per-user usage statistics over a Galaxy analysis sync engine (API only, no UI)
**Researched:** 2026-08-10
**Confidence:** HIGH

## Executive Summary

This milestone's core premise — a "durable survival record" of per-analysis usage — **already exists and is production-wired** as the `galaxy.analysis_monitoring` table in `nuxt-galaxy`. All four parallel researchers independently code-verified this from first-party source: the table carries `owner_id`, `workflow_id`, `name`, `started_at`/`completed_at`, a closed `outcome` enum (`pending|success|error|cancelled`), and `galaxy_invocation_id`. Its `analysis_id` FK is `onDelete: 'set null'`, so a deleted `analyses` row leaves the stats row intact (FK nulled) — precisely the "survives deletion" requirement. It is written on persist inside the `insertAnalysis` transaction and reconciled to a terminal outcome by the scheduled `galaxy:sync-analyses` task. It already carries self-scoped (`owner_id = authUid()`) and admin (`galaxy_rbac.is_admin()`) RLS, and two endpoints (`monitoring.get.ts` / `monitoring/admin.get.ts`) already return outcome counts via `getAnalysisMonitoringCounts` / `getAllAnalysisMonitoringCounts`.

The milestone should therefore be **reframed from "build a survival record" to "extend the existing `analysis_monitoring` into full per-user usage statistics."** The genuinely new v1.3 work is small and additive: (1) per-workflow usage (`GROUP BY workflow_id`), (2) time-bucket trends (`date_trunc` on `started_at`, UTC), (3) delete-time finalization of stranded `pending` rows → `cancelled`, (4) snapshotting `workflow_name` + `galaxy_workflow_id` onto the row so per-workflow stats survive workflow deletion too, (5) two supporting indexes `(owner_id, workflow_id)` and `(owner_id, started_at)`, and (6) enriching the two existing endpoints into a composite stats contract. **No new table, no new RLS, no new dependencies.**

The highest-risk decision is the **fork** the milestone text invites: a parallel `analysis_usage`/audit table would duplicate `analysis_monitoring`, fork the persist + sync write paths, and require its own RLS + backfill. Researchers uniformly recommend **against** this — reuse and extend the existing table. The main execution risks are query-tech traps: aggregating over a live `analyses` join (silently drops deleted survivors), failing to finalize `pending` rows on delete (eternal ghost counts), omitting the `ownerId` filter on the self route (service-role bypasses RLS → cross-tenant leak), and inconsistent trend semantics. Each has a concrete, code-grounded mitigation.

## Key Findings

### Recommended Stack

**No new runtime or dev dependencies.** Every stat endpoint is a Nitro handler; every aggregation is Drizzle `sql` over PostgreSQL. The existing module already provides the exact template for every piece.

**Core technologies:**
- **Nuxt / Nitro** (`^4.3.0`, `catalog:nuxt`): server API routes via `defineEventHandler` — `monitoring.get.ts` / `monitoring/admin.get.ts` are the verbatim template.
- **Effect-TS** (`^3.19.6`): query layer with `Effect.gen`, `Drizzle` Context.Tag + `Layer`, `Data.TaggedError` — mirror existing `grizzle/analysisMonitoring.ts` shape.
- **Drizzle ORM** (`^1.0.0-rc.4` resolved): type-safe schema/RLS + `count(*) filter (where …)` aggregation, already proven in `selectCounts`.
- **PostgreSQL (Supabase)**: native `GROUP BY`, `count(*) filter`, `date_trunc` — no analytics extension needed at this scale.
- **evlog / postgres-js**: existing logger + sole Drizzle driver; no change.

**The only build artifact touching the stack** is a Drizzle migration adding two nullable snapshot columns and two composite indexes, generated via the existing `db:generate` / `supabase:generate:types` workflow (never hand-edit `supabase/migrations/` or the CLI-generated `database.ts`). See [STACK.md](STACK.md) for the full version-compatibility table (note: `drizzle-orm` npm `latest` tag is ambiguous vs the project's resolved `1.0.0-rc.4` — do **not** "fix" the catalog; treat version bumps as out of scope).

### Expected Features

Grounded in the actual codebase, not vendor feature lists. Summary from [FEATURES.md](FEATURES.md).

**Must have (table stakes):**
- Total analyses per user — exists (`monitoring` counts); fold into the stats contract for one call site.
- Outcome breakdown (success/error/cancelled) — exists; collapse `pending` semantics explicitly.
- Durable survival of stats across deletion — exists (`set null` FK); lock it with an end-to-end delete test.
- Self-scoped reads — exists (RLS); must be preserved on every new self route.
- Admin/operator global read — exists (`getAllAnalysisMonitoringCounts` + `is_admin()`); extend to workflow/trend variants.
- Per-workflow usage counts — **NEW** (`GROUP BY workflowId` + snapshotted name).
- Time-bucket trends — **NEW** (`date_trunc` on `started_at`, UTC, daily + weekly).

**Should have (competitive):**
- Terminal-outcome accuracy from jobs-summary derivation (reuse `deriveInvocationOutcomeFromJobsSummary`).
- Stable, documented JSON response contract (`total`, `byOutcome`, `byWorkflow`, `trend`) defined once in `types/nuxt-galaxy.ts`.
- Consistent UTC time-bucket semantics (documented so a future UI can convert).
- Single query surface per access level (self vs admin) rather than fragmented routes.

**Defer (v2+):**
- Stats UI dashboard (explicitly out of v1.3).
- Optional date-range / workflow-subset filters, paging/aggregation options.
- Quotas/usage enforcement, append-only audit log, real-time counters — all anti-features for this milestone.

### Architecture Approach

Unified summary from [ARCHITECTURE.md](ARCHITECTURE.md). The change is confined to `nuxt-galaxy/src/runtime/server/` and is additive. Extend the `analysis_monitoring` table (snapshot `workflow_name` + `galaxy_workflow_id`, add the two indexes), thread the workflow snapshot through the persist path, add `byWorkflow` + `trend` Effect query functions (with admin variants and a factored `requireAdminRole` helper), extend `nuxt-galaxy.ts` types, and enrich the two existing endpoints into `AnalysisMonitoringStats` (which **extends** `AnalysisMonitoringCounts`, so existing consumers keep working).

**Major components:**
1. `analysis_monitoring` (schema) — durable survival record; add snapshot columns + indexes.
2. `insertAnalysis` / `analyses.post.ts` — persist write path; snapshot workflow name/id in the same transaction.
3. `grizzle/analysisMonitoring.ts` — query layer; add `byWorkflow` + `trend` (+ admin) Effect functions.
4. `monitoring.get.ts` / `monitoring/admin.get.ts` — enrich response to the composite stats contract.
5. `galaxy:sync-analyses` task — **unchanged**, remains the sole terminal-outcome writer.

**Invariants to preserve:** the scheduled task is the only terminal-outcome mutator (persist only writes `pending`; delete only writes `pending → cancelled`); Drizzle stays server-side; no new deps; no secrets logged.

### Critical Pitfalls

Top risks from [PITFALLS.md](PITFALLS.md):

1. **Stats queries join `analyses` and drop deleted survivors** — the survival row's `analysis_id` is `NULL` after set-null, so an inner join silently under-counts the exact history being preserved. *Avoid:* aggregate exclusively over `analysis_monitoring`; never join `analyses` in stats.
2. **Delete leaves immortal `pending` rows** — `deleteAnalysis` never reconciles the survival outcome, so a deleted mid-run analysis stays `pending` forever, corrupting totals and splits. *Avoid:* in the same delete transaction, `UPDATE ... SET outcome='cancelled', completed_at=now() WHERE analysis_id=? AND owner_id=? AND outcome='pending'`.
3. **RLS bypass → ownership leak** — server runs as service-role, so RLS protects nothing; forgetting the `ownerId` filter on the self route returns everyone's stats. *Avoid:* mandatory `ownerId` param on self queries, separate user/admin functions, re-verify `is_admin()`, aggregates only (no `error_message`/`name`).
4. **Inconsistent trend semantics** — mixing `started_at`/`completed_at` makes bucket sums disagree with `total`. *Avoid:* one canonical axis = `started_at` (always set, includes survivors), `date_trunc(... AT TIME ZONE 'UTC')`, closed enum so `pending+success+error+cancelled == total`.
5. **Orphaned `workflow_id` breaks per-workflow stats** (no FK to `workflows`) — *Avoid:* denormalize the name at persist + index `(owner_id, workflow_id)` + explicit `unknown` bucket. Also: **the second-survival-table fork** ranks as the single highest-risk design mistake — don't build it.

## Implications for Roadmap

Based on combined research, a dependency-respecting phase structure (architecture build-order A→E, with delete-path finalization folded into the write-path phase). This is a **server-API-only** milestone; there is no UI phase.

### Phase 1: Schema & Migration
**Rationale:** Everything depends on the snapshot columns and indexes existing first (query layer can't use `workflow_name`, and `(owner_id, started_at)` lookups need the index).
**Delivers:** `workflow_name` + `galaxy_workflow_id` nullable snapshot columns, `(owner_id, workflow_id)` and `(owner_id, started_at)` indexes, migration with one-time backfill of known fields from `workflows`, regenerated Supabase types.
**Addresses:** Survival-duration requirement; per-workflow + trend enablers.
**Avoids:** Pitfall 6 (backfill guessing outcomes — backfill known fields only, never fabricate `outcome`, keep new columns nullable; guarded survivor rows stay honest).

### Phase 2: Write Path — Persist Snapshot + Delete Finalization
**Rationale:** Depends only on Phase 1 (columns exist). The milestone's "final outcome preserved on deletion" requirement depends on this phase.
**Delivers:** Thread `workflowName`/`galaxyWorkflowId` through `analyses.post.ts → runAnalysis → insertAnalysis`; **atomic delete-time finalization** of stranded `pending` rows → `cancelled` inside `deleteAnalysis` (with the `outcome='pending'` guard so a real sync outcome is never clobbered).
**Uses:** Drizzle transaction, Effect query layer.
**Implements:** Architecture component 2 + the critical delete-path integration.
**Avoids:** Pitfall 2 (immortal pending rows) and Pitfall 9 (multi-writer — document the writer matrix: sync task owns non-deleted transitions, delete handler owns `pending → cancelled` only, one guarded module).

### Phase 3: Query Layer — byWorkflow + Trend
**Rationale:** Depends on Phase 1 columns; independent of Phase 2. Build the two missing aggregation dimensions per the existing `selectCounts` pattern.
**Delivers:** `getAnalysisMonitoringByWorkflow` / `getAnalysisMonitoringTrend` + admin `getAll*` variants; factored `requireAdminRole` helper; `date_trunc('day'|'week', started_at AT TIME ZONE 'UTC')` over a bounded `bucket`+`start`/`end` range.
**Uses:** Drizzle `sql`, Effect, Postgres aggregation.
**Implements:** Architecture component 3.
**Avoids:** Pitfall 1 (never join `analyses`), Pitfall 4 (mandatory `ownerId`; separate user/admin signatures), Pitfall 5 (`workflowId` always returned + `unknown` bucket), Pitfall 7 (single `started_at` axis, UTC keys).

### Phase 4: Types + Endpoint Enrichment
**Rationale:** Depends on Phase 3 query functions; the type contract must compile before the endpoints wire the query layer.
**Delivers:** `AnalysisMonitoringStats` / `AnalysisMonitoringByWorkflow` / `AnalysisMonitoringTrendPoint` types; enrich existing `monitoring.get.ts`/`monitoring/admin.get.ts` to return `AnalysisMonitoringStats` (backward-compatible — extends `AnalysisMonitoringCounts`; no new routes, no `module.ts` change).
**Uses:** Nitro handlers, Effect error→HTTP mapping, evlog.
**Avoids:** Pitfall 4 (admin re-check before any non-owner query), Pitfall 8 (aggregates only — never return `errorMessage`/`name`; log only the LOGGING-SPEC sync-trace allowlist).

### Phase 5: Tests & Quality Gates
**Rationale:** Targets a compiled, wired contract; must come last to exercise the real stack. Requirement: root `pnpm lint` / `typecheck` / `test` green.
**Delivers:** Unit tests for aggregation SQL, admin scoping, deletion survival (counts unchanged after delete), delete-finalization of `pending` rows, persist snapshot, and `sum(buckets) == total`.
**Avoids:** The entire "Looks Done But Isn't" checklist in PITFALLS.md (survival unchanged, finalization, owner scoping, admin gate, no `analyses` join, no guessed backfill, UTC trends, single guarded writer, no secrets, indexes present).

### Phase Ordering Rationale
- **Schema first** because columns and indexes are prerequisites for both the write path and the query layer.
- **Write path (Phase 2) and query layer (Phase 3) can run in parallel after Phase 1** — Phase 2 depends only on columns, Phase 3 on columns + indexes; neither depends on the other. This is the natural parallelism opportunity.
- **Endpoints (Phase 4) after query layer** because endpoints compose the query functions; the type contract precedes compilation.
- **Tests (Phase 5) last** so they exercise a real, wired contract rather than stubs.
- **Every phase is a server `nuxt-galaxy` change** — `@gaas/ui`, `@gaas/wiki`, and the client are untouched, honoring layer boundaries.

### Research Flags
Phases likely needing deeper research during planning:
- **Phase 2 (delete finalization)**: needs careful design of the writer matrix and the atomic delete transaction. This is the one place with a **new second writer** to `outcome` — verify the `'pending'` guard is airtight against the sync task's write and add drift-reconciliation awareness (Pitfall 3).
- **Phase 3 (trend aggregation)**: `date_trunc` semantics, UTC handling, and `sum(bucket) == total` invariants deserve explicit test specs during planning. Validate the exact Drizzle `sql` expression for `date_trunc('day', started_at AT TIME ZONE 'UTC')`.

Phases with standard patterns (skip research-phase):
- **Phase 1 (schema/migration)**: standard Drizzle `db:generate` + `supabase:generate:types` flow already used in v1.2; existing migration and type-regen workflow is proven.
- **Phase 5 (tests/gates)**: mirrors v1.2 Phase 10 test harness (Effect `Layer.succeed`, `@nuxt/test-utils` server tests).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No-new-deps conclusion verified against resolved lockfile + vendored source; MEDIUM only on `drizzle-orm` npm `latest`-tag ambiguity (irrelevant — don't change versions). |
| Features | HIGH | Every item tied to a concrete existing/missing capability in `nuxt-galaxy` source + `.planning/PROJECT.md` decisions; domain norms applied only as scoping heuristics (MEDIUM nuance). |
| Architecture | HIGH | Build order and component boundaries read from current source, not inference; invariants (sole mutator, server-only Drizzle, no deps) are explicit. |
| Pitfalls | HIGH | Code-grounded (schema, sync task, delete path, RLS read verbatim); MEDIUM for generic time-series/aggregation patterns (trend granularity, drift reconciliation depth). |

**Overall confidence: HIGH**

### Gaps to Address
- **Drift reconciliation scope (Pitfall 3):** whether v1.3 must add a reconciliation sweep (analyses terminal but monitoring `pending`) or just document/re-test the `'pending'`-guard healing. Decide during Phase 2/3 planning; do not let it silently scope-creep.
- **Backfill semantics for pre-existing survivor rows** (`analysis_id IS NULL` from prior deletions): migration must not re-link or fabricate outcomes for these. Define the exact backfill UPDATE during Phase 1 planning.
- **Trend axis final decision** (`started_at` recommended by all researchers vs the FEATURES note mentioning `completed_at`): commit to `started_at` for the trend axis and document it; "success rate" definition (`success/total` vs `success/(success+error)`) needs an explicit, documented choice.
- **Index sufficiency vs `EXPLAIN`:** verify the existing `idx_analysis_monitoring_owner_outcome` plus the two new indexes cover both self and admin queries; revisit only if row counts grow (or add a rollout-time `EXPLAIN` check).
- **API consumer backward-compatibility:** confirm the existing `AnalysisMonitoringCounts` shape (and any in-repo consumer) tolerates the enriched `AnalysisMonitoringStats` response before shipping.

## Sources

### Primary (HIGH confidence)
- First-party repo code (all researchers): `db/schema/galaxy/analysisMonitoring.ts`, `db/schema/galaxy/analyses.ts`, `utils/grizzle/analysisMonitoring.ts`, `utils/grizzle/analyses.ts`, `utils/grizzle/sync/analysis.ts`, `tasks/galaxy/sync-analyses.ts`, `api/db/analyses/monitoring.get.ts`, `api/db/analyses/monitoring/admin.get.ts`, `db/schema/galaxyRbac/`, `types/nuxt-galaxy.ts`, `module.ts`, `pnpm-workspace.yaml` catalogs.
- `.planning/PROJECT.md` — v1.3 goal + Key Decisions (survival record over audit log, no-UI, server-API-only).
- `.planning/LOGGING-SPEC.md` — sync-trace field allowlist (no `errorMessage`/`stderr`/PII).
- Vendored references: `drizzle-orm@v1.0.0-rc.4` (aggregation API), `effect` (DI/Layer idioms).

### Secondary (MEDIUM confidence)
- npm registry snapshots for `drizzle-orm`/`drizzle-kit`/`postgres` current tags — `latest` tag ambiguous for drizzle 1.x; resolved project version taken from the lockfile (do not "fix").
- Domain norms for usage-stats systems (CI throughput, bill-meter count/trend patterns) — applied as scoping/anti-feature heuristics, not hard requirements.

### Tertiary (LOW confidence)
- None — no speculative third-party claims were required; the codebase + project decisions are authoritative for this internal, server-API deliverable.

---
*Research completed: 2026-08-10*
*Ready for roadmap: yes*
