import type { ResultsViewAnalysis } from 'nuxt-galaxy'
import type { PropType } from 'vue'
import { UApp } from '#components'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import AnalysisResultsPage from '../../app/pages/analyses/[analysisId]/results.vue'

/**
 * The registry the build would have generated from
 * `app/workflows/satelliteFinder/0.11/results.vue`: one view, whose rendered
 * text can only come from it, and only from the props the page hands it.
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
          setup: props => () => h('p', [
            `satellite view for analysis ${props.analysisId}: `,
            `${props.analysis.workflows.name} ${props.analysis.workflows.version_key}, `,
            `${props.analysis.analysis_inputs.length} input(s), ${props.analysis.analysis_outputs.length} output(s), `,
            `first input ${props.analysis.analysis_inputs[0]?.datasets.dataset_name} tagged ${props.analysis.analysis_inputs[0]?.tags.map(tag => tag.label).join('+')}`,
          ]),
        }),
      },
    ],
  }
})

/** The analysis the page is opened on; each test picks its own id so none meets another's cache entry. */
const analysisIdParam = ref('7')

mockNuxtImport('useRoute', () => () => ({ params: { analysisId: analysisIdParam.value } }))
mockNuxtImport('useSupabaseClient', () => () => ({} as never))

/** A workflow row reduced to what the page and the view read from it. */
function workflow(nameKey: string, versionKey: string) {
  return { id: 1, name: 'Satellite Finder', name_key: nameKey, version_key: versionKey }
}

/** The workflow the query answers with, swapped per test. */
let workflowRow: ReturnType<typeof workflow> = workflow('satelliteFinder', '0.11')

/** The analysis ids the query cannot find, so the page shows its not-found message for them. */
const unknownAnalysisIds = new Set<number>()

/** The analysis as the dedicated query hands it over: one input and one output, each with dataset and tags. */
function analysis(id: number) {
  return {
    id,
    name: 'run',
    workflows: workflowRow,
    analysis_inputs: [
      { id: 11, analysis_id: id, dataset_id: 3, state: 'ok', datasets: { id: 3, dataset_name: 'genome.fasta' }, tags: [{ id: 9, label: 'genome' }] },
    ],
    analysis_outputs: [
      { id: 21, analysis_id: id, dataset_id: 4, state: 'ok', datasets: { id: 4, dataset_name: 'hits.tsv' }, tags: [] },
    ],
  }
}

mockNuxtImport('analysisByIdForResultsViewQuery', () => ({ id }: { id: number }) => ({
  key: ['test', 'analysis', id],
  query: async () => {
    if (unknownAnalysisIds.has(id))
      throw new Error('Supabase query failed: row not found')
    return analysis(id)
  },
}))

/**
 * The nested `<NuxtPage />` the page keeps for per-output routes reads router
 * internals the route mock does not carry, and plays no part in the choice
 * under test, so it is stubbed out.
 */
async function mountPage() {
  return mountSuspended({
    components: { UApp, AnalysisResultsPage },
    template: '<UApp><AnalysisResultsPage /></UApp>',
  }, { global: { stubs: { NuxtPage: true } } })
}

describe('analysis results page', () => {
  // The first mount is the only cold-cache one in this file (the query cache is
  // shared by every mount), so the load-on-entry path is proven here.
  it('renders the registered view and hands it the loaded analysis', async () => {
    analysisIdParam.value = '7'
    workflowRow = workflow('satelliteFinder', '0.11')

    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('satellite view for analysis 7'))

    expect(wrapper.text()).toContain('Satellite Finder 0.11')
    expect(wrapper.text()).toContain('1 input(s), 1 output(s)')
    expect(wrapper.text()).toContain('first input genome.fasta tagged genome')
    expect(wrapper.text()).not.toContain('This workflow has no dedicated results view yet')
  })

  it('falls back to the generic results view, which tells the user the workflow has none yet', async () => {
    analysisIdParam.value = '8'
    workflowRow = workflow('defenseFinder', '2.0.0+galaxy1')

    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('This workflow has no dedicated results view yet'))

    // The test environment is a production build, where the path to create
    // stays with the developer: the development server alone shows it.
    expect(wrapper.text()).not.toContain('app/workflows/defenseFinder/2.0.0+galaxy1/results.vue')
    expect(wrapper.text()).not.toContain('satellite view')
  })

  it('treats a case or dot difference as no match', async () => {
    analysisIdParam.value = '9'
    workflowRow = workflow('satellitefinder', '0.1.1')

    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('This workflow has no dedicated results view yet'))

    expect(wrapper.text()).not.toContain('satellite view')
  })

  it('says the analysis was not found when the query cannot load it', async () => {
    analysisIdParam.value = '10'
    unknownAnalysisIds.add(10)

    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Analysis not found'))

    expect(wrapper.text()).not.toContain('This workflow has no dedicated results view yet')
    expect(wrapper.text()).not.toContain('satellite view')
  })
})
