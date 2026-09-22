import { describe, expect, it, vi } from 'vitest'
import { createShadowedReporter, describeResultsViews } from '../../modules/results-views/report'

describe('createShadowedReporter', () => {
  it('names each shadowed file and the file that hides it', () => {
    const report = vi.fn()
    const reportShadowed = createShadowedReporter(report)

    reportShadowed([
      { file: '/layer/app/workflows/results.vue', shadowedBy: '/app/app/workflows/results.vue' },
    ])

    expect(report).toHaveBeenCalledTimes(1)
    expect(report.mock.calls[0]?.[0]).toContain('/layer/app/workflows/results.vue')
    expect(report.mock.calls[0]?.[0]).toContain('/app/app/workflows/results.vue')
  })

  it('reports a file once however many times the scan repeats', () => {
    const report = vi.fn()
    const reportShadowed = createShadowedReporter(report)
    const shadowed = [
      { file: '/layer/app/workflows/results.vue', shadowedBy: '/app/app/workflows/results.vue' },
      { file: '/layer/app/workflows/satelliteFinder/0.11/results.vue', shadowedBy: '/app/app/workflows/satelliteFinder/0.11/results.vue' },
    ]

    reportShadowed(shadowed)
    reportShadowed(shadowed)
    reportShadowed(shadowed)

    expect(report).toHaveBeenCalledTimes(2)
  })

  it('still reports a file that starts being shadowed on a later scan', () => {
    const report = vi.fn()
    const reportShadowed = createShadowedReporter(report)

    reportShadowed([{ file: '/layer/app/workflows/results.vue', shadowedBy: '/app/app/workflows/results.vue' }])
    reportShadowed([
      { file: '/layer/app/workflows/results.vue', shadowedBy: '/app/app/workflows/results.vue' },
      { file: '/layer/app/workflows/padloc/results.vue', shadowedBy: '/app/app/workflows/padloc/results.vue' },
    ])

    expect(report).toHaveBeenCalledTimes(2)
    expect(report.mock.calls[1]?.[0]).toContain('/layer/app/workflows/padloc/results.vue')
  })
})

describe('describeResultsViews', () => {
  it('lists each view by its scope, and says none when there is no view', () => {
    expect(describeResultsViews([])).toBe('none')
    expect(describeResultsViews([
      { rung: 'exact', name: 'satelliteFinder', version: '0.11', file: '/a' },
      { rung: 'name-level', name: 'satelliteFinder', file: '/b' },
      { rung: 'app-wide', file: '/c' },
    ])).toBe('satelliteFinder/0.11, satelliteFinder/*, */*')
  })
})
