import type { ResultsViewAnalysis } from '#gaas/ui'
import type { PropType } from 'vue'
import { UApp } from '#components'
import { SUPABASE_ANALYSES_QUERY_KEYS } from '#imports'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject, provide, ref } from 'vue'
import AnalysisDetailPage from '../../app/pages/analyses/[analysisId].vue'
import AnalysisResultsPage from '../../app/pages/analyses/[analysisId]/results.vue'

/**
 * The registry the build would have generated from
 * `app/workflows/satelliteFinder/0.11/results.vue`: one view that renders
 * how many outputs the analysis it was handed carries, which is the one thing
 * a view cannot learn on its own (ADR 0003) and so the one thing that shows
 * whether the page around it keeps the analysis fresh.
 */
vi.mock('#build/gaas/results-views.mjs', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    resultsViews: [
      {
        rung: 'exact',
        name: 'satelliteFinder',
        version: '0.11',
        component: defineComponent({
          props: {
            analysisId: { type: Number, required: true },
            analysis: { type: Object as PropType<ResultsViewAnalysis>, required: true },
          },
          setup: props => () => h('p', `satellite view for analysis ${props.analysisId}: ${props.analysis.analysis_outputs.length} output(s)`),
        }),
      },
    ],
  }
})

/** The analysis the pages are opened on; each test picks its own id so none meets another's cache entry. */
const analysisIdParam = ref('7')

/** Both the analysis page and its results child ask for the route; they read the same params. */
mockNuxtImport('useRoute', () => () => ({ params: { analysisId: analysisIdParam.value } }))
mockNuxtImport('useSupabaseClient', () => () => ({} as never))

/** A realtime subscription as the page opened it: the table it listens to and the handler it registered. */
interface RealtimeSubscription {
  channelName: string
  tableName: string
  handler: () => void
}

/**
 * The subscriptions the analysis page opens, captured instead of reaching
 * Supabase, so a test can play the part of a table change by calling the
 * handler the page registered for it.
 */
const realtimeSubscriptions: RealtimeSubscription[] = []

mockNuxtImport('useSupabaseRealtime', () => (channelName: string, tableName: string, handler: () => void) => {
  realtimeSubscriptions.push({ channelName, tableName, handler })
})

/** The workflow row reduced to what the two pages and the view read from it. */
const workflowRow = { id: 1, name: 'Satellite Finder', name_key: 'satelliteFinder', version_key: '0.11' }

/** How many outputs the analysis has at the moment a query runs: grows as the run produces them. */
let outputCount = 1

/** One output, as the results-view query hands it over: the row, its dataset and its tags. */
function output(analysisId: number, index: number) {
  return { id: 20 + index, analysis_id: analysisId, dataset_id: 40 + index, state: 'ok', datasets: { id: 40 + index, dataset_name: `hits-${index}.tsv` }, tags: [] }
}

/** How many times the analysis page's own query ran: it has to keep refetching on a change too. */
let analysisPageQueryRuns = 0

/**
 * The query the analysis page shares with nothing else since #52, under its
 * real key: the fix reaches the results view through the cache, by key, so a
 * made-up key here would prove nothing.
 */
mockNuxtImport('analysisByIdWithOutputsAndWorkflowsQuery', () => ({ id }: { id: number }) => ({
  key: SUPABASE_ANALYSES_QUERY_KEYS.byIdWithOutputsAndWorkflows(id, true, true),
  query: async () => {
    analysisPageQueryRuns++
    return {
      id,
      name: 'run',
      created_at: '2026-09-23T10:00:00Z',
      workflows: workflowRow,
      analysis_outputs: Array.from({ length: outputCount }, (_, index) => output(id, index)),
    }
  },
}))

/** The results page's dedicated query (ADR 0003), under its real key, serving the outputs as they stand. */
mockNuxtImport('analysisByIdForResultsViewQuery', () => ({ id }: { id: number }) => ({
  key: SUPABASE_ANALYSES_QUERY_KEYS.byIdForResultsView(id),
  query: async () => ({
    id,
    name: 'run',
    workflows: workflowRow,
    analysis_inputs: [],
    analysis_outputs: Array.from({ length: outputCount }, (_, index) => output(id, index)),
  }),
}))

/** How deep inside `<NuxtPage />` a component sits: the results page is the first level, and it has one of its own. */
const nuxtPageDepth = Symbol('nuxtPageDepth')

/**
 * Stands in for `<NuxtPage />`, which reads router internals the route mock
 * does not carry: the analysis page's one renders the results page, the one
 * the results page keeps for per-output routes renders nothing.
 */
const NuxtPageStub = defineComponent({
  name: 'NuxtPageStub',
  setup() {
    const depth = inject(nuxtPageDepth, 0)
    provide(nuxtPageDepth, depth + 1)
    return () => depth === 0 ? h(AnalysisResultsPage) : null
  },
})

/**
 * The history panel is stubbed out: it runs queries and subscriptions of its
 * own that play no part here, and leaving it out means every subscription
 * captured is the analysis page's.
 */
async function mountPage() {
  return mountSuspended({
    components: { UApp, AnalysisDetailPage },
    template: '<UApp><AnalysisDetailPage /></UApp>',
  }, { global: { stubs: { NuxtPage: NuxtPageStub, AnalysisHistoryPanel: true } } })
}

/** The handler the analysis page registered for changes to that table. */
function handlerFor(tableName: string) {
  const subscription = realtimeSubscriptions.find(candidate => candidate.tableName === tableName)
  if (!subscription)
    throw new Error(`the analysis page opened no subscription to "${tableName}"`)
  return subscription.handler
}

describe('analysis page around a results view', () => {
  // The results view gets the analysis from the page around it and never
  // queries it (ADR 0003), so when an output lands while the analysis runs,
  // the page's realtime handler is the only thing that can hand the view the
  // new one. Until #52 the two pages read one cache entry and the handler's
  // refresh reached both; the dedicated entry has to be reached too (#58).
  it('hands the results view the new outputs when an analysis_outputs change reaches the page', async () => {
    analysisIdParam.value = '7'
    outputCount = 1

    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('satellite view for analysis 7: 1 output(s)'))
    expect(realtimeSubscriptions.map(subscription => subscription.tableName).sort()).toEqual(['analysis_outputs', 'histories', 'jobs'])

    outputCount = 3
    const analysisPageQueryRunsBefore = analysisPageQueryRuns
    handlerFor('analysis_outputs')()

    await vi.waitFor(() => expect(wrapper.text()).toContain('satellite view for analysis 7: 3 output(s)'))
    // The page's own analysis is still refreshed by the same handler.
    expect(analysisPageQueryRuns).toBeGreaterThan(analysisPageQueryRunsBefore)
  })
})
