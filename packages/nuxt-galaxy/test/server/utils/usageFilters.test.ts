import { describe, expect, it } from 'vitest'
import { parseUsageFilters } from '../../../src/runtime/server/utils/usageFilters'

describe('parseUsageFilters', () => {
  it('asks for nothing when neither bound is given', () => {
    expect(parseUsageFilters({})).toEqual({})
  })

  it('reads a calendar day as the UTC instant it starts at', () => {
    expect(parseUsageFilters({ from: '2026-08-01' }).from).toEqual(new Date('2026-08-01T00:00:00.000Z'))
  })

  it('includes the whole of the day named by `to`', () => {
    // a reader asking "to 31 August" means the 31st counts, so the exclusive
    // bound the query works with is the start of 1 September
    expect(parseUsageFilters({ to: '2026-08-31' }).to).toEqual(new Date('2026-09-01T00:00:00.000Z'))
  })

  it('accepts a single day named as both bounds', () => {
    const { from, to } = parseUsageFilters({ from: '2026-08-31', to: '2026-08-31' })

    expect(from).toEqual(new Date('2026-08-31T00:00:00.000Z'))
    expect(to).toEqual(new Date('2026-09-01T00:00:00.000Z'))
  })

  it.each([
    ['yesterday'],
    ['2026-8-1'],
    ['01/08/2026'],
    ['2026-08-01T10:00:00Z'],
    ['2026-02-31'],
  ])('rejects %s with 400', (value) => {
    expect(() => parseUsageFilters({ from: value })).toThrowError(expect.objectContaining({ statusCode: 400 }))
  })

  it('rejects a reversed range with 400', () => {
    expect(() => parseUsageFilters({ from: '2026-09-02', to: '2026-09-01' }))
      .toThrowError(expect.objectContaining({ statusCode: 400 }))
  })
})
