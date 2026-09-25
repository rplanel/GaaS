# Workflow graph — design decisions

Status: **grilled and verified against the Galaxy API; not yet specified.** This
is the record of a design interview plus a later verification pass, written down
so the decisions survive a context reset. It is not a spec and not a ticket set;
both still wait on an explicit ask.

Goal: draw a Galaxy workflow as a graph (Vue Flow), used for two things — to
**invoke** a workflow with per-step parameters, and to **follow** a running
invocation. Prototypes live at `playground/app/pages/test/workflow-graph.vue`
(panel beside the canvas — preferred) and `workflow-graph-in-node.vue` (forms
inside the nodes — rejected, see below).

Verification provenance: `galaxyproject/galaxy@release_26.1` source and
`https://usegalaxy.eu/openapi.json` (reports Galaxy API 26.1.2.dev0), against
`https://galaxy.pasteur.fr/openapi.json` (22.05.1) and
`galaxyproject/galaxy@release_22.05`.

## Target Galaxy version — read this first

**Pasteur runs 22.05.1 today.** `GET https://galaxy.pasteur.fr/api/version`
answers `{"version_major":"22.05","version_minor":"1"}`. **An upgrade to 26.x is
imminent, and this refactor targets 26.x.**

That is a decision, not an observation. Several decisions below have no
supporting API on 22.05 and only become buildable after the upgrade:

Every "first available" below was checked release by release against
`galaxyproject/galaxy`, not estimated.

| Surface this design uses | 22.05 | First available |
|---|---|---|
| `version` honoured on invoke (the revision pin) | **ignored** | **24.1** |
| Invocation `messages` union | **absent** — no `schema/invocation.py`, no `WorkflowInvocationMessage` model | **23.0** (12 members; 14 by 26.1) |
| Conditional `when` on steps | **absent** — zero `when_expression` in the 22.05 model | **23.0** |
| `tool_uuid` / `when` on the live step dict | **absent** | **23.0** |
| `implicit_collection_jobs_id` on the invocation step dict | **absent** | **24.1** |
| `GET /api/invocations/{id}/request` | **absent** | **24.2** |
| `/api/tools/{id}/inputs`, `/parameter_request_schema` | **absent** | **26.0** |
| `/api/events/stream` | **absent** | **26.1** |

Available on both, so buildable before the upgrade: `step_details=true` and its
per-step `jobs` array, `require_exact_tool_versions` and the invoke-time
missing-tools check, `GET /api/workflows/{id}?version=N`,
`/api/workflows/{id}/versions`, export `position` and `input_connections`.

## Settled decisions

| # | Decision |
|---|---|
| Q1 | The graph appears in **both** places: invoking a workflow and following an invocation. |
| Q2′ | **One canvas, no `mode` prop.** It is driven by per-step *marks*. An edge animates when its source step is marked running. Invoke-mode and follow-mode differ only in which marks are supplied. |
| Q3 | Read the **live proxy** (`GET /api/galaxy/workflows/{id}`) — superseded in sequence by Q12, see below. |
| Q4 | Follow-mode reads **job rows from our own database**, not from Galaxy directly. |
| Q5 | **Step** and **Step state** are defined in `CONTEXT.md` (already written). A step state is not an Outcome. |
| Q6 | Layout is **left-to-right by default**; dragging is allowed; positions are **not persisted**. |
| Q7 | Reuse `AnalysisHistoryPanel`'s existing **per-job block** rather than inventing a second one. |
| Q8 | Vue Flow / dagre dependencies go in the **pnpm catalog**, not as loose ranges. |
| Q9 | On small screens the panel becomes a **slideover**. |
| Q10 | Mark **only what would refuse the submission** — no decorative warnings. |
| Q11 | The graph **refuses to draw** on a `revision_uuid` mismatch rather than drawing a stale shape. |
| Q12 | Source of truth becomes the **stored definition** (export shape), *not* the live API, sequenced after Q13(a). Originally "drop it if it costs more than it solves"; **now required** — the live shape drops edges. See below. |
| Q13 | **(a) + (b)**: one server endpoint returning `{steps, inputs, tools}` with server-side tool caching, plus one client composable over Pinia Colada. |
| Q14 | **Refactor first.** Exception: follow-mode may ship before the refactor, because it needs no tool definitions. |
| Q15 | Cache key is **`galaxy_id` + `revision`**, prefixed by the **Galaxy URL**, and only a *pinned* revision is cached. Revised, then built in #87 — see below. |
| Q16 | Tool definitions are cached **forever** per `toolId@version`, bounded by **the toolbox** rather than by size, and keyed by the version Galaxy **served**. No TTL. Revised, then built in #87 — see below. |
| Q17 | **Characterisation tests first** — pin today's payload, then change what feeds it. |
| Q18 | A **mapped step** (one step, many jobs) shows a **count badge** ("12/30 ok, 3 running"). Mechanism revised — see below. |
| Q19 | A **subworkflow step** is one node that **links out** to that subworkflow's own invocation graph. No inline expansion. |
| Q20 | **Skipped** and **Not started** are drawn differently. A conditional (`when`) step that did not run is not the same as one that has not run yet. |
| Q21 | A **paused step** is drawn as paused; the graph does **not** resume it. Resuming is a separate feature with an unanswered permission question (GaaS invokes under a service account). |
| Q22 | A pinned revision whose **tool versions are gone** is marked **before submit**, using the existing `missingToolsEffect`, **folded into** the Q13(a) endpoint's own tool fetch rather than run beside it. Revised, then built in #87 — see below. |

### Decisions whose premise verification changed

- **Q11** — the decision stands and the comparison it wants already exists and
  is correct (`versionState.ts:88`, on the export). What is unsettled is only
  *which payload the graph's refusal reads*: it cannot be the live one, which
  carries no per-revision uuid. Q12 dissolves the question.
- **Q12** — **now required, not droppable** (decided 2026-09-25). Three
  reasons, in descending weight: the live shape **loses edges** (below), so it
  cannot draw a correct graph for a fan-in workflow, and a graph that silently
  omits an edge is worse than no graph; Q11 has no per-revision uuid to compare
  against on the live payload; and reading the stored definition **removes** a
  Galaxy round trip rather than adding one, since the export is already fetched
  and stored at publish. The grill session mispriced it in both directions —
  see the export-schema defect below.
- **Q18** — the decision stands; the mechanism changes. `step_jobs_summary` is
  not per-step and cannot be joined to a step. Use `step_details=true` instead.
- **Q20** — has real backing on 26.x (`when_expression` exists); had none on
  22.05. Gated on the upgrade.

### What the #87 scope interview settled (2026-09-25)

Q13's endpoint was specified before anyone asked how a *distributed* package
caches, or which payload Q22's check reads. Four decisions changed.

- **Q16 — bounded by the toolbox, not by size.** A hard size bound means an
  in-process LRU, which is per-replica and lost on restart: right for a single
  Kubernetes replica, wrong for a package other people deploy. The substrate
  is a **Nitro storage mount** with a memory driver by default, exposed as a
  module option so a consumer with several replicas can point it at Redis. The
  bound comes for free instead: a tool definition is a few KB and the key space
  is "distinct tools this Galaxy holds", so it stops growing on its own.

- **Q16 — keyed by the version Galaxy *served*, never the one asked for.**
  `get_tool` resolves without `exact`, so Galaxy answers 200 with another
  installed version when it lacks the one requested (#75). Cached under the
  asked-for key, that would serve the wrong tool's parameters forever, with no
  TTL to heal it. This is the sharpest interaction between Q16 and Q22, and it
  only exists because the cache has no expiry.

- **Q15 — the Galaxy URL joins the key, and only pinned revisions are cached.**
  Two deployments sharing one Redis would otherwise cross-serve, and a built-in
  tool id (`Cut1`) carries no toolshed path to disambiguate it. And an
  *unpinned* read returns whatever Galaxy's latest revision is, which moves the
  moment someone saves in the editor — so the endpoint's route makes the
  revision mandatory, and the unpinned read has no route at all.

- **Q22 — folded into the tool fetch, not added beside it.** The endpoint
  fetches each pinned tool to answer `tools`; `missingToolsEffect` fetches the
  same tools to answer `missing`. Separately that is 2N round trips for N
  tools. One pass answers both: a tool served at the wrong version is at once
  "not a usable definition" and "missing".

  Q10 applied honestly also splits the verdicts. A 404 and a version mismatch
  **would** refuse the submission and so block it; an unreachable Galaxy would
  not, since it may be well again by the time the user submits. Parameter
  *values* come from the workflow's saved `tool_inputs`, not from the tool
  definition — the definition supplies only the widgets — so an unreachable
  tool means a step that cannot be **edited**, not one that would submit wrong.

Two corrections to what the refactor verdict below claims. The **four copies of
one derivation** are two in production plus two prototypes; the prototypes are
exempt from #87 and disposed of by #91, since converting them is work the real
graph throws away. And the existing
`GET /api/galaxy/workflows/:id/revisions/:revision/tools` endpoint is **kept**,
not replaced: `PublishVersionModal` reads it, and it answers "can this revision
be published" rather than "describe this workflow so it can be invoked".

### Q13(a), Q15, Q16 and Q22 as built (#87)

`GET /api/galaxy/workflows/:workflowId/revisions/:revision/description`. The
revision is a mandatory path segment, which is what makes Q15's rule
structural rather than conditional: the unpinned read must not be cached, so
it is given no route and an unpinned caller has no way to ask for it. A
revision that is not a non-negative integer of at most nine digits is refused
with 400 before Galaxy is asked; a 400 or a 404 from Galaxy is a 404 here,
since Galaxy answers 400 for a revision index past the end of the history, as
`versionState` already knew; and every other way the workflow read can fail is
a logged 500, as for the sibling proxies. Galaxy answering 503 is 503.

The answer is `{ steps, inputs, tools, unavailable }` with no envelope —
`steps` and `inputs` are the live payload's own, verbatim, since #88
normalises them and Q12 changes their source behind this same contract.
`tools` is keyed `<toolId>@<version>` and carries **resolved definitions
only**; `unavailable` is a list, because one tool can appear at two versions
in one workflow, and every pinned tool is in exactly one of the two — a tool
that failed is never merely absent (#96). Its `reason` is one of
`not_installed` (a 404), `version_mismatch` (a 200 carrying another version,
which also names the `servedVersion`) or `unreachable` (anything else Galaxy
did). The first two would refuse the submission; the third would not.

The `options` of every data and data collection parameter are emptied at any
depth, before the definition is cached: `io_details=true` fills them from
whichever history the API account touched last, so they are a per-user
snapshot that nothing on the client reads and that no cache should hold. The
whole object goes rather than the two keys the ticket named — a real payload
carries `hda`, `hdca`, `dce` and `ldda` under one parameter, all from the same
snapshot, and a list of key names is one the next Galaxy release can add to
unnoticed. `io_details` itself cannot be dropped: it is also what makes Galaxy
send `inputs` at all.

The cache is the Nitro storage mount `galaxy-cache`, mounted by the module on
the memory driver and configurable through the `galaxy.cache` module option —
`storage` for the mount's own options (`{ driver: 'redis', … }` for a
deployment with several replicas) and `enabled` to turn the whole thing off,
which is the only escape hatch there is. Keys carry their family (`tool|`,
`workflow|`) so that a tool and a workflow revision cannot name one entry, and
are percent-encoded part by part, because unstorage normalises a key before it
reaches the driver — it truncates at the first `?` and turns `/` into `:` —
and a Galaxy URL and a toolshed guid carry both separators. Nothing is written
for a tool that failed, so a retry refetches only what failed. A hit is
checked against the version its key promises before it is served, since a
store shared with another build is not this module's to trust.

Q22's fold is `resolvePinnedToolsEffect`, the sibling of `missingToolsEffect`
in the same module: it takes the pinned tools rather than an export, so the
description endpoint can derive them from the live payload, and it answers
each tool's definition and its verdict from the one fetch. `missingToolsEffect`
keeps its export-taking signature and its three callers on the publish path,
which asks a different question at a different moment.

### Verdict on the refactor

Refactor the **Galaxy-side fetching**. Leave the **Supabase side alone** — jobs,
realtime and the Colada queries are cached, correct, and `step_id` joins
cleanly.

What is actually wrong today:

1. **1+N uncached Galaxy round trips per mount.** `useGalaxyWorkflow` and
   `useGalaxyTool` use raw `$fetch`, not Colada, so nothing is deduped or
   shared and every navigation re-fetches. Tool definitions are the most
   cacheable data we have and the most re-fetched.
2. **Four copies of one derivation** — `InvokeForm`'s
   `toolInputParameterComponent`, `AnalysisHistoryPanel`'s `useAnalysisTools`,
   and both prototypes.
3. **Two shapes for one thing**: client on the live API shape, server on the
   export shape. This is Q11's drift, and it exists only because nothing
   normalises.
4. Every screen re-derives `stepToTool`, `workflowToolIds`, the parameter model.

**Not in scope, and deliberately so:** nothing here refactors the invoke
submission path itself. Q22 adds a pre-submit check to the new endpoint, but
`invokeWorkflowEffect` and `useGalaxyEncodeParameters` are otherwise untouched.
If the invoke path needs work, that is a separate ask.

## Established facts

### Verified and correct

- **`jobs.step_id === step.order_index === graph node id`.** One key, three
  places. Follow-mode colouring is a key lookup. The export keys `steps` by
  `order_index`, and `input_connections[].id` is `output_step.order_index`, so
  edges join on the same key.
- **`input_connections` values may be an object or an array.** Confirmed, and
  it is deliberate: `_workflow_to_dict_export` collapses a singleton list to a
  bare dict, with a Galaxy comment calling it a back-compat hack "mirrored in
  `_workflow_from_raw_description`" that must never be removed. Handle both.
- **`require_exact_tool_versions` defaults to `true`** on `InvokeWorkflowPayload`,
  on both 22.05 and 26.1. Combined with a bound revision pin, an uninstalled
  tool version means Galaxy refuses the whole invocation. Q22 is justified.
- **`syncAnalysisEffect` drops mapped jobs.** It writes a job row only
  `if (step.job_id)` —
  `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/analysis.ts:259`.
  **Pre-existing defect, independent of the graph.**
- **Vue Flow renders nodes inline** (`NodeRenderer.vue`, `v-for` of
  `NodeWrapper`, `v-memo`), with **no Teleport** — so `provide`/`inject` reaches
  into nodes and `UForm` works inside one. Prototype B proved this, then
  demonstrated why you still would not want it: the zoom that fits the forms is
  the zoom that makes them unreadable, and teleported dropdowns render at page
  scale over a node drawn at canvas scale. *(Not re-verified in the API pass —
  this is a client-library claim.)*
- **We call `/jobs_summary` but not `/step_jobs_summary`** — and only when the
  invocation is non-terminal, purely to derive one overall outcome.

### Corrected

- **The revision pin does not bind on 22.05.** `invokeWorkflowEffect` does post
  `version: revision` (`packages/blendtype/src/workflows.ts:208`, from #48), and
  that is correct code. But 22.05's invoke handler
  (`api/workflows.py:807`) does `workflow = stored_workflow.latest_workflow`
  unconditionally; `version` appears nowhere in its invoke path or in
  `workflow/run_request.py`. Galaxy first honours `payload.version` via
  `stored_workflow.get_internal_version(version)` in **24.1**. On the 26.x
  target it binds. **Confirm empirically after the upgrade**: invoke an older
  revision of a two-revision workflow and check which one ran.

- **`tool_inputs` ≡ `JSON.parse(tool_state)` is narrower than measured.** There
  are three shapes, not two:
  - live show — `tool_inputs` is the **raw DB column**, untouched;
  - `style=export` — `tool_state` is `json.dumps(get_export_state())`, i.e.
    `encode(nested=True)`;
  - `style=editor` — `get_tool_state()` is `encode(nested=False)`, which
    JSON-**stringifies every top-level value**
    (`tools/parameters/__init__.py:353`).

  The measured identity on `6441c468cf4212b8` (`cron-wf-test`) holds between the
  first two for that workflow. But the export path calls
  `module.check_and_update_state()` first, which Galaxy's own comment flags as
  *"FIXME: this updates modules silently right now"*, and an uninstalled tool
  makes Galaxy dump "the last known state without modifications". So the same
  stored revision can export differently as the toolbox moves. The caveat is not
  just `RuntimeValue` — it covers uninstalled tools and conditional / repeat /
  section tools.

- **The live shape loses edges, and cannot draw a correct graph.**
  `_workflow_to_dict_instance` emits per step only `id` (order index), `type`,
  `tool_id`, `tool_uuid`, `tool_version`, `annotation`, `tool_inputs`,
  `input_steps`, `when`. It has **no `position`** (fine — Q6 auto-lays out), **no
  `outputs`/`workflow_outputs`** (output handles cannot be enumerated), and
  `input_steps` is a dict keyed by `input_name` **assigned in a loop** — so when
  two connections share one input name, the last silently wins and the edge is
  **dropped**. This is the argument for Q12.

- **Q11 cannot be implemented on the live payload.** The comparison that exists
  today is correct: `versionStateEffect` (`grizzle/versionState.ts:88`) compares
  `exported.uuid` against the stored `revisionUuid`, reading
  `/download?style=export&version=N`, and Galaxy's export sets
  `data["uuid"] = str(workflow.uuid)` on the **requested** revision. Like for
  like. But Q3 has the graph reading the live proxy, and
  `GET /api/workflows/{id}` carries **no per-revision uuid** — only
  `latest_workflow_uuid`, which is `self.latest_workflow.uuid`
  (`model/__init__.py:8982`), i.e. always the newest revision regardless of
  `?version=`. A refusal check written against the payload the graph already
  holds would mismatch on every version pinned to anything but the newest, and
  the graph would never draw.

  Two further points to settle with it. `versionState.ts`'s own comment says the
  export path is *"the one place the stored uuid is compared, never at analysis
  start"* — Q11 proposes a second comparison site, at draw time. And Galaxy
  writes `uuid` into the export only `if workflow.uuid is not None`, so a
  revision without one reads as a mismatch; harmless today, since
  `revision_uuid` is `notNull()` and publishing would have failed without it.

  **Q12 dissolves this**: on the stored definition the graph already holds the
  pinned export and its uuid, and no extra read is needed.

## Galaxy API surface (26.1, the target)

- **`GET /api/invocations/{id}?step_details=true`** — the one that matters.
  `WorkflowInvocationStep.to_dict(view="element")` calls `get_jobs_dict()`
  (`model/__init__.py:10862`), which for a mapped step returns **every job of the
  implicit collection with its state**, per step, keyed by `order_index`. That is
  Q18's count badge in the call GaaS already makes, missing only the query
  param. `steps` itself is always present for the element view — `step_details`
  only switches each step between the collection and element views.

- **`GET /api/invocations/{id}/step_jobs_summary` — do not use for this.**
  Despite the name it is **not per-step and cannot be joined to a step**.
  `invocation_job_source_iter` (`managers/jobs.py:1547`) yields
  `("Job", job_id)` or `("ImplicitCollectionJobs", icj_id)` per invocation step
  and **recurses into subworkflows**. Items carry no step reference — `id` is the
  Job id or the ImplicitCollectionJobs id, per the schema's own field docs.
  Steps with no job source (inputs, pause, unscheduled, skipped) emit nothing,
  there is no `ORDER BY`, and subworkflow jobs are flattened in
  indistinguishably, so positional indexing fails too. On 26.x it *can* be
  joined via the step's `implicit_collection_jobs_id` (added at
  `model/__init__.py:10320` when `legacy_job_state` is off) — but
  `step_details=true` is one call and needs no join.

- **`legacy_job_state=true` is a trap.** At `model/__init__.py:10314-10320`,
  with it on Galaxy emits one **cloned** step dict per job, all sharing the same
  `order_index` and `workflow_step_id`, and `implicit_collection_jobs_id` is
  **not** added. So the naive sync fix would write N job rows at the same
  `step_id`. Use `step_details=true` instead and the question does not arise.

- **`WorkflowInvocationElementView.messages`** — a discriminated union of 13
  members: 9 failures (`job_failed`, `dataset_failed`, `step_input_deleted`,
  `when_not_boolean`, `workflow_parameter_invalid`, `collection_failed`,
  `output_not_found`, `expression_evaluation_failed`, `unexpected_failure`), 3
  cancellations, 1 warning. `cancelled_on_history_deleted` carries `history_id`
  instead of a step. **`workflow_step_id` is the `order_index`** — it is stored
  as an FK to `workflow_step.id` but read back through the
  `workflow_step_index` property (`= workflow_step.order_index`) via pydantic
  `validation_alias` + `from_attributes`; Galaxy's own client types it
  `// Step order_index`. The name is a trap; `dependent_workflow_step_id`
  behaves the same. It joins straight to `jobs.step_id`. We already store the
  whole invocation in `analyses.invocation`, so on 26.x these are in our
  database, unread.

- **`GET /api/invocations/{id}/request`** — the exact invocation request,
  including the Workflow instance id (`workflow_id` with `instance: true`).
  Galaxy's canonical identity for "the workflow that ran". Use it to *confirm* a
  recorded revision, not as the cache key.

- **`GET /api/tools/{id}/inputs` and `/parameter_request_schema`** — typed,
  versioned parameter models, both taking `tool_version`. A first-class
  replacement for our hand-derived widget map, *but* they belong to the newer
  tool-request API: `parameter_request_schema`'s own summary says it is "for the
  tool request API that will be added to Galaxy at some point". Mixing them with
  the legacy `tool_state` one that `useGalaxyEncodeParameters` posts is a trap.
  `/api/tools/{id}/build` is the legacy-shaped one, and exists on both versions.

- Steps carry `when` (conditional) on every step type. `PauseStep` is a step
  type, resumable via `PUT /api/invocations/{id}/steps/{step_id}` with
  `{action: boolean}`. `SubworkflowStep` carries a `workflow_id`; its invocation
  step carries `subworkflow_invocation_id`.

- `/api/events/stream` (SSE) exists on 26.x, but is not applicable twice over:
  the browser never talks to Galaxy directly in GaaS, and the stream is scoped to
  notifications and history changes, not invocation-step state.

- `/api/configuration/encode|decode` are `require_admin=True`. Not needed given
  the `workflow_step_id` finding above, but worth knowing.

## Pre-existing defects found along the way

- `InvokeForm.vue:194` — `props = {}` reset **inside** the loop, so only the
  last tool step survives. **Fixed in #83**, with the map built once outside
  the loop. `InvokeForm.test.ts` now serves two tool steps at distinct
  `tool_id`s and opens each accordion panel in turn; before the fix the first
  step's panel rendered empty.
- `GalaxySelectToolParameter` requires an `isConditionalSelect` prop that
  nothing passes and nothing reads. **Dropped in #83.** Galaxy has no
  conditional-select component to mirror — a conditional's `test_param`
  renders through the same generic form element as any other input — and the
  prop was inverted besides, `true` on the *multiple* variant where a
  `test_param` can only ever be single-valued.
- The revision pin is a no-op in production until the upgrade (above).
- **`galaxyWorkflowExportSchema` strips every connection, position and `when`
  out of the stored definition.** `exportWorkflowEffect` parses with
  `galaxyWorkflowExportSchema.passthrough()`, but passthrough applies to the
  **top level only**: `steps` is `z.record(z.string(), workflowStepExportSchema)`
  and that inner `z.object` strips by default, as does
  `input_connections: z.object({ input: z.optional(...) })` — which models a
  single optional key literally named `input`, while Galaxy keys connections by
  *input name* (`input1`, `queries_0|input2`, …). Measured on a realistic step:

  ```
  step keys kept : annotation, id, name, content_id, label, tool_id, type, uuid,
                   tool_state, tool_version, input_connections, inputs, outputs,
                   workflow_outputs
  position kept  : false
  when kept      : false
  input_connections after parse: {}
  ```

  So `galaxy.workflows.definition` holds **no edges at all**. Latent today —
  nothing reads `input_connections` (`workflows.vue:20` re-parses with
  `.loose()`, but cannot recover what was stripped at write time) — and the
  blocker for Q12. **`test/server/workflowDefinition.ts` hardcodes
  `input_connections: {}`**, the stripped shape, so Q17's characterisation tests
  built on that fixture would pin the defect as correct. Fix the fixture first.

  **Fixed in #82.** `workflowStepExportSchema` is `.loose()`,
  `input_connections` is a record keyed by input name whose value is one
  connection or an array of them, and `position`, `when` and `subworkflow` are
  modelled. The fixture's `toolStep` now keys its connection by `input1` — not
  `input`, the one key the broken schema kept — so a suite built on it can
  tell fixed from broken.

## Still to verify

### Does the revision pin actually bind?

The answer is gated on the upgrade; the test is not — write it now.

`WorkflowInvocation.workflow_id` is `ForeignKey("workflow.id")`, the *revision*
table, not `stored_workflow`, and it is in the dict views on both 22.05 and
26.1. So the invocation already records which revision ran, and the two
revisions need not differ observably:

```
1. A stored workflow with >= 2 revisions. Publish a GaaS version pinned to
   revision 0, so workflows.revision_uuid holds revision 0's uuid.
2. Start an analysis on that version. Take the invocation id.
3. GET /api/invocations/{id}                  -> workflow_id (the revision that RAN)
4. GET /api/workflows/{workflow_id}/download?style=export&instance=true
                                              -> its uuid and version
5. Assert uuid === version.revision_uuid, and version === 0
```

This is the comparison `versionStateEffect` already makes, applied to what *ran*
rather than what is pinned, so it reuses that code path rather than growing a new
one.

Both endpoints exist on 22.05, so **this test can be written before the
upgrade**: today it fails — step 4 answers the latest revision's uuid and the
highest index — and it turns green by itself when the upgrade lands. A red test
naming the gap is worth more than this paragraph.

A cheaper smoke version (make the revisions differ in step count, compare
`steps.length` from `?step_details=true`) works but needs a purpose-built
workflow; the uuid route needs nothing of the workflow at all.

Out of scope for this test: that GaaS *sends* the pin. `invokeWorkflowEffect`
does (`workflows.ts:208`); this checks only that Galaxy honours it.

### What the recordings settled (#86)

Three real workflows are recorded under
`packages/ui/test/fixtures/galaxy-workflow/`: `ccqtl-today` from Pasteur at
22.05, and two from usegalaxy.eu at 26.1 for the shapes Pasteur's account does
not have. A survey of 160 published workflows found only four carrying all five
shapes at once, the smallest 57 steps, which is why it is a set rather than one.

Four things the recordings showed that this document had wrong or missing:

- **`ConnectedValue` is the most common shape there is, and appears nowhere
  above.** Galaxy writes `{"__class__": "ConnectedValue"}` for a parameter fed
  by an upstream step. It is in every recording. The invoke form must *not*
  offer a field for one — the graph supplies it — which is a rule nothing had
  written down.
- **The live payload and the stored definition derive the same parameter
  model**, on both recordings. Q12's switch of source is invisible to a reader
  for these shapes, so the question below is answered for the cases we hold:
  nowhere. The caveat stands for a tool upgraded since the revision was saved,
  which no one-off recording can reach.
- **22.05 writes a boolean as `"false"`; 26.1 writes `false`.** A widget that
  parsed the string would read a different type after the upgrade. Pinned on
  both sides.
- **A `RuntimeValue` that is `data`-typed is never offered.** On `ccqtl-today`
  step 4, Galaxy saved four data inputs as `RuntimeValue` — it expects them at
  run time — but the composable filters every `data` parameter out before the
  panel is built, so GaaS never asks and the reader cannot supply them. Pinned
  as it is; whether it is a defect is a separate question.

### Where does Q12 change widget defaults?

Now that Q12 is required, this criterion has a different job. It was a go/no-go
gate — "if `tool_inputs` and parsed `tool_state` diverge, drop Q12". It is now a
**map of where switching source changes user-visible defaults, and which side we
want when it does.** Divergence is a case to handle, not a veto.

The mechanism decides what to test. Live `tool_inputs` is the raw DB column,
untouched. Export `tool_state` is `json.dumps(state.encode(nested=True))`, which
runs every value through `value_to_basic` **using the live tool definition**,
after `check_and_update_state()`. So divergence is driven by the *tool*, not the
workflow — which is why one probe on one workflow cannot settle it.

Cases to add, in order of value:

1. **A tool upgraded since the revision was saved.** `check_and_update_state()`
   fills in defaults for parameters added to the tool since, so the export gains
   keys the raw column lacks. This appears *over time*, not at authoring, so a
   one-off probe structurally cannot catch it. Most likely to bite in
   production.
2. **A conditional, and a repeat.** `value_to_basic` recurses into nested
   structures; `cron-wf-test` had neither. The most common real shape.
3. **A `RuntimeValue` step** — the original caveat. Serialises as
   `{"__class__": "RuntimeValue"}`; confirm the raw column matches.
4. **A tool not installed at the pinned version** — the *control*. Galaxy dumps
   "the last known state without modifications" when the tool is absent, so here
   the two should **agree**. Worth pinning precisely because it is the case one
   would naively predict to diverge.

**Assert on the derived parameter model, not on the raw dicts.** Run both
through the single widget derivation Q13(b) centralises and compare that output;
comparing `tool_inputs` to `JSON.parse(tool_state)` directly means chasing key
ordering, `__page__` and `__rerun_remap_job_id__` — differences that never reach
a user.

Constraint: cases 1 and 4 need a Galaxy whose toolbox you control. Neither can
be arranged on Pasteur's shared instance, so they need either a fixture recorded
the first time a real divergence appears, or a local Galaxy. Cases 2 and 3 are
testable against Pasteur today.

### Which payload Q11's refusal reads

The export (correct, but a second round trip, and a second comparison site
`versionState.ts` says should not exist) or the live show (free, but carries no
per-revision uuid). Q12 dissolves it.

## Suggested sequencing

Everything here targets 26.x. Steps 1-4 are buildable against 22.05 as well and
need no upgrade; the rest do.

**No production data exists yet — the database can be dropped entirely.** That
removes the backfill this plan would otherwise need, and with it the residue of
rows pinned to a revision Galaxy no longer holds. Schema changes here are a
drop-and-republish, not a migration.

1. **Fix the export schema.** Widen `workflowStepExportSchema` so a stored
   definition keeps what it is for: `input_connections` keyed by arbitrary input
   name and **object-or-array** valued, plus `position`, `when`, `subworkflow`.
   Beware nested strip — `.passthrough()` on the outer object does not reach
   `steps`. Fix `test/server/workflowDefinition.ts` in the same change, since it
   bakes in the stripped shape. A defect fix in its own right, independent of the
   graph, and the prerequisite for both step 2 and Q12.
2. **Characterisation tests** (Q17) — pin today's payload for one real workflow:
   a data input, a tool with a conditional, one with a runtime parameter, and
   **one with a fan-in input**. Must come after step 1, or they pin the stripped
   payload as correct. Pays for itself twice; it is also Q12's acceptance
   fixture. **Done in #86** — see "What the recordings settled" below.
3. **Sync fix: record mapped jobs**, via `step_details=true` and the per-step
   `jobs` array — not `legacy_job_state`, not `step_jobs_summary`. Independent of
   the graph, fixes a real defect, and is the prerequisite for Q18. Can go in
   parallel with 1 and 2.
4. **Q13(a) + Q13(b)** — the normalising endpoint and the composable, reading
   the live proxy exactly as today. Zero behaviour change; buys the
   deduplication, the caching, and one copy of the widget derivation. Q22's
   check lands here.
5. **Q12** — flip the endpoint's source to the stored definition behind the same
   contract. Once step 1 has landed this is close to trivial: the row is already
   fetched and stored at publish, so it is a read of something you hold rather
   than a new round trip. **Required, not droppable** — the live shape drops
   fan-in edges and carries no per-revision uuid for Q11.
6. **Follow-mode graph** — may ship before 4 and 5, since it needs no tool
   definitions.
7. **Invoke-mode graph.**
