import { describe, expect, it } from 'vitest'
import { parseTrendGranularity, parseUsageFilters, parseWorkflowSelection } from '../../../src/runtime/server/utils/usageFilters'

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

  it('rejects a range longer than anything worth drawing, with 400', () => {
    // unbounded, the trend would generate a point per day between these two
    expect(() => parseUsageFilters({ from: '0001-01-01', to: '9999-12-31' }))
      .toThrowError(expect.objectContaining({ statusCode: 400 }))
  })

  it('accepts a long but sane range', () => {
    expect(parseUsageFilters({ from: '2020-01-01', to: '2026-01-01' }).from)
      .toEqual(new Date('2020-01-01T00:00:00.000Z'))
  })

  it('rejects a reversed range with 400', () => {
    expect(() => parseUsageFilters({ from: '2026-09-02', to: '2026-09-01' }))
      .toThrowError(expect.objectContaining({ statusCode: 400 }))
  })
})

describe('parseTrendGranularity', () => {
  it.each(['day', 'week', 'month'] as const)('reads %s, which is a bucket width the trend knows', (granularity) => {
    expect(parseTrendGranularity({ granularity })).toBe(granularity)
  })

  it('buckets by day when nothing is asked for', () => {
    expect(parseTrendGranularity({})).toBe('day')
  })

  it('buckets by day when the parameter is present but empty', () => {
    // `?granularity=` is a parameter nobody chose, the same as leaving it out
    expect(parseTrendGranularity({ granularity: '' })).toBe('day')
  })

  it.each([
    ['hour'],
    ['Day'],
    ['1 week'],
    ['year'],
  ])('rejects %s with 400', (value) => {
    expect(() => parseTrendGranularity({ granularity: value }))
      .toThrowError(expect.objectContaining({ statusCode: 400 }))
  })

  it('rejects a repeated parameter with 400 rather than picking one of them', () => {
    expect(() => parseTrendGranularity({ granularity: ['day', 'month'] }))
      .toThrowError(expect.objectContaining({ statusCode: 400 }))
  })
})

describe('parseWorkflowSelection', () => {
  it('selects every workflow when nothing is asked for', () => {
    expect(parseWorkflowSelection({})).toBeUndefined()
  })

  it('selects every workflow when the parameter is present but empty', () => {
    // `?workflowId=` is a parameter nobody chose, as `?from=` and
    // `?granularity=` already are
    expect(parseWorkflowSelection({ workflowId: '' })).toBeUndefined()
  })

  it('reads an identifier as the number it is', () => {
    expect(parseWorkflowSelection({ workflowId: '3' })).toBe(3)
    expect(parseWorkflowSelection({ workflowId: '42' })).toBe(42)
  })

  it('reads the Unknown workflow token', () => {
    // the bucket has no identifier of its own, so it travels as a word
    expect(parseWorkflowSelection({ workflowId: 'unknown' })).toBe('unknown')
  })

  it.each([
    ['abc'],
    ['Unknown'],
    ['-1'],
    ['1.5'],
    ['3,4'],
    ['+3'],
    [' 3'],
  ])('rejects %s with 400', (value) => {
    expect(() => parseWorkflowSelection({ workflowId: value }))
      .toThrowError(expect.objectContaining({ statusCode: 400 }))
  })

  it('rejects zero with 400, because identifiers start at one', () => {
    expect(() => parseWorkflowSelection({ workflowId: '0' }))
      .toThrowError(expect.objectContaining({ statusCode: 400 }))
  })

  it.each([
    ['0x10'],
    ['1e3'],
  ])('rejects %s rather than reading it as a number some other way', (value) => {
    // Number() would take these for 16 and 1000; an identifier in a URL is
    // written in plain digits or it is a mistake
    expect(() => parseWorkflowSelection({ workflowId: value }))
      .toThrowError(expect.objectContaining({ statusCode: 400 }))
  })

  it('rejects a repeated parameter with 400 rather than picking one of them', () => {
    expect(() => parseWorkflowSelection({ workflowId: ['3', '4'] }))
      .toThrowError(expect.objectContaining({ statusCode: 400 }))
  })
})
