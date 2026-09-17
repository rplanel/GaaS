# Feature Research

**Domain:** Per-user analysis usage statistics (Galaxy analysis runs)
**Researched:** 2026-08-10
**Confidence:** HIGH

## Scope Note

This research covers ONLY the v1.3 milestone features: per-user usage statistics served via
server API (no UI). It is grounded in the actual codebase (the `nuxt-galaxy` package) rather
than generic vendor feature lists, so every "feature" below is tied to a concrete existing or
missing capability. Two prior research passes exist in this directory
(`FEATURES.md`/`SUMMARY.md` at 14:43–14:46) written before the milestone was redefined to
Analysis Usage Statistics; this file supersedes them for the stats domain.

## Critical Grounding Finding (read this first)

The project ALREADY has a durable, deletion-surviving, owner-scoped record of every analysis
outcome: the **`analysis_monitoring`** table
(`src/runtime/server/db/schema/galaxy/analysisMonitoring.ts`).

- Columns: `ownerId`, `workflowId`, `name`, `startedAt`, `completedAt`,
  `outcome` (`pending|success|error|cancelled`), `galaxyInvocationId`, `errorMessage`.
- **It already survives analysis deletion**: `analysisId` FK is `onDelete: 'set null'`, so the
  monitoring row persists with the analysis id nulled while keeping `ownerId`/`workflowId`/
  `outcome`/`completedAt`.
- **Write path already exists**: a row is inserted on analysis persist
  (`insertAnalysisMonitoringEffect`) and the outcome is updated when the sync task reconciles
  the terminal state (`updateAnalysisMonitoringEffect` via
  `deriveInvocationOutcomeFromJobsSummary`).
- **Counts already exist**: `getAnalysisMonitoringCounts(ownerId)` and
  `getAllAnalysisMonitoringCounts()` already return `{ total, success, error, cancelled,
  pending }`, wired to `GET /api/db/analyses/monitoring` (self) and
  `/api/db/analyses/monitoring/admin` (via `galaxy_rbac`).
- **RLS already exists**: self rows via `ownerId = authUid()`, admin via
  `galaxy_rbac.is_admin()`.

**Implication:** the "durable survival record" the milestone calls for is largely already
built as `analysis_monitoring`. The milestone's Key Decision says *"Minimal survival record over
a full append-only audit log"* and frames building a *new* per-analysis record — but a parallel
new table would DUPLICATE `analysis_monitoring`. The roadmap MUST decide **reuse `analysis_monitoring`
(extend with new query dimensions) vs. build a separate minimal `analysis_usage` table**, and
should bias strongly toward reuse (see FEATURE Dependencies → The Fork).

### What is genuinely NEW for the four milestone stats

| Milestone stat | Status today |
|----------------|--------------|
| Total analyses per user | ✅ exists (`monitoring` counts `total`) |
| Success/error breakdown | ✅ exists (`success`/`error`/`cancelled`/`pending`) |
| Per-workflow usage | ❌ missing — no `GROUP BY workflowId` query or endpoint |
| Time-bucket trends | ❌ missing — no time-bucketed (`date_trunc`) query or endpoint |

So the features that actually need building in v1.3 are **per-workflow usage** and **time-bucket
trends** (plus wiring them into a stats API and completing the survival guarantee if a new table
is chosen).

---

## Feature Landscape

### Table Stakes (Users Expect These)

A usage-stats API that lacks any of these feels broken. All are expected core counting/breakdown
capabilities.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Total analyses per user | The headline "how much have I used" number; every usage system has it | LOW | Already served by `monitoring` counts; fold into stats contract for a single call site |
| Outcome breakdown (success / error / cancelled) | Users need to know their success rate, not just volume | LOW | `success`/`error`/`cancelled` present; decide whether final contract collapses `pending` separately or excludes it from "final outcomes" |
| Durable survival of statistics past analysis deletion | Core differentiator, but users *assume* their usage history isn't erased when they archive/delete an analysis | MEDIUM | Provided by `analysis_monitoring` (FK set-null). Must be verified end-to-end with a delete test |
| Self-scoped reads (each user sees own stats) | Privacy baseline; a user must never see another user's usage | LOW | RLS `ownerId = authUid()` exists; replicate for any new table |
| Admin/operator global read | Operators need cross-user totals; milestone explicitly requires it | MEDIUM | `getAllAnalysisMonitoringCounts` + `galaxy_rbac.is_admin()` exist; extend to workflow/trend variants |
| Per-workflow usage counts | Users run multiple workflows and need "how many runs per workflow" to pick tools | MEDIUM | NEW. GROUP BY `workflowId`, join `workflows.name`; no existence today |
| Time-bucket trends | Users want "is my usage growing week over week" — the reason to build stats, not just a counter | MEDIUM | NEW. `date_trunc` on `completedAt` (or `startedAt`); daily + weekly granularity |

### Differentiators (Competitive Advantage)

These align with the GaaS Core Value (observable, reliable behavior) and the milestone's explicit
decisions. Not required to function, but they are where the feature competes.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Terminal-outcome accuracy from jobs-summary derivation | Success/error is trustworthy, not a naive "did the API return OK" proxy | LOW | Reuses existing `deriveInvocationOutcomeFromJobsSummary`; guarantees the outcome reflects real job failure, not request success |
| Minimal survival record over append-only audit log | Delivers stats with far less storage/write complexity; surgical decision already made in PROJECT.md | LOW | `analysis_monitoring` is one-row-per-analysis, updated in place — exactly this, not an event stream |
| Stable, documented JSON response contract | Deterministic shape (`total`, `byOutcome`, `byWorkflow`, `trend`) makes the API consumable by the future UI and by LLM/CI consumers | MEDIUM | Define once in `types/nuxt-galaxy.ts`; version explicitly |
| Consistent time-bucket semantics (UTC, ISO week) | Trends that don't shift with deploy server timezone or locale — credible for reporting | MEDIUM | Standardize `date_trunc('week')` on UTC `completedAt`; document bucket boundaries |
| Single query surface per access level (self vs admin) | One stats endpoint per role that returns all four views, not a menu of fragmented routes | MEDIUM | Contrast with today's fragmented `monitoring`/`monitoring/admin` routes |

### Anti-Features (Commonly Requested, Often Problematic)

The milestone is deliberately "server API only, no UI, no quotas, no billing." These are the traps
to explicitly NOT build.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time dashboards / live WebSocket counters | Live counters feel impressive and "modern" | Adds Realtime/channel complexity, cache invalidation, and UI scope that contradicts the no-UI milestone; live counts have no reporting value | Serve point-in-time snapshots over plain HTTP; a live view, if ever wanted, is a future UI milestone |
| Per-user quotas / usage limits (enforcement) | Common adjacent ask once you can count usage | Metering/enforcement is a product & billing decision with RBAC, firmware/limits, upgrade flows — far beyond stats | Count usage only; quota *policy* is a separate milestone if desired |
| Full append-only audit log (every state transition) | "If we're storing stats we might as well keep every event" | Turns a one-row-per-analysis record into an event stream: more writes, ordering/immutability rules, higher storage, more failure modes | Keep the minimal survival record; append-only auditing is its own deliverable and was explicitly deprioritized |
| Chart-ready / visualization endpoints (data shaped for D3) | Pretties up the API for a future UI | Tooling-coupled payloads leak visualization concerns into the data contract; the milestone has no UI | Return plain, well-typed counts/trends; let the future UI shape them |
| Hourly / sub-daily time buckets | "More granular = more useful" | Sub-daily buckets are sparse noise for analysis runs and balloon the response | Daily + weekly only |
| Precomputed/materialized rollup counters (monthly totals table) | "Faster queries at scale" | Premature at this workload; adds a denormalized write path and refresh jobs for marginal read gains at 10³–10⁵ rows | Read-time GROUP BY over indexed columns; revisit only if 10^7+ rows |
| Cross-user / aggregate-into-self for regular users | Admins want totals, regular users start asking for peers' usage | Leaks other users' data; violates self-scoped reads | Only admin role sees global; enforce in RLS and handler |
| Blending live and deleted analyses into an ambiguous "total" | One number for everything | Mixing the live `analyses` table with the survival record yields double-count or double-omission confusion | Stat all outcomes from ONE source (the survival record), never from a live-table join for totals |

---

## Feature Dependencies

```
[Durable survival record]
    └──requires──> [analyses persist write-path]      (existing: insertAnalysisMonitoringEffect)
    └──requires──> [sync reconcile write-path]        (existing: updateAnalysisMonitoringEffect)

[Per-workflow usage]      ──needs──> [survival record w/ workflowId]
[Time-bucket trends]      ──needs──> [survival record w/ completedAt/startedAt]

[Self-scoped reads]       ──needs──> [Supabase auth identity]   (existing)
[Admin global read]       ──needs──> [galaxy_rbac is_admin]     (existing)

[Stats API endpoints]     ──needs──> [per-workflow + trend queries]
                           ──enhances──> [existing total/breakdown queries]

[New analysis_usage table]  ──alternate-to──> [existing analysis_monitoring]
```

### Dependency Notes

- **[All four stats] require [a durable survival record]:** the milestone decision
  "Stats computed from a durable survival record, not live `analyses`" means every stat sources
  from a record that outlives the `analyses` row. `analysis_monitoring` already provides this;
  if a new table is chosen it must be written on persist and reconciled on sync (duplicating the
  existing write path).
- **[Per-workflow usage] needs [survival record w/ workflowId]:** grouping is by `workflowId`,
  joined to `workflows` for display name — the record must keep the FK (it does).
- **[Time-bucket trends] needs [survival record w/ timestamps]:** bucketing by
  `date_trunc('week'/'day')` on `completedAt` (falls back to `startedAt` for terminal rows where
  sync set outcome but ordering matters). Requires the record to persist the timestamp (it does).
- **[Stats API] enhances [existing monitoring counts]:** the from-scratch stats endpoint can
  either reuse `getAnalysisMonitoringCounts*` for the total/breakdown view or supersede it —
  avoid two parallel routes answering the same question.
- **[New analysis_usage table] ALTERNATE-TO [existing analysis_monitoring]:** THE fork. See below.

### The Fork (roadmap must resolve)

```
Option A — Reuse & extend `analysis_monitoring` (RECOMMENDED)
   - No new table, no new persist/sync write path, no new RLS.
   - New work is purely the two missing query dimensions (per-workflow GROUP BY,
     time-bucket date_trunc) + a stats endpoint that includes the existing counts.
   - analysis_monitoring is already one-row-per-analysis, updated in place, survives deletion:
     the exact "minimal survival record" the milestone describes.
   - Caveats: the table carries display-ish fields (name, errorMessage) and a partial unique
     index on analysisId (fine for 1:1 stats); "minimal" purists may find it slightly heavier.

Option B — New minimal `analysis_usage` table
   - Cleaner semantic separation ("usage" vs "monitoring") and a truly minimal column set.
   - Cost: new schema + new persist write + new sync reconcile write + new RLS + backfill from
     existing analyses, all duplicating logic that already exists and is tested.
   - Only justified if "monitoring" is planned to become an append-only audit log later (which
     the milestone explicitly does NOT want).
```

**Recommendation:** Option A. The milestone's own decision *"Minimal survival record over a full
append-only audit log"* is satisfied by the existing `analysis_monitoring`, and Option B rebuilds
an already-built, already-tested write path. If a new table is still chosen, Phase 1 must include
backfill + parity tests against `analysis_monitoring`.

---

## MVP Definition

Scope is the v1.3 milestone only (server API, no UI). Natural phase split:

### Launch With (v1.3)

- [ ] Resolve the fork: confirm reuse of `analysis_monitoring` (preferred) OR stand up + write
      a minimal `analysis_usage` table — with an end-to-end test proving outcomes survive
      analysis deletion.
- [ ] Per-workflow usage query (Group by workflowId, join name) + self/admin variants.
- [ ] Time-bucket trend query (`date_trunc` weekly/daily on completedAt) + self/admin variants.
- [ ] Stats API endpoint (self-scoped) returning the four-view contract; reusing existing counts
      where already computed.
- [ ] Admin stats endpoint (gate via `galaxy_rbac.is_admin()`) for global totals.
- [ ] Drizzle index on (`ownerId`, `workflowId`) and (`ownerId`, `completedAt`) if not present to
      keep trend/per-workflow queries read-time fast.
- [ ] evlog wide-event emission on the stats endpoints per LOGGING-SPEC (no secrets).
- [ ] Tests: survival-across-delete, per-workflow grouping, time bucketing, self vs admin RBAC.

### Add After Validation (v1.4+)

- [ ] Stats UI milestone — a read-only dashboard rendering the same API contract (explicitly
      deferred out of v1.3).
- [ ] Optional filters on the stats API (date range, workflow subset) once a UI drives them.
- [ ] Paging/aggregation options for very large histories, only if read-time GROUP BY degrades.

### Future Consideration (v2+)

- [ ] Append-only audit log / full event history (explicitly out of scope; would then justify a
      separate table distinct from the minimal survival record).
- [ ] Per-user quotas / usage enforcement (product & billing decision; not a stats feature).
- [ ] Materialized rollups (only at 10^7+ rows; premature now).

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Durable survival of stats across deletion | HIGH | MEDIUM (reuse: LOW; new table: HIGH) | P1 |
| Total analyses + outcome breakdown contract | HIGH | LOW | P1 |
| Per-workflow usage counts | HIGH | MEDIUM | P1 |
| Time-bucket trends (daily/weekly) | HIGH | MEDIUM | P1 |
| Self-scoped reads (RLS) | HIGH | LOW (exists) | P1 |
| Admin global stats endpoint (RBAC) | MEDIUM | MEDIUM | P1 |
| evlog wide-event observability on stats API | MEDIUM | LOW | P2 |
| Optional date-range/workflow filters | MEDIUM | MEDIUM | P2 (v1.4) |
| Stats UI dashboard | HIGH | HIGH | P2/P3 (future milestone) |
| Quotas / usage limits | MEDIUM | HIGH | Anti-feature → defer |
| Append-only audit log | LOW for stats | HIGH | Anti-feature → defer |
| Real-time counters | LOW | HIGH | Anti-feature → never |

**Priority key:**
- P1: Required for v1.3 (all four stats + survival + RBAC access)
- P2: Strengthens the deliverable; not blocking
- P3 / anti-feature: explicitly deferred or rejected

---

## Competitor Feature Analysis

| Feature | Galaxy usage (analog) | Typical CI usage (GitHub Actions etc.) | Our Approach |
|---------|-----------------------|----------------------------------------|--------------|
| Total usage | Counts available via queries over histories | "Total runs" counter per repo/user | Count over durable `analysis_monitoring` (survives delete) |
| Outcome breakdown | Job states available per invocation | Pass/fail/cancelled run counts | Terminal outcome derived from jobs-summary; includes cancelled |
| Per-workflow usage | Not surfaced in Galaxy UI front-and-center | Per-pipeline / per-workflow run counts | New GROUP BY workflowId query |
| Time trends | Ad-hoc | Activity/usage charts (weekly/daily) | `date_trunc` on completedAt; daily + weekly |
| Deletion survival | Galaxy retains history independently | CI keeps run history even when a run is deleted | FK `set null` keeps the stat row; test-locked |
| Real-time view | Galaxy updates invocation state | Live "in progress" panels | Explicitly NOT built (anti-feature) |

---

## Sources

- Ground truth: `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analysisMonitoring.ts`,
  `.../utils/grizzle/analysisMonitoring.ts` (insert/update/counts, terminal-outcome derivation),
  `.../utils/grizzle/sync/analysis.ts` + `.../tasks/galaxy/sync-analyses.ts` (reconcile write path),
  `.../api/db/analyses/monitoring.get.ts` + `monitoring/admin.get.ts` (existing self/admin routes,
  RBAC pattern), `.../db/schema/galaxy/analyses.ts` (persist path, RLS pattern),
  `.../types/nuxt-galaxy.ts` (`AnalysisMonitoringCounts`).
- Decision ground truth: `.planning/PROJECT.md` (v1.3 goal, Key Decisions: survival record,
  minimal-over-audit-log, no-UI, server-API-only).
- Domain norms (usage-stats systems): CI throughput dashboards, Galaxy history semantics,
  billing-meter style count/trend patterns — MEDIUM confidence, applied as anti-feature and
  scoping heuristics rather than hard requirements. No web lookups performed; codebase + project
  decisions are the authoritative source for this internal-deliverable milestone.

---
*Feature research for: Analysis Usage Statistics (v1.3)*
*Researched: 2026-08-10*
