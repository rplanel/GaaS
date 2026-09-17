---
status: accepted
date: 2026-09-17
---

# Usage statistics are filtered on the server and drawn with Observable Plot

The v2.0 usage-statistics dashboards need time-range, granularity and workflow filters (UIAU-03). We decided to add them as optional query parameters on the two existing endpoints, so the server filters and re-buckets and the browser only renders the returned aggregates with Observable Plot. We chose this over Mosaic, which is already installed and used for result browsing, because the expected data volume is small and a browser-side DuckDB would have duplicated the success-rate, UTC-bucketing and unknown-workflow logic that v1.3 deliberately keeps in one server helper.

## Considered options

- **Mosaic with raw monitoring records in browser DuckDB.** Row-level security already permits it without a new endpoint, and filters would become linked selections: brushing the trend would refilter the per-workflow table live. Rejected for now because it re-implements the v1.3 aggregate rules in browser SQL, makes the server filter parameters pointless, ships every row to administrators, and boots a multi-megabyte engine on a page that shows a few dozen numbers.
- **vgplot as a renderer over the server aggregates.** Same engine cost as the option above with none of its cross-filtering benefit, since the server has already aggregated.

## Consequences

- The filter parameters (`from`, `to`, `granularity`, `workflowId` including the literal `unknown`) become public API surface of the Galaxy module. Absent parameters keep the pre-v2.0 meaning: all time, daily buckets.
- The workflow filter is deliberately not applied to the per-workflow table, which always lists every workflow in range so it can serve as the picker.
- Every success rate on every path is still produced by the single server-side helper.
- **Revisit trigger**: this was decided on "not so much data for now". If usage grows to where users want to explore rather than read, or ask for linked brushing across widgets, reopen this and consider the Mosaic option deliberately.
