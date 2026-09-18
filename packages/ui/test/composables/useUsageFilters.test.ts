import { describe, expect, it } from 'vitest'
import { presetRange } from '../../app/composables/useUsageFilters'

/** A Wednesday, well inside a month, so nothing hinges on a boundary. */
const TODAY = new Date('2026-09-16T18:30:00.000Z')

describe('presetRange', () => {
  it('counts today as one of the days, so seven days means seven buckets', () => {
    expect(presetRange('7d', TODAY)).toEqual({ from: '2026-09-10', to: '2026-09-16' })
  })

  it('reaches back across a month boundary without arithmetic drift', () => {
    expect(presetRange('30d', TODAY)).toEqual({ from: '2026-08-18', to: '2026-09-16' })
  })

  it('reaches back across several months', () => {
    expect(presetRange('90d', TODAY)).toEqual({ from: '2026-06-19', to: '2026-09-16' })
  })

  it('asks for no bounds at all for all time, which is what the endpoint defaults to', () => {
    expect(presetRange('all', TODAY)).toEqual({})
  })

  it('reads the day in UTC, not in whatever zone the reader keeps', () => {
    // late evening in UTC+2 is still the same UTC day; a local reading would
    // roll this to the 17th and shift every bucket
    expect(presetRange('7d', new Date('2026-09-16T23:30:00.000Z')).to).toBe('2026-09-16')
  })
})
