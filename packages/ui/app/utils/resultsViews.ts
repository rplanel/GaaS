/** What identifies a workflow to a results view: its `name:` and `version:` tag values. */
export interface ResultsViewKey {
  name: string
  version: string
}

/**
 * The results view registered for a workflow, or `undefined` when there is none.
 *
 * The comparison is plain equality on both keys, so it is exact, case and
 * dots included: `satellitefinder` does not stand for `satelliteFinder`, and
 * `0.1.1` does not stand for `0.11` (ADR 0003).
 */
export function findResultsView<T extends ResultsViewKey>(views: readonly T[], workflow: ResultsViewKey): T | undefined {
  return views.find(view => view.name === workflow.name && view.version === workflow.version)
}
