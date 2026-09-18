import { describe, expect, it } from 'vitest'
import { formatSuccessRate, trendBucketSummary, trendSegments, workflowUsageLabel } from '../app/utils/usageStatistics'

describe('formatSuccessRate', () => {
  it('has no value until an analysis has finished, and says why', () => {
    const display = formatSuccessRate({ success: 0, error: 0, successRate: 0 })

    expect(display.hasValue).toBe(false)
    expect(display.label).toBe('—')
    expect(display.tooltip).toBe('No completed analyses yet')
  })

  it('shows the rate it is given as a whole percentage', () => {
    // three Succeeded and one Failed is a rate of 0.75
    expect(formatSuccessRate({ success: 3, error: 1, successRate: 0.75 }).label).toBe('75%')
    // two Succeeded and one Failed rounds to 67%
    expect(formatSuccessRate({ success: 2, error: 1, successRate: 2 / 3 }).label).toBe('67%')
    expect(formatSuccessRate({ success: 5, error: 0, successRate: 1 }).label).toBe('100%')
  })

  it('tells a genuine zero rate apart from nothing having finished', () => {
    const everythingFailed = formatSuccessRate({ success: 0, error: 4, successRate: 0 })

    expect(everythingFailed.hasValue).toBe(true)
    expect(everythingFailed.label).toBe('0%')
    expect(everythingFailed.tooltip).toBeUndefined()
  })
})

describe('workflowUsageLabel', () => {
  it('names the bucket whose workflow was never recorded', () => {
    // the server sends this bucket with a null id; "unknown" must not reach the screen
    expect(workflowUsageLabel({ workflowId: null, name: 'unknown' })).toBe('Unknown workflow')
  })

  it('uses the workflow name snapshotted when the analysis was created', () => {
    expect(workflowUsageLabel({ workflowId: 7, name: 'Bacterial assembly' })).toBe('Bacterial assembly')
  })

  it('falls back to the Unknown workflow name when no name survived', () => {
    expect(workflowUsageLabel({ workflowId: 7, name: null })).toBe('Unknown workflow')
  })
})

describe('trendSegments', () => {
  it('turns a bucket into one segment per outcome that occurred', () => {
    const segments = trendSegments([
      { bucket: '2026-09-01', total: 4, success: 3, error: 1, cancelled: 0, pending: 0, successRate: 0.75 },
    ])

    expect(segments).toEqual([
      { bucket: '2026-09-01', outcome: 'Succeeded', count: 3, fill: expect.any(String) },
      { bucket: '2026-09-01', outcome: 'Failed', count: 1, fill: expect.any(String) },
    ])
  })

  it('leaves out outcomes that did not occur, so a zero-filled bucket draws no bar', () => {
    const segments = trendSegments([
      { bucket: '2026-09-02', total: 0, success: 0, error: 0, cancelled: 0, pending: 0, successRate: 0 },
    ])

    expect(segments).toEqual([])
  })

  it('stacks the outcomes in the order the tiles list them', () => {
    const segments = trendSegments([
      { bucket: '2026-09-03', total: 4, success: 1, error: 1, cancelled: 1, pending: 1, successRate: 0.5 },
    ])

    expect(segments.map(segment => segment.outcome)).toEqual(['Succeeded', 'Failed', 'Cancelled', 'Pending'])
  })
})

describe('trendBucketSummary', () => {
  it('summarises the bucket for whoever hovers it', () => {
    const summary = trendBucketSummary({
      bucket: '2026-09-01',
      total: 4,
      success: 3,
      error: 1,
      cancelled: 0,
      pending: 0,
      successRate: 0.75,
    })

    expect(summary).toContain('2026-09-01')
    expect(summary).toContain('UTC')
    expect(summary).toContain('3 Succeeded')
    expect(summary).toContain('1 Failed')
    expect(summary).toContain('Success rate 75%')
    // outcomes that did not occur are not worth the reader's attention
    expect(summary).not.toContain('Cancelled')
  })

  it('explains a missing rate instead of showing a bare dash', () => {
    const summary = trendBucketSummary({
      bucket: '2026-09-02',
      total: 2,
      success: 0,
      error: 0,
      cancelled: 0,
      pending: 2,
      successRate: 0,
    })

    expect(summary).toContain('2 Pending')
    // the dash carries the same meaning here as in a tile, and is explained
    expect(summary).toContain('Success rate —')
    expect(summary).toContain('No completed analyses yet')
  })
})
