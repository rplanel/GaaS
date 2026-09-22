import type { MaybeRefOrGetter } from 'vue'
import type { ResultsViewKey, ResultsViewMatch } from '../utils/resultsViews'
import { resultsViews } from '#build/gaas/results-views.mjs'
import { matchResultsView } from '../utils/resultsViews'

/**
 * The results view that applies to a workflow, following the workflow given.
 *
 * The registry is generated at build time from every layer's
 * `app/workflows/` directory, and `match` says which rung of it applied:
 * `exact`, `name-level`, `app-wide`, or `none` when no file covers the
 * workflow's tags and the generic results view shows. It is `undefined`
 * while the workflow itself is unknown. `view` is the matched entry, for the
 * page to render.
 */
export function useResultsView(workflow: MaybeRefOrGetter<ResultsViewKey | undefined>) {
  const match = computed((): ResultsViewMatch<(typeof resultsViews)[number]> | undefined => {
    const key = toValue(workflow)
    return key ? matchResultsView(resultsViews, key) : undefined
  })
  const view = computed(() => match.value?.view)
  const rung = computed(() => match.value?.rung)

  return { view, rung }
}
