# GaaS — Galaxy as a Service

Vocabulary shared by every package in this repository: the Galaxy API client, the Nuxt module, the UI and content layers, and the CLI. One context, one glossary.

## Analyses

**Analysis**:
One run of a workflow, requested by a user through the web application and executed on the Galaxy instance. It owns the datasets that fed that run, the datasets it produced and its jobs.
_Avoid_: Run, job, invocation (the latter two are Galaxy-side parts of an analysis)

**Workflow**:
A Galaxy workflow, identified by its name and version, that an administrator has published for the web application.
_Avoid_: Pipeline, tool

**Version**:
The label an administrator gives one revision of a Galaxy workflow when publishing it. A label never moves: a change to the workflow, however small, is a new version. Two published workflows with the same name and different versions are two workflows to the web application.
_Avoid_: Galaxy version, auto version, revision, version tag

**Revision**:
One save of a workflow on the Galaxy side. Every save appends a revision with its own identifier, while the workflow keeps its name. A version pins exactly one revision, and an analysis runs the revision its version pins. Galaxy's editor numbers a revision from 1, so GaaS shows that number to administrators, while the API and the `revision` column carry the 0-based index.
_Avoid_: Galaxy version, version index, workflow instance

**Publish**:
The act by which an administrator makes a version: choosing one revision of a Galaxy workflow and giving it a label. Nothing is copied in Galaxy.
_Avoid_: Activate, import, register

**Active**:
A version users may start an analysis on. A version is active when published; an administrator can retire it and make it active again.
_Avoid_: Enabled, live, visible

**Retired**:
A version that is no longer active. It stays a version: its analyses, their results views and its usage statistics are untouched.
_Avoid_: Unpublished, deactivated, deleted, archived, inactive

**State of a version**:
The live reading the admin page takes from Galaxy of whether a version can still run: runnable; tools missing, naming the tools Galaxy does not hold at their pinned version; missing in Galaxy, when the stored workflow no longer exists there; revision mismatch, when the revision Galaxy holds at that index is not the one the version pinned. A reading, never stored, and nothing is retired from it: the administrator reads it and decides.
_Avoid_: Health, status, broken, outdated

**Results view**:
The component a developer writes to display the results of an analysis, matched to the analysis's workflow by name and version. When no view matches the version, the view for the workflow name alone applies; when there is none either, the view for every workflow of the app applies.
_Avoid_: Result page, workflow component, custom result display

**Rung**:
How specifically a results view names the workflows it applies to, tried from the most specific down: exact (one name and version), name-level (every version of a name), app-wide (every workflow of the app). A match says which rung applied, or none, in which case the generic results view shows. The admin workflows page reads a match to an administrator in three words: exact, fallback (a name-level or app-wide view stands in) or none; that fallback is a reading of the match, not a rung.
_Avoid_: Fallback level, match type, specificity

**Generic results view**:
The results view GaaS itself shows for an analysis whose workflow has no results view.
_Avoid_: Fallback component, default view

**Owner**:
The user who requested an analysis. Every analysis and every monitoring record has exactly one owner.
_Avoid_: Author, creator

**Step**:
One numbered operation of a workflow: an input it declares, a parameter it takes, or a tool it runs. A step is named by its index, which is the same number in the workflow, in the analysis and in the graph, so the three always mean the same step.
_Avoid_: Node, task, stage

**Subworkflow**:
A step that runs a whole workflow of its own rather than one tool. It is one step of the workflow that contains it, with one step index and one job-free place in the graph; the steps inside it have their own indices, which belong to it and not to the workflow around it. The graph draws it as a single step that opens onto that workflow's own graph, never expanded into the steps around it.
_Avoid_: Nested workflow, sub-pipeline, group of steps

**Mapped step**:
One step that runs once per element of a collection it is given, rather than once in total. It stays one step with one step index, and its jobs — one per element, each with its own state — all belong to that index. Galaxy holds them in an implicit collection rather than against the step, so a mapped step reports no single job and is the reason a step index names many jobs rather than at most one.
_Avoid_: Parallel step, batch step, scattered step, collection step

**Step state**:
What one step of one analysis has come to, read per step and never aggregated: Not started, Queued, Running, Paused, Succeeded, Failed, Cancelled or Skipped. A step state is not an Outcome — an analysis has exactly one Outcome, and it is not the sum of its step states. Not started covers a step nothing has run yet. Queued covers one whose job Galaxy has accepted but not begun; Paused covers one whose job Galaxy paused because its input failed or was itself paused. A step that runs no job of its own — an input step, or a subworkflow step — has no step state at all, and is drawn without one rather than as Not started.
_Avoid_: Job state, node status, step outcome, progress, phase

**Input**:
One place a workflow takes a dataset from the user, declared as a `data_input` or `data_collection_input` step and named by the label its author gave it, or by its step index where there is none. An input is the place, not the dataset that fills it: an analysis supplies one dataset per input the workflow declares, except the optional ones. Galaxy counts a parameter step as an input too, so where the two must be told apart the phrase is *dataset input*.
_Avoid_: Parameter (a value the workflow takes, not a dataset), input step, data input

**Dataset**:
One of a user's files, in either of the two places the application keeps it: on their Datasets page, uploaded and offered to the inputs of any workflow they start, or in an analysis's Galaxy history, as the copy an input was given or as something the analysis produced. Starting an analysis copies rather than moves, so a dataset on the Datasets page outlives every analysis it feeds.
_Avoid_: File, upload, HDA, history dataset (in anything a user reads)

**Datamap**:
The part of a request to start an analysis that says which dataset goes to which input, keyed by the input's step index. It is stored on the analysis as sent, so that copying an analysis can offer the same choices again.
_Avoid_: Inputs object, input mapping, dataset map

**Parameter**:
A value a step takes, as against an input, which is a dataset it takes. A workflow's author fixes a parameter when they save the workflow, and an analysis may submit its own value for any of them; for a parameter nobody supplies, Galaxy uses the tool's own default.
_Avoid_: Setting, option, argument, field

**Conditional**:
One of a step's parameters whose value is a group of further parameters, with a test parameter choosing which group applies. Galaxy names a parameter inside one by joining the two with a `|`, and records the chosen branch as `__current_case__`, which it recomputes on every run rather than trusting what it was sent. A conditional's alternatives are its *cases*.
_Avoid_: Nested parameter, sub-parameter, group

**Parameter group**:
One of a step's parameters whose value is a bag of further parameters rather than a value of its own. There are three, and Galaxy models all three as a `Group`: a *conditional*, a *section* and a *repeat*. Galaxy names a parameter inside one by joining the names with a `|`, at every depth, so the submitted name of a leaf is the path to it. A group is not a widget: what renders is its children.
_Avoid_: Container, nested parameter, composite

**Section**:
A parameter group that is only a titled box: the parameters inside it are the same parameters, kept together and saved one level deeper under the section's name. A section may hold another section. It carries no value of its own and nothing chooses between alternatives — that is a conditional.
_Avoid_: Fieldset, panel, advanced options

**Repeat**:
A parameter group the workflow's author may hold several of, each *instance* a bag of the same declared parameters. The tool declares one blueprint and the saved state holds however many instances there are, so how many blocks a step has is read from the state and never from the declaration. Galaxy addresses an instance by its **position** in that list — it renumbers each instance's `__index__` to the position before building the name — while `__index__` is what identifies an instance on this side. An analysis cannot add or remove instances; only the workflow's author can.
_Avoid_: Array parameter, list parameter, block (in anything a user reads)

**Absent value**:
A parameter the model holds nothing for, which is the only thing left out of what an analysis submits. A `0`, an empty string, a `null` or a `false` is a value somebody chose — the workflow's author or the reader — and is submitted like any other. Leaving one out is not a smaller version of submitting it: Galaxy substitutes the tool's own default, with no error and nothing on screen to say so. Absence is `undefined` and nothing else, at every depth of a step's parameters.
_Avoid_: Empty, blank, missing, unset, falsy

## Usage statistics

**Monitoring record**:
The per-analysis record of when it started, when it finished and how it ended. It outlives both the analysis and the workflow it ran against, so history survives deletion.
_Avoid_: Monitoring row, stats row, audit entry

**Usage statistics**:
Aggregates computed over monitoring records: how many analyses were started, how they ended, per workflow and over time. This is the user-facing name; "monitoring" never appears in the interface.
_Avoid_: Monitoring, stats, analytics, metrics

**Outcome**:
How an analysis ended, or that it has not yet. Exactly one of Pending, Succeeded, Failed or Cancelled. Pending means still running; Cancelled means it was stopped or deleted before reaching a result.
_Avoid_: Status, state (those are Galaxy-side job and history states)

**Failed**:
The outcome of an analysis whose Galaxy run ended in error. Always displayed as "Failed"; recorded as `error` in data.
_Avoid_: Error, errored (in anything a user reads)

**Success rate**:
Among analyses with a definitive outcome, the share that Succeeded: Succeeded divided by Succeeded plus Failed. Pending and Cancelled are excluded. It has no value until something has finished, and is then shown as a dash, never as zero.
_Avoid_: Reliability, pass rate

**Unknown workflow**:
The single bucket collecting analyses whose workflow could not be identified
because it was deleted before its name was recorded. It is selectable like any
other workflow, and travels as the word `unknown`, having no identifier of its
own.
_Avoid_: Orphan, null workflow, deleted workflow

**Trend**:
Usage statistics laid out over time in consecutive equal buckets, with empty buckets shown as zero rather than omitted.

**Bucket**:
One interval of a trend, aligned to UTC calendar boundaries: a day, an ISO week starting Monday, or a calendar month.
_Avoid_: Period, bin, slot

**Granularity**:
The bucket width of a trend: day, week or month.
_Avoid_: Interval, resolution, step — *step* here means a time step; the Galaxy sense, one numbered operation of a workflow, is the term **Step** above.

**Automatic granularity**:
The bucket width a trend takes when nobody has chosen one, worked out from how
long the time range is: day up to 90 days, week up to two years, month beyond,
and month for all time, whose span only the server has seen. A reader can
override it; the absence of an override is what automatic means.
_Avoid_: Default granularity, smart buckets, adaptive

**Time range**:
The window usage statistics cover, named by the first and last day it
includes. It filters on when an analysis started, so one that ran for days
belongs to the day it began. Absent, it means all time.
_Avoid_: Date filter, window, timeframe

**Preset**:
A time range a reader picks by name rather than by date: the last 7, 30 or 90
days, or all time. A link carries the name, not the days it stood for when the
link was made, so it keeps meaning the same thing later.
_Avoid_: Quick filter, shortcut, canned range

**Workflow selection**:
One workflow version, picked out of the per-workflow table, that the counts and
the trend are narrowed to. Per-workflow usage is never narrowed by it: it is
the list the selection is made from, so it goes on showing every workflow in
range. Absent, it means all workflows.

A selection rather than a filter, and deliberately not the word the design
brief used. The name has to carry why the table is exempt: a selection is made
*from* the table, so of course the table keeps showing what is selectable,
where a filter sitting beside the time range and the granularity would imply it
narrows everything they do.
_Avoid_: Workflow filter, workflow picker, workflow scope

## Scope

**Own usage**:
Usage statistics restricted to the analyses a single user owns. What every user sees for themselves.
_Avoid_: Self stats, my stats, personal usage

**Global usage**:
Usage statistics over every user's analyses, in aggregate. What an administrator sees. It contains no per-user breakdown.
_Avoid_: Admin stats, all-users stats, operator view
