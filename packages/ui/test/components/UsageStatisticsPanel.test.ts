import type { AnalysisMonitoringStats } from 'nuxt-galaxy'
import { UApp } from '#components'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import UsageStatisticsPanel from '../../app/components/usage/UsageStatisticsPanel.vue'

/** Nine analyses: five Succeeded, two Failed, one Cancelled, one still Pending. */
const STATS: AnalysisMonitoringStats = {
  total: 9,
  success: 5,
  error: 2,
  cancelled: 1,
  pending: 1,
  successRate: 5 / 7,
  perWorkflow: [
    {
      workflowId: 7,
      name: 'Bacterial assembly',
      version: '1.2',
      total: 7,
      success: 4,
      error: 2,
      cancelled: 1,
      pending: 0,
      successRate: 4 / 6,
    },
    {
      // the bucket for analyses whose workflow was deleted before it was named
      workflowId: null,
      name: 'unknown',
      version: null,
      total: 1,
      success: 1,
      error: 0,
      cancelled: 0,
      pending: 0,
      successRate: 1,
    },
    {
      // still running, so this workflow has no success rate yet
      workflowId: 9,
      name: 'Read quality control',
      version: '2.0',
      total: 1,
      success: 0,
      error: 0,
      cancelled: 0,
      pending: 1,
      successRate: 0,
    },
  ],
  trend: [],
}

/**
 * Mounts the panel inside the app shell, which is what provides the tooltip
 * context in the running application.
 */
async function mountPanel(
  stats: AnalysisMonitoringStats | undefined,
  extraProps: Record<string, unknown> = {},
) {
  return mountSuspended({
    components: { UApp, UsageStatisticsPanel },
    setup: () => ({ panelProps: { stats, ...extraProps } }),
    template: '<UApp><UsageStatisticsPanel v-bind="panelProps" /></UApp>',
  })
}

function tile(wrapper: Awaited<ReturnType<typeof mountPanel>>, key: string) {
  return wrapper.find(`[data-testid="usage-tile-${key}"]`)
}

describe('usageStatisticsPanel', () => {
  it('counts the analyses of every outcome, under the names a user reads', async () => {
    const wrapper = await mountPanel(STATS)

    expect(tile(wrapper, 'total').text()).toContain('Total')
    expect(tile(wrapper, 'total').text()).toContain('9')

    expect(tile(wrapper, 'success').text()).toContain('Succeeded')
    expect(tile(wrapper, 'success').text()).toContain('5')

    expect(tile(wrapper, 'error').text()).toContain('Failed')
    expect(tile(wrapper, 'error').text()).toContain('2')

    expect(tile(wrapper, 'cancelled').text()).toContain('Cancelled')
    expect(tile(wrapper, 'cancelled').text()).toContain('1')

    expect(tile(wrapper, 'pending').text()).toContain('Pending')
    expect(tile(wrapper, 'pending').text()).toContain('1')
  })

  it('shows the success rate it was given', async () => {
    const wrapper = await mountPanel(STATS)

    // five Succeeded of seven finished is 71%
    expect(tile(wrapper, 'successRate').text()).toContain('Success rate')
    expect(tile(wrapper, 'successRate').text()).toContain('71%')
  })

  it('shows a dash for the success rate while nothing has finished, and says why', async () => {
    const nothingFinished: AnalysisMonitoringStats = {
      ...STATS,
      total: 2,
      success: 0,
      error: 0,
      cancelled: 0,
      pending: 2,
      successRate: 0,
      perWorkflow: [],
    }

    const wrapper = await mountPanel(nothingFinished)

    expect(tile(wrapper, 'successRate').text()).toContain('—')
    expect(tile(wrapper, 'successRate').text()).not.toContain('0%')
    expect(wrapper.findComponent({ name: 'UTooltip' }).props('text')).toBe('No completed analyses yet')
  })

  it('lists usage for every workflow version it was given', async () => {
    const wrapper = await mountPanel(STATS)
    const perWorkflow = wrapper.find('[data-testid="usage-per-workflow"]')

    expect(perWorkflow.text()).toContain('Bacterial assembly')
    expect(perWorkflow.text()).toContain('1.2')
    expect(perWorkflow.text()).toContain('Read quality control')
    expect(perWorkflow.text()).toContain('2.0')
  })

  it('names the unknown workflow bucket rather than showing the raw value', async () => {
    const wrapper = await mountPanel(STATS)
    const perWorkflow = wrapper.find('[data-testid="usage-per-workflow"]')

    expect(perWorkflow.text()).toContain('Unknown workflow')
    expect(perWorkflow.text()).not.toContain('unknown')
  })

  it('applies the same dash rule to a workflow with nothing finished', async () => {
    const wrapper = await mountPanel(STATS)
    const rowTexts = wrapper.findAll('[data-testid="usage-per-workflow"] tbody tr').map(row => row.text())

    const stillRunning = rowTexts.find(text => text.includes('Read quality control'))
    expect(stillRunning).toBeDefined()
    expect(stillRunning).toContain('—')

    const finished = rowTexts.find(text => text.includes('Bacterial assembly'))
    expect(finished).toContain('67%')

    // the row explains its dash the same way the tile does
    const explanations = wrapper
      .findAllComponents({ name: 'UTooltip' })
      .map(tooltip => tooltip.props('text'))
    expect(explanations).toContain('No completed analyses yet')
  })

  it('points a user with no analyses at the workflows page instead of showing zeroes', async () => {
    const nothingYet: AnalysisMonitoringStats = {
      total: 0,
      success: 0,
      error: 0,
      cancelled: 0,
      pending: 0,
      successRate: 0,
      perWorkflow: [],
      trend: [],
    }

    const wrapper = await mountPanel(nothingYet)

    expect(wrapper.text()).toContain('No analyses yet')
    expect(wrapper.find('a[href="/workflows"]').exists()).toBe(true)
    expect(tile(wrapper, 'total').exists()).toBe(false)
    expect(wrapper.find('[data-testid="usage-per-workflow"]').exists()).toBe(false)
  })

  it('asks its host to reload the statistics when refresh is pressed', async () => {
    const wrapper = await mountPanel(STATS)
    const panel = wrapper.findComponent(UsageStatisticsPanel)

    await wrapper.find('[data-testid="usage-refresh"]').trigger('click')

    expect(panel.emitted('refresh')).toHaveLength(1)
  })

  it('never shows the raw outcome wording the data uses', async () => {
    const wrapper = await mountPanel(STATS)
    const rendered = [
      wrapper.find('[data-testid="usage-tile-error"]').text(),
      wrapper.find('[data-testid="usage-per-workflow"]').text(),
    ].join(' ')

    expect(rendered).not.toContain('error')
    expect(rendered).not.toContain('monitoring')
  })

  it('shows a placeholder while it has no statistics yet, rather than an empty page', async () => {
    const wrapper = await mountPanel(undefined)

    expect(wrapper.find('[data-testid="usage-loading"]').exists()).toBe(true)
    expect(tile(wrapper, 'total').exists()).toBe(false)
    // nothing loaded is not the same as nothing to show
    expect(wrapper.text()).not.toContain('No analyses yet')
  })

  it('says so, and why, when the statistics could not be loaded', async () => {
    const wrapper = await mountPanel(undefined, { errorMessage: 'Service unavailable' })

    expect(wrapper.text()).toContain('Could not load usage statistics')
    expect(wrapper.text()).toContain('Service unavailable')
    expect(wrapper.find('[data-testid="usage-loading"]').exists()).toBe(false)
  })
})
