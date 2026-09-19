import type { AnalysisMonitoringWorkflowUsage } from 'nuxt-galaxy'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import UsageOutcomeBar from '../../app/components/usage/UsageOutcomeBar.vue'
import { OUTCOME_FIELDS } from '../../app/utils/usageStatistics'

function usage(counts: Partial<AnalysisMonitoringWorkflowUsage> & { total: number }): AnalysisMonitoringWorkflowUsage {
  return {
    workflowId: 1,
    name: 'A workflow',
    version: '1.0',
    success: 0,
    error: 0,
    cancelled: 0,
    pending: 0,
    successRate: 0,
    ...counts,
  }
}

async function mountBar(entry: AnalysisMonitoringWorkflowUsage, maxTotal: number) {
  return mountSuspended(UsageOutcomeBar, { props: { usage: entry, maxTotal } })
}

/** The width a style attribute declares, as a number of percent. */
function widthOf(element: { attributes: (name: string) => string | undefined }) {
  return Number(/width:\s*([\d.]+)%/.exec(element.attributes('style') ?? '')?.[1])
}

describe('usageOutcomeBar', () => {
  it('draws one segment per outcome that occurred, and none for the rest', async () => {
    const wrapper = await mountBar(usage({ total: 10, success: 7, error: 3 }), 10)

    expect(wrapper.find('[data-testid="usage-outcome-segment-success"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="usage-outcome-segment-error"]').exists()).toBe(true)
    // a zero-width sliver would read as a thin stripe of something
    expect(wrapper.find('[data-testid="usage-outcome-segment-cancelled"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="usage-outcome-segment-pending"]').exists()).toBe(false)
  })

  it('splits the bar by how the runs turned out', async () => {
    const wrapper = await mountBar(usage({ total: 10, success: 7, error: 3 }), 10)

    expect(widthOf(wrapper.find('[data-testid="usage-outcome-segment-success"]'))).toBe(70)
    expect(widthOf(wrapper.find('[data-testid="usage-outcome-segment-error"]'))).toBe(30)
  })

  it('uses the colour the tiles and the trend already give each outcome', async () => {
    const wrapper = await mountBar(usage({ total: 2, success: 1, error: 1 }), 2)

    const failed = OUTCOME_FIELDS.find(field => field.key === 'error')!
    expect(wrapper.find('[data-testid="usage-outcome-segment-error"]').attributes('style'))
      .toContain(failed.fill)
  })

  it('gives the busiest workflow the full width', async () => {
    const wrapper = await mountBar(usage({ total: 200, success: 200 }), 200)

    expect(widthOf(wrapper.find('.flex'))).toBe(100)
  })

  it('makes length mean volume, so a quiet workflow draws a short bar', async () => {
    // the point of the whole column: 34 failures and 1 failure stop looking
    // like the same size of problem
    const wrapper = await mountBar(usage({ total: 50, success: 50 }), 200)

    expect(widthOf(wrapper.find('.flex'))).toBe(25)
  })

  it('keeps a single run visible rather than rounding it away', async () => {
    const wrapper = await mountBar(usage({ total: 1, success: 1 }), 200)

    // half a percent draws nothing at all, and "ran once" must not look like
    // "never ran"
    expect(widthOf(wrapper.find('.flex'))).toBe(2)
  })

  it('draws nothing at all before any workflow has run', async () => {
    const wrapper = await mountBar(usage({ total: 0 }), 0)

    expect(widthOf(wrapper.find('.flex'))).toBe(0)
    expect(wrapper.findAll('[data-testid^="usage-outcome-segment-"]')).toHaveLength(0)
  })

  it('stays out of the way of a screen reader, which has the counts beside it', async () => {
    const wrapper = await mountBar(usage({ total: 10, success: 7, error: 3 }), 10)

    expect(wrapper.find('[data-testid="usage-outcome-bar"]').attributes('aria-hidden')).toBe('true')
  })
})
