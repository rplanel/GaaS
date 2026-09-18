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
/** The parameters the page last asked the endpoint for. */
let lastQuery: Record<string, string> = {}

registerEndpoint('/api/db/analyses/monitoring', (event) => {
  timesServed += 1
  lastQuery = Object.fromEntries(new URLSearchParams(event.path?.split('?')[1] ?? ''))
  return OWN_STATS
})

/**
 * A route may be given to set the filter state the page reads. It is mounted at
 * `/` because the test application has no session and the Supabase middleware
 * answers a protected path with a redirect that would discard the query; the
 * page reads query parameters and nothing else.
 */
async function mountPage(route?: string) {
  const wrapper = await mountSuspended({
    components: { UApp, OwnUsagePage },
    template: '<UApp><OwnUsagePage /></UApp>',
  }, route ? { route } : undefined)

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

/** Whole days from one calendar day to another. */
function daysApart(from: string, to: string) {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
}

describe('own usage over a range', () => {
  it('asks for the last 30 days when the reader has chosen nothing', async () => {
    await mountPage()

    await vi.waitFor(() => {
      expect(lastQuery.from).toBeDefined()
    })
    // thirty days counting today, so twenty-nine days between the two ends
    expect(daysApart(lastQuery.from!, lastQuery.to!)).toBe(29)
  })

  it('asks for the range a preset token names', async () => {
    await mountPage('/?range=7d')

    await vi.waitFor(() => {
      expect(daysApart(lastQuery.from!, lastQuery.to!)).toBe(6)
    })
  })

  it('asks for exactly the dates a custom range names', async () => {
    await mountPage('/?from=2026-08-01&to=2026-08-31')

    await vi.waitFor(() => {
      expect(lastQuery).toEqual({ from: '2026-08-01', to: '2026-08-31' })
    })
  })

  it('asks for no bounds at all for all time', async () => {
    await mountPage('/?range=all')

    await vi.waitFor(() => {
      expect(lastQuery).toEqual({})
    })
  })
})
