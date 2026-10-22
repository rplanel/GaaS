import type { ResultsViewMatch } from 'nuxt-galaxy'

/**
 * How a match reads to an administrator: `exact` when a view names this
 * workflow, `fallback` when a name-level or app-wide view stands in for one,
 * `none` when the generic results view shows.
 *
 * The match moved to `nuxt-galaxy`; this reading stayed, because ADR 0003's
 * 2026-10-19 amendment keeps the admin workflows page's column that reads a
 * match as exact, fallback or none in this layer (#168).
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
