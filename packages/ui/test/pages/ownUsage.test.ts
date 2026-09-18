import type { AnalysisMonitoringStats } from 'nuxt-galaxy'
import { UApp } from '#components'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import OwnUsagePage from '../../app/pages/profile/usage.vue'

/** Distinctive numbers, so anything rendered can only have come from here. */
const OWN_STATS: AnalysisMonitoringStats = {
  total: 42,
  success: 30,
  error: 6,
  cancelled: 4,
  pending: 2,
  successRate: 30 / 36,
  perWorkflow: [
    {
      workflowId: 3,
      name: 'Variant calling',
      version: '4.1',
      total: 42,
      success: 30,
      error: 6,
      cancelled: 4,
      pending: 2,
      successRate: 30 / 36,
    },
  ],
  trend: [],
}

let timesServed = 0

registerEndpoint('/api/db/analyses/monitoring', () => {
  timesServed += 1
  return OWN_STATS
})

async function mountPage() {
  const wrapper = await mountSuspended({
    components: { UApp, OwnUsagePage },
    template: '<UApp><OwnUsagePage /></UApp>',
  })

  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="usage-tile-total"]').exists()).toBe(true)
  })

  return wrapper
}

describe('own usage page', () => {
  it('shows the signed-in user the usage statistics of their own analyses', async () => {
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="usage-tile-total"]').text()).toContain('42')
    expect(wrapper.find('[data-testid="usage-tile-successRate"]').text()).toContain('83%')
    expect(wrapper.find('[data-testid="usage-per-workflow"]').text()).toContain('Variant calling')
  })

  it('fetches again when refresh is pressed, however recently the page loaded', async () => {
    const wrapper = await mountPage()
    const servedBeforeRefresh = timesServed

    await wrapper.find('[data-testid="usage-refresh"]').trigger('click')

    await vi.waitFor(() => {
      expect(timesServed).toBe(servedBeforeRefresh + 1)
    })
  })
})
