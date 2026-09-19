import type { AnalysisMonitoringStats } from 'nuxt-galaxy'
import { UApp } from '#components'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
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
  route?: string,
) {
  return mountSuspended({
    components: { UApp, UsageStatisticsPanel },
    setup: () => ({ panelProps: { stats, ...extraProps } }),
    template: '<UApp><UsageStatisticsPanel v-bind="panelProps" /></UApp>',
  }, route ? { route } : undefined)
}

function tile(wrapper: Awaited<ReturnType<typeof mountPanel>>, key: string) {
  return wrapper.find(`[data-testid="usage-tile-${key}"]`)
}

/** The same statistics, with three consecutive days of trend attached. */
const STATS_WITH_TREND: AnalysisMonitoringStats = {
  ...STATS,
  trend: [
    { bucket: '2026-09-01', total: 4, success: 3, error: 1, cancelled: 0, pending: 0, successRate: 0.75 },
    { bucket: '2026-09-02', total: 0, success: 0, error: 0, cancelled: 0, pending: 0, successRate: 0 },
    { bucket: '2026-09-03', total: 5, success: 2, error: 1, cancelled: 1, pending: 1, successRate: 2 / 3 },
  ],
}

describe('usageStatisticsPanel', () => {
  it('shows the trend under the tiles when the response carries one', async () => {
    const wrapper = await mountPanel(STATS_WITH_TREND)
    const html = wrapper.html()

    expect(wrapper.find('[data-testid="usage-trend"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="usage-trend"] svg').exists()).toBe(true)
    expect(html.indexOf('usage-tile-total')).toBeLessThan(html.indexOf('usage-trend'))
  })

  it('draws a bar in the same colour the matching tile uses', async () => {
    const wrapper = await mountPanel(STATS_WITH_TREND)

    const tileIconStyle = wrapper.find('[data-testid="usage-tile-success"] [style*="color"]').attributes('style')
    const barFills = wrapper
      .findAll('[data-testid="usage-trend"] svg rect')
      .map(rect => rect.attributes('fill'))
      .filter((fill): fill is string => Boolean(fill))

    expect(tileIconStyle).toBeTruthy()
    expect(barFills.some(fill => tileIconStyle?.includes(fill))).toBe(true)
  })

  it('leaves the trend out when the response carries none', async () => {
    const wrapper = await mountPanel(STATS)

    expect(wrapper.find('[data-testid="usage-trend"]').exists()).toBe(false)
  })

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

/** The row for one workflow, found by the name it renders. */
function row(wrapper: Awaited<ReturnType<typeof mountPanel>>, name: string) {
  return wrapper.findAll('tbody tr').find(candidate => candidate.text().includes(name))
}

function query(wrapper: Awaited<ReturnType<typeof mountPanel>>) {
  return (wrapper.vm.$router as unknown as { currentRoute: { value: { query: Record<string, string> } } })
    .currentRoute
    .value
    .query
}

describe('the per-workflow table as the workflow picker', () => {
  it('selects the workflow whose row is clicked, in the URL', async () => {
    const wrapper = await mountPanel(STATS, {}, '/')

    await row(wrapper, 'Bacterial assembly')!.trigger('click')

    await vi.waitFor(() => {
      expect(query(wrapper).workflowId).toBe('7')
    })
  })

  it('selects the Unknown workflow, which is a row like any other', async () => {
    const wrapper = await mountPanel(STATS, {}, '/')

    await row(wrapper, 'Unknown workflow')!.trigger('click')

    // it has no identifier of its own, so it travels as a word
    await vi.waitFor(() => {
      expect(query(wrapper).workflowId).toBe('unknown')
    })
  })

  it('clears the selection when the selected row is clicked again', async () => {
    const wrapper = await mountPanel(STATS, {}, '/?workflowId=7')

    await row(wrapper, 'Bacterial assembly')!.trigger('click')

    await vi.waitFor(() => {
      expect(query(wrapper).workflowId).toBeUndefined()
    })
  })

  it('highlights the selected row, and only that one', async () => {
    const wrapper = await mountPanel(STATS, {}, '/?workflowId=9')

    expect(row(wrapper, 'Read quality control')!.attributes('data-selected')).toBe('true')
    expect(row(wrapper, 'Bacterial assembly')!.attributes('data-selected')).toBe('false')
  })

  it('marks the selected row by more than its colour', async () => {
    // a tint alone says nothing to a reader who cannot see it, and nothing at
    // all to one who cannot distinguish it
    const wrapper = await mountPanel(STATS, {}, '/?workflowId=9')

    const selected = row(wrapper, 'Read quality control')!
    expect(selected.find('[data-testid="usage-workflow-selected-bar"]').exists()).toBe(true)
    expect(selected.find('.sr-only').text()).toBe('Selected')
  })

  it('says the rows can be clicked, and what clicking one does', async () => {
    const wrapper = await mountPanel(STATS, {}, '/')

    // the hover tint reaches nobody on a touch screen, and no amount of
    // styling explains which part of the page a click would change
    expect(wrapper.find('[data-testid="usage-per-workflow-hint"]').text())
      .toContain('narrow the tiles and the trend')
  })

  it('gives a clickable row the cursor that says so', async () => {
    const wrapper = await mountPanel(STATS, {}, '/')

    expect(row(wrapper, 'Bacterial assembly')!.classes().join(' ')).toContain('cursor-pointer')
  })

  it('makes every row reachable from the keyboard', async () => {
    const wrapper = await mountPanel(STATS, {}, '/')
    const target = row(wrapper, 'Bacterial assembly')!

    expect(target.attributes('tabindex')).toBe('0')
    expect(target.attributes('role')).toBe('button')
  })

  it.each([
    ['Enter'],
    [' '],
  ])('selects the focused row on %s, which the table itself does not handle', async (key) => {
    // it announces every row as a button and gives it a tab stop, but binds
    // only a click: a reader would tab onto a button that does nothing
    const wrapper = await mountPanel(STATS, {}, '/')

    await row(wrapper, 'Bacterial assembly')!.trigger('keydown', { key })

    await vi.waitFor(() => {
      expect(query(wrapper).workflowId).toBe('7')
    })
  })

  it('clears the selection when the selected row is activated again from the keyboard', async () => {
    const wrapper = await mountPanel(STATS, {}, '/?workflowId=7')

    await row(wrapper, 'Bacterial assembly')!.trigger('keydown', { key: 'Enter' })

    await vi.waitFor(() => {
      expect(query(wrapper).workflowId).toBeUndefined()
    })
  })

  it('leaves other keys alone, so the page still scrolls and sorts', async () => {
    const wrapper = await mountPanel(STATS, {}, '/')

    await row(wrapper, 'Bacterial assembly')!.trigger('keydown', { key: 'ArrowDown' })
    await row(wrapper, 'Bacterial assembly')!.trigger('keydown', { key: 'Tab' })

    expect(query(wrapper).workflowId).toBeUndefined()
  })

  it('marks no row when every workflow is counted', async () => {
    const wrapper = await mountPanel(STATS, {}, '/')

    expect(wrapper.find('[data-testid="usage-workflow-selected-bar"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="usage-per-workflow"] .sr-only').exists()).toBe(false)
  })

  it('moves the mark when the selection moves', async () => {
    const wrapper = await mountPanel(STATS, {}, '/?workflowId=9')

    await row(wrapper, 'Bacterial assembly')!.trigger('click')

    await vi.waitFor(() => {
      expect(query(wrapper).workflowId).toBe('7')
    })
    await vi.waitFor(() => {
      expect(row(wrapper, 'Bacterial assembly')!.find('[data-testid="usage-workflow-selected-bar"]').exists()).toBe(true)
    })
    expect(row(wrapper, 'Read quality control')!.find('[data-testid="usage-workflow-selected-bar"]').exists()).toBe(false)
  })

  it('goes on listing every workflow while one is selected, because it is the picker', async () => {
    const wrapper = await mountPanel(STATS, {}, '/?workflowId=7')

    // the response is unnarrowed by design; a table that hid the rest would
    // leave a reader nothing to pick next
    expect(wrapper.find('[data-testid="usage-per-workflow"]').text()).toContain('Read quality control')
    expect(wrapper.find('[data-testid="usage-per-workflow"]').text()).toContain('Unknown workflow')
  })

  it('leaves the range and the bucket width alone when a workflow is picked', async () => {
    const wrapper = await mountPanel(STATS, {}, '/?range=7d&granularity=week')

    await row(wrapper, 'Bacterial assembly')!.trigger('click')

    await vi.waitFor(() => {
      expect(query(wrapper).workflowId).toBe('7')
    })
    expect(query(wrapper).range).toBe('7d')
    expect(query(wrapper).granularity).toBe('week')
  })
})

describe('what the tiles are counting', () => {
  it('says nothing while every workflow is counted', async () => {
    const wrapper = await mountPanel(STATS, {}, '/')

    expect(wrapper.find('[data-testid="usage-workflow-chip"]').exists()).toBe(false)
  })

  it('names the selected workflow and its version above the tiles', async () => {
    const wrapper = await mountPanel(STATS, {}, '/?workflowId=7')
    const html = wrapper.html()

    expect(wrapper.find('[data-testid="usage-workflow-chip"]').text()).toContain('Bacterial assembly 1.2')
    // above them, because it explains them
    expect(html.indexOf('usage-workflow-chip')).toBeLessThan(html.indexOf('usage-tile-total'))
  })

  it('names the Unknown workflow in the glossary\'s words, not the raw value', async () => {
    const wrapper = await mountPanel(STATS, {}, '/?workflowId=unknown')

    expect(wrapper.find('[data-testid="usage-workflow-chip"]').text()).toContain('Unknown workflow')
  })

  it('clears the selection when its × is pressed', async () => {
    const wrapper = await mountPanel(STATS, {}, '/?workflowId=7')

    await wrapper.find('[data-testid="usage-workflow-clear"]').trigger('click')

    await vi.waitFor(() => {
      expect(query(wrapper).workflowId).toBeUndefined()
    })
  })

  it('keeps naming a workflow the response has stopped listing', async () => {
    // mounted against a source the test can change, because the panel reads
    // `stats` as a prop and a new response is what this is about
    const stats = shallowRef<AnalysisMonitoringStats>(STATS)
    const wrapper = await mountSuspended({
      components: { UApp, UsageStatisticsPanel },
      setup: () => ({ stats }),
      template: '<UApp><UsageStatisticsPanel :stats="stats" /></UApp>',
    }, { route: '/?workflowId=7' })

    expect(wrapper.find('[data-testid="usage-workflow-chip"]').text()).toContain('Bacterial assembly')

    // the range moved to a window holding nothing of this workflow, though
    // other workflows still ran in it: the tiles read zero, and the chip must
    // still say what the zero is about
    stats.value = {
      ...STATS,
      total: 0,
      success: 0,
      error: 0,
      cancelled: 0,
      pending: 0,
      perWorkflow: [{ ...STATS.perWorkflow[2]! }],
    }

    // wait on the numbers, not on the chip: waiting on the thing under test
    // passes against the DOM as it was before Vue re-rendered
    await vi.waitFor(() => {
      expect(tile(wrapper, 'total').text()).toContain('0')
    })
    expect(wrapper.find('[data-testid="usage-workflow-chip"]').text()).toContain('Bacterial assembly')
  })

  it('shows zeroes and a way back when the selected workflow ran nothing in range', async () => {
    // "no analyses yet" would be false -- the account is not empty, this
    // workflow is -- and it would take away the chip and the table with it
    const emptyForSelection: AnalysisMonitoringStats = {
      ...STATS,
      total: 0,
      success: 0,
      error: 0,
      cancelled: 0,
      pending: 0,
    }
    const wrapper = await mountPanel(emptyForSelection, {}, '/?workflowId=7')

    expect(wrapper.text()).not.toContain('No analyses yet')
    expect(tile(wrapper, 'total').text()).toContain('0')
    expect(wrapper.find('[data-testid="usage-workflow-clear"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="usage-per-workflow"]').exists()).toBe(true)
  })

  it('still says there is nothing yet when there genuinely is not', async () => {
    const wrapper = await mountPanel(
      { ...STATS, total: 0, success: 0, error: 0, cancelled: 0, pending: 0, perWorkflow: [] },
      {},
      '/',
    )

    expect(wrapper.text()).toContain('No analyses yet')
  })

  it('falls back to the identifier on a cold load of a link into an empty range', async () => {
    // nothing has ever told this panel what workflow 42 is called
    const wrapper = await mountPanel({ ...STATS, perWorkflow: [] }, {}, '/?workflowId=42')

    expect(wrapper.find('[data-testid="usage-workflow-chip"]').text()).toContain('Workflow 42')
  })
})
