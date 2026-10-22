import type { ResultsViewAnalysis } from 'nuxt-galaxy'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import WorkflowResultGeneric from '../../app/components/workflow/result/WorkflowResultGeneric.vue'

/**
 * The mode the view believes it runs in. The test environment is a production
 * build, so the development case has to be switched on by hand.
 */
const { mode } = vi.hoisted(() => ({ mode: { development: false } }))
mockNuxtImport('isDevelopmentMode', () => () => mode.development)

/** An analysis reduced to what the generic view reads: its workflow's two tag values. */
function analysisOf(nameKey: string, versionKey: string): ResultsViewAnalysis {
  return {
    id: 7,
    name: 'run',
    workflows: { id: 1, name: 'Satellite Finder', name_key: nameKey, version_key: versionKey },
    analysis_inputs: [],
    analysis_outputs: [],
  } as unknown as ResultsViewAnalysis
}

async function mountView(nameKey: string, versionKey: string) {
  return mountSuspended(WorkflowResultGeneric, {
    props: { analysisId: 7, analysis: analysisOf(nameKey, versionKey) },
  })
}

describe('workflowResultGeneric', () => {
  it('in production, tells the user the workflow has no dedicated results view yet, and nothing else', async () => {
    mode.development = false

    const wrapper = await mountView('satelliteFinder', '0.11')

    expect(wrapper.text().trim()).toBe('This workflow has no dedicated results view yet.')
    expect(wrapper.text()).not.toContain('results.vue')
    expect(wrapper.text()).not.toContain('satelliteFinder')
    expect(wrapper.text()).not.toContain('WorkflowResultGeneric')
  })

  it('in development, also names the file to create, with the tag values written as tagged', async () => {
    mode.development = true

    const wrapper = await mountView('satelliteFinder', '0.11')

    expect(wrapper.text()).toContain('This workflow has no dedicated results view yet.')
    expect(wrapper.find('code').text()).toBe('app/workflows/satelliteFinder/0.11/results.vue')
  })

  it('in development, keeps the case and every character of the tag values in the path', async () => {
    mode.development = true

    const wrapper = await mountView('Defense-Finder', '2.0.0+galaxy1')

    expect(wrapper.find('code').text()).toBe('app/workflows/Defense-Finder/2.0.0+galaxy1/results.vue')
  })
})
