import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useGalaxyWorkflowDescription } from '../../../../src/runtime/app/composables/galaxy/useGalaxyWorkflowDescription'
import { flushPromises, mountWithPlugins } from '../../../utils/test-helpers'

const { requestFetch } = vi.hoisted(() => ({ requestFetch: vi.fn() }))

mockNuxtImport('useRequestFetch', () => () => requestFetch)

const Probe = defineComponent({
  setup() {
    const { description } = useGalaxyWorkflowDescription('0bd41bf44b0f6f7d', 1)
    return { description }
  },
  render: () => h('div'),
})

// #139. The analysis page reads the description while it is rendered on the
// server, where only the request's fetch carries the reader's session.
describe('useGalaxyWorkflowDescription', () => {
  it('asks for the description through the request\'s fetch', async () => {
    const description = { steps: {}, inputs: {}, tools: {}, unavailable: [] }
    requestFetch.mockResolvedValue(description)

    const wrapper = mountWithPlugins(Probe)
    await flushPromises()

    expect(requestFetch).toHaveBeenCalledWith('/api/galaxy/workflows/0bd41bf44b0f6f7d/revisions/1/description')
    expect(wrapper.vm.description).toEqual(description)
  })
})
