# GaaS — Galaxy as a Service

Vocabulary shared by every package in this repository: the Galaxy API client, the Nuxt module, the UI and content layers, and the CLI. One context, one glossary.

## Analyses

**Analysis**:
One run of a workflow, requested by a user through the web application and executed on the Galaxy instance. It owns the inputs, outputs and jobs of that run.
_Avoid_: Run, job, invocation (the latter two are Galaxy-side parts of an analysis)

**Workflow**:
A Galaxy workflow, identified by its name and version, that an administrator has activated for the web application.
_Avoid_: Pipeline, tool

**Owner**:
The user who requested an analysis. Every analysis and every monitoring record has exactly one owner.
_Avoid_: Author, creator

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
The single bucket collecting analyses whose workflow could not be identified because it was deleted before its name was recorded.
_Avoid_: Orphan, null workflow, deleted workflow

**Trend**:
Usage statistics laid out over time in consecutive equal buckets, with empty buckets shown as zero rather than omitted.

**Bucket**:
One interval of a trend, aligned to UTC calendar boundaries: a day, an ISO week starting Monday, or a calendar month.
_Avoid_: Period, bin, slot

**Granularity**:
The bucket width of a trend: day, week or month.
_Avoid_: Interval, resolution, step

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

## Scope

**Own usage**:
Usage statistics restricted to the analyses a single user owns. What every user sees for themselves.
_Avoid_: Self stats, my stats, personal usage

**Global usage**:
Usage statistics over every user's analyses, in aggregate. What an administrator sees. It contains no per-user breakdown.
_Avoid_: Admin stats, all-users stats, operator view
