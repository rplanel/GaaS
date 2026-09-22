import { UApp } from '#components'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import AnalysisResultsPage from '../../app/pages/analyses/[analysisId]/results.vue'

/**
 * The registry the build would have generated from
 * `app/workflows/satelliteFinder/0.11/results.vue`: one view, whose rendered
 * text can only come from it.
 */
vi.mock('#build/gaas/results-views.mjs', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    resultsViews: [
      {
        name: 'satelliteFinder',
        version: '0.11',
        component: defineComponent({
          props: { analysisId: { type: Number, required: true } },
          setup: props => () => h('p', `satellite view for analysis ${props.analysisId}`),
        }),
      },
    ],
  }
})

/** The analysis the page is opened on; each test picks its own id so none meets another's cache entry. */
const analysisIdParam = ref('7')

mockNuxtImport('useRoute', () => () => ({ params: { analysisId: analysisIdParam.value } }))
mockNuxtImport('useSupabaseClient', () => () => ({} as never))

/** A workflow row reduced to what the page reads from it. */
function workflow(nameKey: string, versionKey: string) {
  return { id: 1, name: 'Satellite Finder', name_key: nameKey, version_key: versionKey }
}

/** The workflow the query answers with, swapped per test. */
let workflowRow: ReturnType<typeof workflow> = workflow('satelliteFinder', '0.11')

mockNuxtImport('analysisByIdWithOutputsAndWorkflowsQuery', () => ({ id }: { id: number }) => ({
  key: ['test', 'analysis', id],
  query: async () => ({ id, name: 'run', workflows: workflowRow, analysis_outputs: [] }),
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
  it('renders the registered view for a workflow whose name and version match a directory', async () => {
    analysisIdParam.value = '7'
    workflowRow = workflow('satelliteFinder', '0.11')

    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('satellite view for analysis 7'))

    expect(wrapper.text()).not.toContain('No results view for this workflow')
  })

  it('falls back to the generic results view when no directory matches', async () => {
    analysisIdParam.value = '8'
    workflowRow = workflow('defenseFinder', '2.0.0+galaxy1')

    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('No results view for this workflow'))

    expect(wrapper.text()).not.toContain('satellite view')
  })

  it('treats a case or dot difference as no match', async () => {
    analysisIdParam.value = '9'
    workflowRow = workflow('satellitefinder', '0.1.1')

    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('No results view for this workflow'))

    expect(wrapper.text()).not.toContain('satellite view')
  })
})
