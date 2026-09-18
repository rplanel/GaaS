import type { AnalysisMonitoringStats } from 'nuxt-galaxy'
import { UApp } from '#components'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import GlobalUsagePage from '../../app/pages/admin/usage.vue'

/**
 * Every user's analyses in aggregate. Distinctive numbers, so anything
 * rendered can only have come from the admin endpoint.
 */
const GLOBAL_STATS: AnalysisMonitoringStats = {
  total: 137,
  success: 90,
  error: 20,
  cancelled: 12,
  pending: 15,
  successRate: 90 / 110,
  perWorkflow: [
    {
      workflowId: 11,
      name: 'Metagenomics profiling',
      version: '3.0',
      total: 137,
      success: 90,
      error: 20,
      cancelled: 12,
      pending: 15,
      successRate: 90 / 110,
    },
  ],
  trend: [],
}

/** A web application on which nobody has run anything yet. */
const NO_ANALYSES: AnalysisMonitoringStats = {
  total: 0,
  success: 0,
  error: 0,
  cancelled: 0,
  pending: 0,
  successRate: 0,
  perWorkflow: [],
  trend: [],
}

/** The role the signed-in user carries, as the JWT claim reports it. */
const userRole = ref<string | undefined>('admin')

mockNuxtImport('useUserRole', () => () => ({ userRole }))
mockNuxtImport('useSupabaseClient', () => () => ({} as never))

/** Swapped per test, so one endpoint can serve statistics or refuse. */
let respond: () => unknown = () => GLOBAL_STATS
let timesServed = 0

/** The parameters the page last asked the endpoint for. */
let lastQuery: Record<string, string> = {}

registerEndpoint('/api/db/analyses/monitoring/admin', (event) => {
  timesServed += 1
  lastQuery = Object.fromEntries(new URLSearchParams(event.path?.split('?')[1] ?? ''))
  return respond()
})

/**
 * A route may be given to set the filter state the page reads. Mounted at `/`
 * for the reason the own-usage page's tests are: the test application has no
 * session, and a protected path redirects with the query discarded.
 */
async function mountPage(route?: string) {
  return mountSuspended({
    components: { UApp, GlobalUsagePage },
    template: '<UApp><GlobalUsagePage /></UApp>',
  }, route ? { route } : undefined)
}

describe('global usage page', () => {
  // first, so this one meets a cold cache and the refusal lands on entry
  it('surfaces a refusal on entry as an error state rather than crashing', async () => {
    // a role claim can outlive the role itself, which is what the endpoint's
    // own check is there for
    userRole.value = 'admin'
    respond = () => new Response('Forbidden', { status: 403 })

    const wrapper = await mountPage()

    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="usage-error"]').exists()).toBe(true)
    })

    expect(wrapper.find('[data-testid="usage-error"]').text()).toContain('403')
    expect(wrapper.find('[data-testid="usage-tile-total"]').exists()).toBe(false)
  })

  it('shows an administrator the usage statistics of every user, from the admin endpoint', async () => {
    userRole.value = 'admin'
    respond = () => GLOBAL_STATS

    const wrapper = await mountPage()

    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="usage-tile-total"]').exists()).toBe(true)
    })

    expect(wrapper.find('[data-testid="usage-tile-total"]').text()).toContain('137')
    expect(wrapper.find('[data-testid="usage-tile-successRate"]').text()).toContain('82%')
    expect(wrapper.find('[data-testid="usage-per-workflow"]').text()).toContain('Metagenomics profiling')
  })

  it('tells a non-admin they lack the permission, and asks the endpoint for nothing', async () => {
    userRole.value = 'user'
    respond = () => GLOBAL_STATS
    const servedBefore = timesServed

    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('You don\'t have the admin permission')
    expect(wrapper.find('[data-testid="usage-tile-total"]').exists()).toBe(false)
    expect(timesServed).toBe(servedBefore)
  })

  it('states the empty case without inviting an administrator to run a workflow', async () => {
    userRole.value = 'admin'
    respond = () => GLOBAL_STATS

    const wrapper = await mountPage()
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="usage-refresh"]').exists()).toBe(true)
    })

    respond = () => NO_ANALYSES
    await wrapper.find('[data-testid="usage-refresh"]').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="usage-empty"]').exists()).toBe(true)
    })

    expect(wrapper.find('[data-testid="usage-empty"]').text()).toContain('No analyses have been run yet')
    expect(wrapper.text()).not.toContain('Run a workflow')
  })
})

describe('global usage over a range and a granularity', () => {
  it('narrows and buckets the global view exactly as the own view does', async () => {
    userRole.value = 'admin'
    respond = () => GLOBAL_STATS

    await mountPage('/?from=2026-08-01&to=2026-08-31')

    await vi.waitFor(() => {
      expect(lastQuery).toEqual({ from: '2026-08-01', to: '2026-08-31', granularity: 'day' })
    })
  })

  it('forwards an override from the URL', async () => {
    userRole.value = 'admin'
    respond = () => GLOBAL_STATS

    await mountPage('/?range=30d&granularity=week')

    await vi.waitFor(() => {
      expect(lastQuery.granularity).toBe('week')
    })
  })
})
