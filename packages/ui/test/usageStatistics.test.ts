import { describe, expect, it } from 'vitest'
import { formatSuccessRate, workflowUsageLabel } from '../app/utils/usageStatistics'

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
