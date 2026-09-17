# Pitfalls Research: Per-User Analysis Usage Statistics

**Domain:** Deletion-surviving, per-user usage statistics over an existing sync-backed analysis lifecycle (GaaS v1.3)
**Researched:** 2026-08-10
**Confidence:** HIGH for code-grounding (schema, sync task, delete path, RLS read verbatim); MEDIUM for generic data-aggregation/time-series patterns

> **Note:** A prior `.planning/research/PITFALLS.md` covered the **analysis audit trail** feature. PROJECT.md Key Decisions later rejected the audit log in favor of a **minimal survival record** (`analysis_monitoring`) for v1.3 usage statistics. This file supersedes that one and is scoped to the current milestone.

**Grounded survival record (verified in code):** `analysis_monitoring` already exists with `analysisId` FK `onDelete: 'set null'`, `ownerId` (FK, **no** onDelete → restricts user delete), `workflowId` (integer NOT NULL, **no** FK), `name`, `startedAt`/`completedAt` (timestamptz), `outcome` enum (`pending|success|error|cancelled`, NOT NULL default `pending`), `galaxyInvocationId`, `errorMessage`. Outcome is written **only** by the sync task (`updateAnalysisMonitoringOutcome`), guarded by `WHERE outcome = 'pending'`. The delete handler (`deleteAnalysis`) drops the analyses row and lets monitoring survive via `set_null`, but does **not** reconcile its outcome.

## Critical Pitfalls

### Pitfall 1: Stats Queries Join `analyses` and Drop Deleted Analyses

**What goes wrong:**
The entire point of the survival record is that usage counts must not shrink when a user deletes an analysis. If the new stats/aggregation layer joins `analysis_monitoring` to `analyses` (or filters `WHERE analysis_id IS NOT NULL`), every row that survived deletion (`analysis_id` is `NULL` after `set_null`) silently disappears from totals, per-workflow counts, and trends. The stats then *under-count* exactly the history they exist to preserve — the feature fails its core purpose and looks "fine" because the numbers are plausible.

**Why it happens:**
`analysis_monitoring.analysis_id` is a nullable FK. Developers reaching for "the analysis and its stats" naturally write `.innerJoin(analyses, eq(m.analysisId, a.id))`, which nulls out survivors. The pre-existing monitoring table already works standalone; the temptation is to reuse the `analyses`-join-shaped query helpers.

**How to avoid:**
- Aggregate **exclusively** over `analysis_monitoring`; never join `analyses` in a stats query. The survival row already carries `owner_id`, `workflow_id`, `galaxy_invocation_id`, `started_at` — everything the four stats need.
- Treat `analysis_id` as an optional provenance pointer, not a join key, for statistics.
- If any query truly needs it, use `leftJoin` and count `NULL` joins explicitly as "deleted" rather than excluding them.

**Warning signs:**
- A stats `SelectQueryBuilder` contains `.innerJoin(... analyses ...)`.
- A regression test "delete an analysis then re-run stats" is missing or asserts a lower total.

**Phase to address:** **Data/query layer** (stats aggregation build). Verification = count unchanged after deletion test.

---

### Pitfall 2: Delete Leaves Immortal `pending` Rows (Never-Finalized Outcome)

**What goes wrong:**
`deleteAnalysis` deletes the analyses row (monitoring survives) but never touches `analysis_monitoring.outcome`. If the user deletes an analysis while it is still `pending` (either mid-run, or before the scheduled sync ever reached a terminal state), the survival row is frozen at `outcome = 'pending'` forever. Every "total analyses" now includes ghost runs that will never resolve; success/error splits and per-workflow counts are wrong; trends show phantom in-flight entries.

**Why it happens:**
The milestone says "final outcome preserved on deletion," but the existing delete handler only deletes and calls Galaxy's `deleteHistory`. Nobody reconciled the still-pending survival row. Because the sync task is the "sole writer," the instinct is to leave outcome writes to it — but the task never runs against a row whose analyses record is gone (it selects from `analyses`).

**How to avoid:**
- Decide a closed set of terminal outcomes for deleted-never-resolved runs (e.g., finalize `pending` → `cancelled`/`abandoned` with `completed_at` set).
- In `deleteAnalysis`, **atomically** (same Drizzle transaction as the analyses delete) do: `UPDATE analysis_monitoring SET outcome='cancelled', completed_at=now() WHERE analysis_id=? AND owner_id=? AND outcome='pending'`. The `outcome='pending'` guard means a real terminal outcome written by the sync task is never clobbered.
- This is a second writer to `outcome`, so document the **writer matrix** explicitly: the sync task owns non-deleted transitions; the delete handler owns only `pending → cancelled` finalization. Keep both behind the `='pending'` guard.

**Warning signs:**
- `deleteAnalysis` has no monitoring write; no test deletes a pending analysis then asserts its row is finalized.
- A `pending` count that never decreases while users delete analyses.

**Phase to address:** **Delete-path integration** (write path). Verification = test: delete `pending` analysis → monitoring outcome is `cancelled`, and `cancelled` guard prevents overwriting a real `success`.

---

### Pitfall 3: Drift Between `analyses.state` and Survival `outcome`

**What goes wrong:**
In `syncAnalysisEffect`, the analyses row update and the monitoring outcome update are **two separate Supabase calls**, not a transaction. If the monitoring write fails (transient Supabase error) after the analyses state was already written as terminal, `analyses` says `completed`/`failed` while `analysis_monitoring` stays `pending`. Stats miss the completion; a user whose run *did* finish looks stuck/failed.

**Why it happens:**
The sync path uses the Supabase client for per-row writes rather than a Drizzle transaction spanning both tables. The `'pending'` guard makes it idempotent on retry (good), but there is no reconciliation that closes the gap when the final retry also fails, or when the analysis is deleted mid-gap.

**How to avoid:**
- Treat the analyses-state update and monitoring-outcome update as one logical "terminal transition"; keep the `'pending'` guard so any re-sync heals it.
- Add a **drift reconciliation** at the stats layer or a periodic sweep: find rows where `analyses` is terminal but `analysis_monitoring` still `pending` and re-derive the outcome (or flag them in admin counts).
- Prefer Drizzle transaction for the transition where the sync path can be migrated, so the two writes commit atomically.

**Warning signs:**
- No test that simulates analysis-terminal + monitoring-write-failure and checks reconciliation.
- Monitoring `pending` count exceeds analyses non-terminal count.

**Phase to address:** **Console/sync outcome reconciliation + stats build**.

---

### Pitfall 4: RLS Bypass → Ownership Leak in the Stats API

**What goes wrong:**
The server writes via the **service-role** client, which bypasses `analysis_monitoring` RLS (owner/admin policies). RLS therefore protects nothing on the server side. If the new self-scoped stats endpoint copies the admin `getAllAnalysisMonitoringCounts()` shape but forgets `.where(eq(analysisMonitoring.ownerId, user.id))`, any authenticated user reads **global / every-other-user's** stats. The data is real and sensitive (per-workflow usage, volumes), so this is a silent PII/tenant-separation breach.

**Why it happens:**
The project's server DB code runs as service role by design. The monitoring RLS policies (`select ... using owner_id = auth.uid()`) only guard direct client reads. A developer assumes "RLS handles scoping" and writes an unscoped service-role query for both the user and admin routes from a shared helper.

**How to avoid:**
- Make `ownerId` a **required parameter** of every self-scoped stats query; derive it from `getSupabaseUser(event).id`, never from client input.
- Structure the code so the admin (global) and user (owner-filtered) queries are **separate functions with different signatures** — do not let the user endpoint call the admin one with an optional owner.
- Re-verify admin via `galaxy_rbac.is_admin()` (as the existing `monitoring/admin.get.ts` does with the roles join) before any non-owner query.
- Keep summary endpoints returning only aggregates (counts). Never return `error_message`/`name` free text, even on the admin route, to avoid leaking user data beyond the aggregate.

**Warning signs:**
- User stats handler shares the admin aggregation helper with an optional/omitted owner filter.
- No test asserting a user with role `user` cannot read another user's per-workflow counts.

**Phase to address:** **Server query layer + API endpoints** (both routes). Verification = RLS/identity test with two seeded users; user route returns only own rows.

---

### Pitfall 5: Orphaned `workflow_id` Breaks Per-Workflow Aggregation

**What goes wrong:**
`analysis_monitoring.workflow_id` is `integer NOT NULL` with **no foreign key** to `workflows` (unlike `analyses.workflow_id`, which is a real FK). Per-workflow stats therefore join `analysis_monitoring.workflow_id` to `workflows.id` to get a name; if any workflow is gone or the join misses, those rows fall into an "unknown workflow" bucket or are dropped. Because monitoring rows survive analysis deletion, they can reference workflows no longer referenced by any live analysis — and since `analyses.workflow_id` is a restrictive FK, a workflow *can't* be deleted while analyses reference it, but nothing protects monitoring's copy.

**Why it happens:**
`workflowId` was denormalized into monitoring (no FK) for survival, but the aggregation still assumes it resolves. The `analyses.workflow_id` FK can't be deleted while analyses exist, giving false confidence that workflow ids always resolve.

**How to avoid:**
- Define per-workflow stats over `(workflow_id, count)` keyed by id, and make the **name a best-effort left join** with an explicit `unknown` bucket when the join misses.
- Decide explicitly whether per-workflow stats expose the id, the name, or both; return `workflowId` always so orphaned buckets are still attributable.
- Add an index on `(owner_id, workflow_id)` before building this query.

**Warning signs:**
- Per-workflow query counts rows whose `workflowId` is not present in `workflows` and silently omits them.
- No test where a monitoring row references a non-existent workflow id.

**Phase to address:** **Stats aggregation build** (per-workflow query).

---

### Pitfall 6: Backfill/Migration Guesses Historical Outcomes or Breaks Existing Rows

**What goes wrong:**
If v1.3 adds columns to `analysis_monitoring` (e.g., a bucketing helper, workflow-name denormalization) or backfills survival rows for analyses that predate the monitoring table, two disasters are possible: (a) the migration **guesses** a terminal outcome for historical analyses without re-syncing Galaxy, corrupting historical success/error rates; or (b) a non-null backfilling/changed column fails against existing rows (the table already holds live data and possibly `analysis_id = NULL` survivor rows from prior deletions).

**Why it happens:**
Retroactive data-feeding is speculative. "Historical outcome is unknowable without Galaxy" — guessing `success`/`error` invents data; guessing `pending` is honest but inflates `pending` until the next sync. Existing survivor rows (deleted analyses) have `analysis_id = NULL`; any backfill that re-links or assumes a live analysis breaks them.

**How to avoid:**
- Keep any new column **additive/nullable**; run migrations with `supabase:db:reset` + seed plus a real-data smoke test before committing.
- **Do not guess terminal outcomes.** Backfill only what is known (`owner_id`, `workflow_id`, `galaxy_invocation_id`, `started_at`); leave `outcome='pending'` and let the sync task reconcile — but only if an analyses row still exists to sync. For deleted survivors, leave them pending or mark `abandoned` (per Pitfall 2) — never `success`/`error`.
- Reuse the existing partial unique index on `analysis_id WHERE NOT NULL` to guarantee one survival row per live analysis; guard against a stray duplicate `galaxy_invocation_id`.

**Warning signs:**
- Migration `UPDATE ... SET outcome = 'success'` for historical rows.
- Migration makes a new column `NOT NULL` against a table with existing orphan/survivor rows.

**Phase to address:** **Schema/migration + backfill** (first data phase). Verification = run migration over seeded + deleted-survivor fixture; assert no guessed outcomes and no constraint failure.

---

### Pitfall 7: Inconsistent Trend Semantics (Timestamp Source, Time Zone, Pending Rows)

**What goes wrong:**
Trend queries can use `startedAt` or `completedAt` as the bucket key. `completedAt` is `NULL` for every `pending` row, so trend-over-completed-count yields fewer rows than `count(*)` total — totals and the trend series disagree, confusing any consumer. Separately, mixing UTC and viewer-local bucketing (or naive local time) produces double-counted/empty buckets across DST, and bucketing `timestamptz` with a non-deterministic zone makes server output non-reproducible.

**Why it happens:**
"Time of the analysis" is ambiguous (created vs finished). `startedAt` is always set (lifespan), `completedAt` only when terminal. For a no-UI API milestone, the safest deterministic choice is rarely made explicit, and developers mix the two sources in one report.

**How to avoid:**
- Choose **one** canonical timestamp for usage trends = `started_at` (always present, includes in-flight+deleted survivors = matches `total`). Reserve `completed_at` for a separate "completion time" report if ever needed.
- Bucket server-side with `date_trunc('day', started_at AT TIME ZONE 'UTC')` and return ISO-8601 (UTC) bucket keys so client/report consumers can convert. Document that buckets are UTC.
- Keep `outcome` closed (enum) so `pending+success+error+cancelled == total` always; decide whether "success rate" is `success/total` or `success/(success+error)` and document it.

**Warning signs:**
- Trend query buckets by `completed_at` and its row sum ≠ the endpoint's `total`.
- Buckets use `started_at` in one query and `completed_at` in another without an explicit, documented policy.

**Phase to address:** **Stats aggregation build** (trends + normalization). Verification = a test asserting sum(bucket counts) == total with pending + deleted survivors present.

---

### Pitfall 8: Secrets / Sensitive Free-Text Leak Through Stats Data or Logs

**What goes wrong:**
`analysis_monitoring.error_message` is the analysis `stderr` — it can contain file paths, dataset/parameter details, even user-supplied strings. If any stats endpoint returns `error_message` or row-level `name`, and if the sync/stats path logs `errorMessage`, the milestone leaks data against the "no secrets / no PII in logs" convention. The survival rows are long-lived (deletion-surviving), so any leak is permanent.

**Why it happens:**
The existing `getAnalysisMonitoringCounts` returns only counts, but extending to per-workflow/trend/row endpoints invites returning `name`/`error_message` "for free." evlog's sync path already logs `derivedOutcome`/`state`/`outcome` (allowlisted, fine) but a future `log.info('stats', { errorMessage })` breaks LOGGING-SPEC.

**How to avoid:**
- Stats APIs return **aggregates only** (counts per outcome/workflow/time-bucket). Never return `error_message` or raw `name` from any stats endpoint; if row detail is needed for another purpose, it belongs to a different, owner-scoped endpoint.
- Follow `.planning/LOGGING-SPEC.md` sync trace allowlist (`analysisId`, `ownerId`, `galaxyInvocationId`, `historyId`, `jobId`, `datasetId`, `state`, `isSync`, `derivedOutcome`, `outcome`). Do not log `errorMessage`, `name`, or `stderr`.
- Treat long-lived survival rows as sensitive storage: only aggregates cross the API boundary unless an explicit owner-scoped detail route is added.

**Warning signs:**
- Stats endpoint returns `errorMessage`/`name` in the response type.
- Sync/stats code `log.*` an `errorMessage` or `stderr` field.

**Phase to address:** **API endpoints + logging review** (verification against LOGGING-SPEC).

---

### Pitfall 9: Ambiguous "Sole Writer" Invariant → Outcome Writes From Multiple Places

**What goes wrong:**
`PROJECT.md` codifies "the scheduled task is the sole mutator of sync state." v1.3 needs the survival record written on persist (HTTP handler), outcome-updated by the sync task, and final-outcome-preserved on delete (HTTP handler). Without an explicit writer matrix, a later developer adds an outcome update in the client or an unrelated route, and two writers race on `outcome` (e.g., a `pending → success` from sync clobbered by a `pending → error` from a bad reconcile, or vice-versa).

**Why it happens:**
The invariant was written for `analyses` sync **state**. The survival record's `outcome` is a distinct field whose writers are not yet defined, so "sole writer" gets misapplied (either nobody touches it — Pitfall 2 — or everyone does).

**How to avoid:**
- Center all `outcome` writes in **one module** (`analysisMonitoring` util) with a single guarded transition helper: `UPDATE ... SET outcome=?, completed_at=? WHERE galaxy_invocation_id=? AND owner_id=? AND outcome='pending'`. Enforce the guard everywhere; a real terminal outcome is immutable once set.
- Document the writer matrix in the milestone: sync task (non-deleted transitions), delete handler (`pending → cancelled` only). Client code must not write `analysis_monitoring`.
- Keep the existing RLS `update` policy (owner-only) and add a test that an outcome transition is applied at most once.

**Warning signs:**
- `analysisMonitoring` writes appear outside `utils/grizzle/analysisMonitoring.ts` + `sync/analysis.ts` + the delete handler.
- Two code paths call `updateAnalysisMonitoring*` without the `'pending'` guard.

**Phase to address:** **Write path design** (single guarded writer module).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Join stats to `analyses` to "get more fields" | One familiar query | Deleted analyses drop out of stats (Pitfall 1) | Never for stats; use the survival record alone |
| Leave `pending` rows unfinalized on delete | Skip delete-path logic | Eternal ghost counts; wrong success/error splits | Never; finalize `pending→cancelled` atomically |
| Guess historical outcomes in a backfill | Looks complete fast | Corrupts immutable historical rates | Never; backfill known fields only, mark `pending`/`abandoned` |
| Reuse the admin aggregation helper for the user route | Fewer functions | Owner-scoping can be silently omitted (security leak) | Never; separate functions w/ mandatory `ownerId` |
| One `started_at`/`completed_at` mix for trends | Fewer queries | Totals ≠ trend sums; confusing reports | Never; pick `started_at`, document it |
| Return `error_message`/`name` from stats endpoints | Extra data | Permanent PII/stderr leak in long-lived rows | Never for summary endpoints |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Supabase service-role client | Assuming RLS scopes server queries | Explicit `ownerId` filter in every self-scoped query; RLS only guards direct client reads |
| Drizzle/Supabase schema | Reusing `analyses` join helpers for stats | Aggregate over `analysis_monitoring`; never join `analyses` in stats |
| `set_null` FK semantics | Treating `analysis_id IS NULL` as "no data" | NULL = the analysis was deleted; count it as deleted survivor |
| Drizzle transaction | Non-atomic `analyses.state` + monitoring write in sync | Treat as one terminal transition; keep `'pending'` guard + drift reconciliation |
| `galaxy_rbac.is_admin()` | Adding admin route without identity re-check | Re-verify admin (roles join) before any non-owner query, as `monitoring/admin.get.ts` does |
| `workflow_id` (no FK) | Inner-join for per-workflow names | `workflowId` + best-effort name join with explicit `unknown` bucket |
| evlog sync traces | Logging `errorMessage`/`stderr`/`name` | Stick to the LOGGING-SPEC sync trace allowlist |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| No `(owner_id, started_at)` index | Trend bucketing scans per owner | Add index on `(owner_id, started_at)` | Hundreds of analyses per user |
| No `(owner_id, workflow_id)` index | Per-workflow counts slow | Add index on `(owner_id, workflow_id)` | Hundreds of workflows × many analyses |
| `count(*) filter (where outcome=...)` over an unfiltered table | Admin/global stats slow | Use the existing `(owner_id, outcome)` / `(outcome)` indexes; filter before counting | Thousands of rows |
| Row-level stats endpoints returning full rows (name/error) | Payload bloat + security exposure | Return only aggregates | Any scale; not a scale issue but a design bug (Pitfall 8) |
| `count(*)` per trend bucket in a loop | N+1 bucket queries | Single `GROUP BY date_trunc` query | > 365 buckets or high page traffic |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Omitted `ownerId` filter in self-scoped stats (service-role bypasses RLS) | Users read all users' stats | Mandatory `ownerId` param; separate user/admin functions; identity test |
| Admin route without `is_admin()` re-check | Users read global stats | Re-verify via `galaxy_rbac.is_admin()`/roles join |
| Exposing `error_message`/`name` in stats responses | stderr/PII leaked into permanent responses | Aggregates only; owner-scoped detail routes if ever needed |
| Logging `errorMessage`/`stderr`/`name` in sync/stats | Violates LOGGING-SPEC; persistent leak | Sync trace allowlist only |
| Backfill inventing outcomes | Fabricated historical stats | Never guess; mark unknown/pending |

## UX Pitfalls

This milestone has **no UI**, but the data model choices constrain the follow-up stats UI.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No clear "what does total include" semantics | Users can't tell if deleted/in-flight count | Define and document total = all survival rows; success rate = success/total |
| Per-workflow buckets with orphaned IDs | Stats UI shows "workflow #123" with no name | Return `workflowId` + best-effort name + `unknown` bucket |
| UTC buckets returned raw | Analysis in another tz looks mis-grouped on a UI | Return ISO-UTC keys; let the (future) client convert to local |
| Pending rows never resolving | Users see stuck "in progress" forever | Finalize `pending→cancelled` on delete (Pitfall 2) |

## "Looks Done But Isn't" Checklist

- [ ] **Survival:** Deleting an analysis does NOT change the user's stats totals; a regression test asserts counts are unchanged.
- [ ] **Finalization:** Deleting a still-`pending` analysis sets its survival outcome to `cancelled` (atomic, guarded), not immortal `pending`.
- [ ] **Owner scoping:** Self-stats endpoint passes mandatory `ownerId`; two-user test proves users see only their own rows.
- [ ] **Admin gate:** Global stats endpoint re-verifies `is_admin()` before querying.
- [ ] **No joins to `analyses`:** Stats aggregation references only `analysis_monitoring`.
- [ ] **No guessed backfill:** Migration backfills known fields only and leaves `outcome` honest (never fabricated).
- [ ] **Trends:** Sum of bucket counts == endpoint `total` (pending + deleted survivors included); buckets are UTC and documented.
- [ ] **Single guarded writer:** All `outcome` transitions go through one module with the `'pending'` guard.
- [ ] **No secrets:** Stats APIs/logs contain no `errorMessage`, `stderr`, `name`, tokens, or PII.
- [ ] **Indexes:** `(owner_id, started_at)` and `(owner_id, workflow_id)` exist before perf-sensitive endpoints ship.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Deleted analyses dropped from stats (join bug) | LOW (no data loss) | Fix query to aggregate over monitoring only; re-run; totals restore — no backfill |
| Immortal `pending` rows (delete never finalized) | LOW-MEDIUM | One-time `UPDATE monitoring SET outcome='cancelled', completed_at=now() WHERE outcome='pending' AND analysis_id IS NULL` (or exited scope); add delete-path finalization |
| Drift (analyses terminal, monitoring pending) | MEDIUM | Reconcile sweep re-deriving outcome from `analyses.state`/Galaxy; or recompute stats from monitoring on next sync |
| Ownership leak shipped | HIGH (PII exposure) | Immediately gate user endpoint behind mandatory `ownerId`; audit logged requests; rotate if any cross-tenant data observed |
| Guessed historical outcomes in backfill | HIGH (immutable corruption) | Preserve the migration, add a compensating `adopted` correction; prevent by never guessing |
| Orphaned workflow ids in per-workflow stats | LOW | Add `unknown` bucket and best-effort name join; do not drop rows |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Joins drop deleted analyses (P1) | Stats query build | Test delete then re-query stats → totals unchanged |
| Delete leaves `pending` rows (P2) | Delete-path integration | Test delete pending analysis → outcome `cancelled`; guard preserves real outcome |
| State/outcome drift (P3) | Sync reconciliation + stats build | Test sync-terminal + monitoring-write-failure → reconciled/finalized |
| RLS-bypass ownership leak (P4) | Server query layer + API endpoints | Two-user identity test; user route returns only own rows |
| Orphaned workflow ids (P5) | Stats aggregation build | Test monitoring row with non-existent workflowId → `unknown` bucket, not dropped |
| Backfill guesses outcomes (P6) | Schema/migration + backfill | Migration over seeded + deleted-survivor fixture; no fabricated outcomes |
| Trend semantics/tz (P7) | Stats aggregation build | Test sum(buckets) == total with pending + deleted survivors; UTC keys |
| Secrets/stderr leak (P8) | API endpoints + logging review | Review vs LOGGING-SPEC allowlist; no free text in responses |
| Multi-writer outcome (P9) | Write path design | Test outcome transition applied at most once; single guarded writer module |

## Sources

- [Project] `.planning/PROJECT.md` — v1.3 milestone scope, Key Decisions (survival record over audit log; "scheduled task is sole mutator of sync state").
- [Code] `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analysisMonitoring.ts` — survival record schema (`set_null` FK, closed outcome enum, indexes, RLS policies, `workflow_id` without FK).
- [Code] `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/analyses.ts` — owner FK (cascade), workflow FK (restrict), RLS policies.
- [Code] `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analyses.ts` — `insertAnalysis` (transaction inserts monitoring `pending`) and `deleteAnalysis` (deletes analyses; **no** monitoring reconciliation → Pitfall 2).
- [Code] `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/analysisMonitoring.ts` — single writer module, `'pending'` guard on outcome transitions, existing owner-scoped/admin counts.
- [Code] `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts` — `syncAnalysisEffect`/`updateAnalysisMonitoringOutcome`; non-atomic analyses+monitoring writes (Pitfall 3); service-role Supabase client.
- [Code] `packages/nuxt-galaxy/src/runtime/server/api/db/analyses/monitoring/admin.get.ts` — precedent for the `is_admin()` gate and aggregates-only admin shape.
- [Project] `.planning/LOGGING-SPEC.md` — sync trace field allowlist (`state`, `outcome`, `derivedOutcome`, scalar ids; no `errorMessage`/`stderr`/PII).
- [Project] `.planning/codebase/CONCERNS.md` — known `as any` casts in grizzle utilities and pre-existing integration-test gaps relevant to stats query type safety.
- [Prior research, superseded] `.planning/research/PITFALLS.md` (audit-trail iteration, 2026-08-10) — shared FK/survival/redaction reasoning; superseded because v1.3 chose the minimal survival record.

---
*Pitfalls research for: GaaS v1.3 Per-User Analysis Usage Statistics*
*Researched: 2026-08-10*
