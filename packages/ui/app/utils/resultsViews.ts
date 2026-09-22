/** What identifies a workflow to a results view: its `name:` and `version:` tag values. */
export interface ResultsViewKey {
  name: string
  version: string
}

/**
 * How specifically a results view names the workflows it applies to, from the
 * most specific down (ADR 0003): one workflow, every version of a name, every
 * workflow of the application.
 */
export type ResultsViewRung = 'exact' | 'name-level' | 'app-wide'

/** The rung a match landed on, or `none` when no view applies and the generic results view shows. */
export type MatchedResultsViewRung = ResultsViewRung | 'none'

/**
 * What a registry entry says about which workflows it applies to. The build
 * generates entries of this shape from the directory names, verbatim.
 */
export type ResultsViewScope
  = | { rung: 'exact', name: string, version: string }
    | { rung: 'name-level', name: string }
    | { rung: 'app-wide' }

/** The outcome of matching a workflow against the registry: which rung applied, and the entry that did. */
export type ResultsViewMatch<T>
  = | { rung: ResultsViewRung, view: T }
    | { rung: 'none', view: undefined }

/**
 * The results view that applies to a workflow, and the rung it was found at.
 *
 * The rungs are tried from the most specific down: the exact view for the
 * name and version, then the name-level view for the name alone, then the
 * app-wide view. The comparison at each rung is plain equality, so it is
 * exact, case and dots included: `satellitefinder` does not stand for
 * `satelliteFinder`, and `0.1.1` does not stand for `0.11` (ADR 0003).
 */
export function matchResultsView<T extends ResultsViewScope>(views: readonly T[], workflow: ResultsViewKey): ResultsViewMatch<T> {
  const exact = views.find(view => view.rung === 'exact' && view.name === workflow.name && view.version === workflow.version)
  if (exact)
    return { rung: 'exact', view: exact }

  const nameLevel = views.find(view => view.rung === 'name-level' && view.name === workflow.name)
  if (nameLevel)
    return { rung: 'name-level', view: nameLevel }

  const appWide = views.find(view => view.rung === 'app-wide')
  if (appWide)
    return { rung: 'app-wide', view: appWide }

  return { rung: 'none', view: undefined }
}
