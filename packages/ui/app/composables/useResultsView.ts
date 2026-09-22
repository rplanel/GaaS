import type { MaybeRefOrGetter } from 'vue'
import type { ResultsViewKey } from '../utils/resultsViews'
import { resultsViews } from '#build/gaas/results-views.mjs'
import { findResultsView } from '../utils/resultsViews'

/**
 * The results view registered for a workflow, following the workflow given.
 *
 * The registry is generated at build time from every layer's
 * `app/workflows/<name>/<version>/results.vue`, so `view` is `undefined`
 * exactly when no such file exists for the workflow's tags.
 */
export function useResultsView(workflow: MaybeRefOrGetter<ResultsViewKey | undefined>) {
  const view = computed(() => {
    const key = toValue(workflow)
    return key ? findResultsView(resultsViews, key) : undefined
  })

  return { view }
}
