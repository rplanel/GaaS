import type { AnalysisMonitoringTrendPoint } from 'nuxt-galaxy'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import UsageTrendChart from '../../app/components/usage/UsageTrendChart.vue'

/**
 * Three consecutive days: one with results, one with nothing at all, one still
 * running. The empty day is what zero-fill produces.
 */
const TREND: AnalysisMonitoringTrendPoint[] = [
  { bucket: '2026-09-01', total: 4, success: 3, error: 1, cancelled: 0, pending: 0, successRate: 0.75 },
  { bucket: '2026-09-02', total: 0, success: 0, error: 0, cancelled: 0, pending: 0, successRate: 0 },
  { bucket: '2026-09-03', total: 2, success: 0, error: 0, cancelled: 0, pending: 2, successRate: 0 },
]

async function mountTrend(trend: AnalysisMonitoringTrendPoint[]) {
  return mountSuspended(UsageTrendChart, { props: { trend } })
}

/** The drawn bars, told apart from hover targets by carrying an outcome colour. */
function outcomeBars(wrapper: Awaited<ReturnType<typeof mountTrend>>) {
  return wrapper
    .findAll('svg rect')
    .filter(rect => (rect.attributes('fill') ?? '').includes('--ui-color-'))
}

describe('usageTrendChart', () => {
  it('draws one bar for every outcome that occurred in a bucket', async () => {
    const wrapper = await mountTrend(TREND)

    expect(wrapper.find('svg').exists()).toBe(true)
    // three Succeeded and one Failed on the first day, two Pending on the third
    expect(outcomeBars(wrapper)).toHaveLength(3)
  })

  it('names each outcome, so the colours can be read without hovering', async () => {
    const wrapper = await mountTrend(TREND)

    expect(wrapper.text()).toContain('Succeeded')
    expect(wrapper.text()).toContain('Failed')
    expect(wrapper.text()).toContain('Cancelled')
    expect(wrapper.text()).toContain('Pending')
  })

  it('keeps an empty bucket on the axis rather than closing the gap', async () => {
    const wrapper = await mountTrend(TREND)

    expect(wrapper.text()).toContain('2026-09-02')
  })

  it('says which time zone the buckets are in', async () => {
    const wrapper = await mountTrend(TREND)

    expect(wrapper.text()).toContain('UTC')
  })

  it('carries each bucket its own summary for hovering', async () => {
    const wrapper = await mountTrend(TREND)
    const summaries = wrapper.findAll('svg title').map(title => title.text())

    expect(summaries.some(summary =>
      summary.includes('3 Succeeded') && summary.includes('Success rate 75%'),
    )).toBe(true)

    // the day that is still running has no rate to show
    expect(summaries.some(summary =>
      summary.includes('2 Pending') && summary.includes('No completed analyses yet'),
    )).toBe(true)
  })

  it('lets a bucket with no analyses be hovered too', async () => {
    const wrapper = await mountTrend(TREND)
    const summaries = wrapper.findAll('svg title').map(title => title.text())

    // the quiet day is precisely the one a reader wonders about
    expect(summaries.some(summary => summary.includes('2026-09-02'))).toBe(true)
  })

  it('draws nothing but stays silent when the trend is empty', async () => {
    const wrapper = await mountTrend([])

    expect(outcomeBars(wrapper)).toHaveLength(0)
  })
})
