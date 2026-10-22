import type { MaybeRefOrGetter } from 'vue'
import type { ResultsViewKey } from '../utils/resultsViews'
import { resultsViews } from '#build/nuxt-galaxy/results-views.mjs'
import { computed, toValue } from 'vue'
import { matchResultsView } from '../utils/resultsViews'

/**
 * The results view that applies to a workflow, following the workflow given.
 *
 * The registry is generated at build time from every layer's
 * `app/workflows/` directory. `view` is the entry that applies, for the page
 * to render, and `rung` says how specifically it matched: `exact`,
 * `name-level`, `app-wide`, or `none` when no file covers the workflow's tags
 * and the generic results view shows. Both are `undefined` while the workflow
 * itself is unknown.
 */
export function useResultsView(workflow: MaybeRefOrGetter<ResultsViewKey | undefined>) {
  const match = computed(() => {
    const key = toValue(workflow)
    return key ? matchResultsView(resultsViews, key) : undefined
  })
  const view = computed(() => match.value?.view)
  const rung = computed(() => match.value?.rung)

  return { view, rung }
}
