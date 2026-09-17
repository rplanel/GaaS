# Phase 7: standardize-evlog-traces - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-07
**Phase:** 07-standardize-evlog-traces
**Areas discussed:** Log-level policy for sync boundaries, Trace annotation shape when IDs are missing, Task finalizer wide event contents, Sensitive-data guardrails beyond secrets

---

## Log-level policy for sync boundaries

| Option | Description | Selected |
|--------|-------------|----------|
| High-signal policy (Recommended) | info for task start/end and terminal state changes; debug for lock acquire/release, Galaxy fetches, and dataset upload/download; error for failures | ✓ |
| Verbose policy | info for every boundary | |
| You decide per boundary | Leave exact severity choices to the implementer | |

**User's choice:** High-signal policy (Recommended)
**Notes:** Keeps production logs readable while preserving full trace at debug level.

---

## Trace annotation shape when IDs are missing

| Option | Description | Selected |
|--------|-------------|----------|
| Flat fields with nulls (Recommended) | Always include the six keys at the top level, using null when an ID is unknown | ✓ |
| Omit unknown fields | Only include IDs that are actually available | |
| Nested traceContext object | Wrap the six IDs under a single traceContext key with nulls for missing values | |

**User's choice:** Flat fields with nulls (Recommended)
**Notes:** Matches OBSERVE-02 requirement wording and gives log parsers a stable schema.

---

## Task finalizer wide event contents

| Option | Description | Selected |
|--------|-------------|----------|
| Per-analysis error array (Recommended) | Include an errors array of { analysisId, message } objects for failed analyses, with each message truncated to 500 chars | ✓ |
| Error counts by category | Include a summary object plus one sample message | |
| Totals only | Only include synced/failed/skipped counts and durationMs | |

**User's choice:** Per-analysis error array (Recommended)
**Notes:** Most useful for debugging failures.

### Follow-up: durationMs measurement

| Option | Description | Selected |
|--------|-------------|----------|
| Wall-clock task duration (Recommended) | From the moment the task run() starts until taskLog.emit is called | ✓ |
| Sync loop only | From first analysis sync start to last analysis sync end | |
| Per-analysis durations | Also collect and emit individual analysis sync durations | |

**User's choice:** Wall-clock task duration (Recommended)
**Notes:** Captures the full operational cost including setup/teardown.

---

## Sensitive-data guardrails beyond secrets

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit boundary allowlists (Recommended) | Define a small allowlist of loggable fields per boundary; prohibit raw Galaxy responses, dataset streams, stderr, peek, and full error objects | ✓ |
| Rely on discipline + redaction | No additional code-level rules beyond careful field selection and evlog redaction | |
| Add a scrubbing helper | Create a shared helper that walks logged objects and removes known sensitive keys | |

**User's choice:** Explicit boundary allowlists (Recommended)
**Notes:** Document the rule in a new section of LOGGING-SPEC.md.

---

## the agent's Discretion

- Exact log message strings and the helper used to attach flat trace context are left to the implementer, provided the severity policy and field schema are respected.

## Deferred Ideas

None.
