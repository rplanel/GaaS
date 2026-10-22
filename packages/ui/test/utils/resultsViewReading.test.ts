import { describe, expect, it } from 'vitest'
import { resultsViewReading } from '../../app/utils/resultsViewReading'

describe('resultsViewReading', () => {
  it('reads the exact rung as exact and no rung as none', () => {
    expect(resultsViewReading('exact')).toBe('exact')
    expect(resultsViewReading('none')).toBe('none')
  })

  it('reads both wider rungs as one fallback, since either stands in for a view of the workflow itself', () => {
    expect(resultsViewReading('name-level')).toBe('fallback')
    expect(resultsViewReading('app-wide')).toBe('fallback')
  })
})
