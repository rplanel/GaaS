# Stack Research

**Domain:** per-user analysis usage statistics (durable survival record + server-side aggregation + API endpoints, no UI) — Galaxy-as-a-Service `nuxt-galaxy` module
**Researched:** 2026-08-10
**Confidence:** HIGH (core findings verified first-party against repo source); version-currency-vs-npm-registry note = MEDIUM

## Headline Recommendation

**This feature requires NO new runtime dependencies and NO new survival table.**

The milestone's "durable per-analysis stats record independent of the `analyses` table"
**already exists** as `analysis_monitoring` (`packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analysisMonitoring.ts`),
and the self-scoped + admin dual-endpoint pattern already exists for the related
"monitoring" query surface. The v1.3 work is therefore **queries + endpoints on an existing
table**, not new infrastructure. Do **not** create a second parallel audit/stats table —
that duplicates `analysis_monitoring` and forks the ownership/outcome reconciliation already
wired into the sync task.

The existing `research/STACK.md` was written for the **superseded** "v1.3 Analysis Audit Trail"
framing and is hereby replaced by this file (v1.3 was redefined as Analysis Usage Statistics).

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Nuxt / Nitro** | `^4.3.0` (`catalog:nuxt`) | Server API routes (`defineEventHandler`) | Every stat endpoint is a Nitro handler; the existing `monitoring.get.ts` / `monitoring/admin.get.ts` handlers are the exact template. |
| **Effect-TS** | `^3.19.6` (`catalog:`; resolves ~3.22) | Query layer (Effect programs, `Drizzle` Tag + `Layer`) | All existing DB access is Effect via the `Drizzle` Context.Tag + `Data.TaggedError`; stats follow the same composable, testable shape. |
| **Drizzle ORM** | `^1.0.0-beta.16` (`catalog:`; resolves `1.0.0-rc.4`) | Type-safe schema, RLS policies, aggregation | Already the metadata-store ORM; `count(*) filter (where …)` aggregation is already used in `selectCounts`. |
| **PostgreSQL (Supabase)** | Postgres 15+ | Aggregation store | `count(*) filter`, `GROUP BY`, and `date_trunc` time-bucketing are native SQL; no windowing/analytics extension needed at this scale. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `drizzle-orm/pg-core` | `^1.0.0-beta.16` | `pgTable`, `pgPolicy`, `index`, `pgEnum` | Adding a `workflow_id + outcome + started_at` composite index for the new GROUP BY / trend queries. |
| `drizzle-orm/supabase` | `^1.0.0-beta.16` | `authenticatedRole`, `authUid` | Self-scoped SELECT/UPDATE policies on `analysis_monitoring`. |
| `effect` | `^3.19.6` | `Effect.gen`, `Data.TaggedError`, `Effect.tryPromise`, `Effect.either` | Query layer + handler error mapping (401/403/500), mirroring `monitoring/admin.get.ts`. |
| `evlog` | `^2.22.3` | structured handler logging (`useLogger(event)`) | Error-path logging on stat handlers; do not log secrets — follow `.planning/LOGGING-SPEC.md`. |
| `postgres` (postgres-js) | `^3.4.7` | DB driver behind `server/utils/drizzle.ts` | Already the sole Drizzle driver; no change. |
| `drizzle-orm` raw `sql` | `^1.0.0-beta.16` | `date_trunc`, `GROUP BY` expressions | For time-bucket trends (`sql\`date_trunc('day', ${analysisMonitoring.startedAt})\``); `sql` + `count` are already re-exported from `utils/drizzle.ts`. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `drizzle-kit` | Migration generation for the new index | Existing `drizzle.config.ts` targets both `galaxy` and `galaxy_rbac`; run via existing migration workflow. |
| `vitest` / `@nuxt/test-utils` | Server handler tests | Reuse the existing server test harness + Effect `Layer.succeed` for the stats queries (see v1.2 Phase 10 pattern). |

## Existing Infrastructure to REUSE (verified in-repo)

These are the load-bearing facts that make this milestone a no-new-deps feature:

1. **Survival record exists** — `analysis_monitoring` is a full per-analysis row:
   `owner_id`, `workflow_id`, `name`, `started_at`, `completed_at`, `outcome`
   (`pending|success|error|cancelled`), `galaxy_invocation_id`, `error_message`, `analysis_id`.
   Its `analysis_id` FK is `onDelete: 'set null'` and is a **partial unique index
   (`WHERE analysis_id IS NOT NULL`)** — so when an `analyses` row is deleted the stats row
   **survives** (FK nulled) and re-created analyses don't collide. This is exactly the
   "survives analysis deletion" requirement.
2. **Write path wired** — `insertAnalysis` inserts both the `analyses` row and a
   `analysis_monitoring` row with `outcome: 'pending'` in one Drizzle transaction;
   `updateAnalysisMonitoringEffect` (`sync/analysis` path) flips it to a terminal outcome as
   the `galaxy:sync-analyses` task reconciles. Final outcome is preserved on deletion.
3. **Aggregation proven** — `getAnalysisMonitoringCounts` / `getAllAnalysisMonitoringCounts`
   (`utils/grizzle/analysisMonitoring.ts`) already do `sql<number>\`count(*) filter (where …)\``
   for total/success/error/cancelled/pending, with both a scoped (ownerId) and unscoped variant.
4. **RLS policy pattern** — `analysis_monitoring` carries `authUid`-scoped SELECT/INSERT/UPDATE
   policies **plus** an admin SELECT policy via `(SELECT galaxy_rbac.is_admin()) = TRUE`.
   `galaxy_rbac.is_admin()` function exists and is `EXECUTE`-granted to `authenticated`.
5. **Dual-endpoint template** — `api/db/analyses/monitoring.get.ts` (self) and
   `api/db/analyses/monitoring/admin.get.ts` (admin, role-checked) show the full 401/403 shape.

## NEW work that touches the stack (additive only)

- **New queries** on `analysis_monitoring` (in a new grizzle util like `utils/grizzle/analysisStats.ts`):
  - Per-workflow usage: `select(wf: analysisMonitoring.workflowId, count: count(), success-error buckets) .from(analysisMonitoring).where(eq(ownerId, …)).groupBy(analysisMonitoring.workflowId)`.
  - Time-bucket trends: `.select({ bucket: sql<string>\`date_trunc('day', ${analysisMonitoring.startedAt})\`, count }) … .groupBy(sql\`date_trunc('day', …)\`)`.
  - Admin global variants drop the `ownerId` filter (same pattern as monitoring).
- **New Nitro endpoints** following `monitoring.get.ts` / `monitoring/admin.get.ts` verbatim.
- **Migration** — add a composite index to serve the new GROUP BY / trend queries (e.g.
  `analysis_monitoring(owner_id, outcome, started_at)` to cover per-user self stats and
  `analysis_monitoring(workflow_id)` for the admin per-workflow breakdown). Verify against
  `EXPLAIN` if row counts grow; the existing `idx_analysis_monitoring_owner_outcome` may already
  cover the self path.

## Installation

```bash
# No new runtime or dev dependencies are required.
# The only artifact is a Drizzle migration for the new composite index:
pnpm --filter ./packages/nuxt-galaxy db:generate   # (or the repo's migration workflow)
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Reuse `analysis_monitoring` as the survival record | Create a new `analysis_stats` / audit table | **Never here** — creates duplicate ownership/outcome reconciliation and a second source of truth; the existing table already meets every requirement. |
| SQL aggregation via Drizzle `count(*) filter` + `GROUP BY` + `date_trunc` | Dedicated analytics DB (ClickHouse), timescale, or DuckDB/Mosaic server-side | Only if stats volume grows by multiple orders of magnitude (millions of rows, burst queries); premature today. |
| Postgres-native time bucketing (`date_trunc`) | JS-side bucketing (`date-fns` + row mapping, `date-fns@4.4.0` already installed) | Bucket in SQL to keep aggregation server-side and avoid pulling all rows; JS bucketing only if timezone-specific bucket keys are required. |
| Existing Nitro `defineEventHandler` + Effect | Standalone REST framework, `tRPC`, `oRPC` | No new API transport — the module already ships Nitro handlers and the admin/self auth pattern. |
| `galaxy_rbac.is_admin()` for admin stats | Hard-coded admin list, separate admin role check via `roles`/`userRoles` join | Prefer the RLS-level `is_admin()` (already used by the monitoring table policy it must stay consistent with); the API-level `roles` join in `monitoring/admin.get.ts` is also existing and fine — keep whichever the two monitoring endpoints already use. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| New survival/audit table | `analysis_monitoring` already is the durable survival record with outcome reconciliation wired in; a parallel table forks the data | Reuse `analysis_monitoring` |
| New job-queue / analytics engine (Redis, BullMQ, pgmq, DuckDB server-side) | Out of scope per PROJECT.md; scheduled-task + Postgres aggregation is sufficient and already architecture | Postgres SQL aggregation in the stats query layer |
| New ORM or migration tool | Drizzle is established for galaxy + galaxy_rbac schemas | Drizzle ORM + Drizzle-Kit |
| Server-side vis library (D3/Mosaic) | This milestone is API-only, no UI | Return plain JSON stats payloads |
| `date-fns` for bucketing | Bucketing is cleaner in SQL and keeps rows out of the app | `date_trunc` via Drizzle `sql` |

## Stack Patterns by Variant

**If you need per-workflow usage grouped by outcome (matrix):**
- Use `GROUP BY analysisMonitoring.workflowId, analysisMonitoring.outcome` + `count(*) filter (where outcome = 'success')` style columns, mapping to a nested response server-side.
- Because there is a unique partial index on `analysis_id` and multiple rows per workflow are fine.

**If you need admin global stats:**
- Mirror `getAllAnalysisMonitoringCounts` (no `ownerId` filter), and gate the endpoint with the
  same admin check the existing `monitoring/admin.get.ts` uses — a single, consistent source.

**If you need a trend with a specific timezone (e.g. `America/New_York` daily buckets):**
- Pass a `timezone` query param and use `date_trunc('day', started_at AT TIME ZONE $tz)` in the
  `sql` expression; validate the timezone string against the IANA list server-side. Default to UTC.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `drizzle-orm@^1.0.0-beta.16` (`catalog:`) | resolves to `1.0.0-rc.4` in the lockfile; vendored source for rc.4 is the reference | NOTE: the npm `latest` dist-tag for `drizzle-orm` surfaced `0.45.x` in a registry snapshot (registry ambiguity, **MEDIUM confidence**) — do not "fix" the catalog based on `latest`; the project's resolved `1.0.0-rc.4` is what the codebase and vendored reference match. Treat any version bump as out-of-scope for v1.3. |
| `effect@^3.19.6` (`catalog:`) | resolves ~`3.22.0` | Existing `Drizzle`/`Layer` pattern unaffected. |
| `postgres@^3.4.7` | current `3.4.9` | No change. |
| `drizzle-orm/supabase` (`authenticatedRole`, `authUid`) | current Drizzle | Already used by `analyses` and `analysis_monitoring` policies. |

## Sources

- First-party repo source (HIGH): `db/schema/galaxy/analysisMonitoring.ts`, `utils/grizzle/analysisMonitoring.ts`, `api/db/analyses/monitoring.get.ts`, `api/db/analyses/monitoring/admin.get.ts`, `utils/grizzle/analyses.ts` (survival + write path), `tasks/galaxy/sync-analyses.ts`, `db/schema/galaxyRbac/`, `pnpm-workspace.yaml` catalogs, lockfile resolved versions.
- npm registry snapshots for `drizzle-orm`/`drizzle-kit`/`postgres` current tags (MEDIUM — `latest` tag ambiguous for drizzle 1.x; resolved project version taken from lockfile).
- Vendored references: `drizzle-orm@v1.0.0-rc.4` (aggregation API), `effect` (DI/Layer idioms — see AGENTS.md).

---
*Stack research for: per-user analysis usage statistics (v1.3, GaaS)*
*Researched: 2026-08-10*
