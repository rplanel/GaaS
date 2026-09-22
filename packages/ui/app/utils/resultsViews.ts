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

/**
 * What a results view says about which workflows it applies to, read off the
 * directories it sits in, verbatim. The scanner adds the file to it and the
 * generated registry adds the component; this is the part the match reads.
 */
export type ResultsViewScope
  = | {
    /** `app/workflows/<name>/<version>/results.vue`: one workflow. */
    rung: 'exact'
    /** The `<name>` directory: the workflow's `name:` tag value, exactly as spelled. */
    name: string
    /** The `<version>` directory: the workflow's `version:` tag value, exactly as spelled. */
    version: string
  }
  | {
    /** `app/workflows/<name>/results.vue`: every version of one workflow name. */
    rung: 'name-level'
    name: string
  }
  | {
    /** `app/workflows/results.vue`: every workflow of the application. */
    rung: 'app-wide'
  }

/** The outcome of matching a workflow against the registry: which rung applied, and the entry that did. */
export type ResultsViewMatch<T>
  = | { rung: ResultsViewRung, view: T }
    | { rung: 'none', view: undefined }

/**
 * How a match reads to an administrator: `exact` when a view names this
 * workflow, `fallback` when a name-level or app-wide view stands in for one,
 * `none` when the generic results view shows.
 */
export type ResultsViewReading = 'exact' | 'fallback' | 'none'

/**
 * The reading of a match's rung. The two wider rungs collapse into one word
 * because the administrator's question is whether a view was written for
 * this workflow or something wider is standing in; which wider one it is
 * belongs to the developer, and to the results page.
 */
export function resultsViewReading(rung: ResultsViewMatch<unknown>['rung']): ResultsViewReading {
  switch (rung) {
    case 'exact':
      return 'exact'
    case 'name-level':
    case 'app-wide':
      return 'fallback'
    case 'none':
      return 'none'
  }
}

/**
 * The results view that applies to a workflow, and the rung it was found at.
 *
 * The rungs are tried from the most specific down: the exact view for the
 * name and version, then the name-level view for the name alone, then the
 * app-wide view; `none` means the generic results view shows. The comparison
 * at each rung is plain equality, so it is exact, case and dots included:
 * `satellitefinder` does not stand for `satelliteFinder`, and `0.1.1` does
 * not stand for `0.11` (ADR 0003).
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
