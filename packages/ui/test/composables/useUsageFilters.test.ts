import { describe, expect, it } from 'vitest'
import { automaticGranularity, presetRange, rangeFromSelection, workflowSelectionFromToken } from '../../app/composables/useUsageFilters'

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

describe('rangeFromSelection', () => {
  /** A day as the calendar hands it back. */
  const day = (iso: string) => ({ toString: () => iso })

  it('is nothing while a reader has picked only the first end', () => {
    expect(rangeFromSelection({ start: day('2026-08-01'), end: undefined })).toBeUndefined()
  })

  it('is nothing when the calendar reports no selection at all', () => {
    expect(rangeFromSelection(undefined)).toBeUndefined()
    expect(rangeFromSelection({ start: null, end: null })).toBeUndefined()
  })

  it('is the two days once both ends are known', () => {
    expect(rangeFromSelection({ start: day('2026-08-01'), end: day('2026-08-31') }))
      .toEqual({ from: '2026-08-01', to: '2026-08-31' })
  })
})

describe('automaticGranularity', () => {
  it.each([
    ['7d' as const, 'day'],
    ['30d' as const, 'day'],
    ['90d' as const, 'day'],
  ])('draws %s by day, which is the span a daily bar is legible over', (preset, expected) => {
    expect(automaticGranularity(presetRange(preset, TODAY), TODAY)).toBe(expected)
  })

  it('stays daily right up to ninety days', () => {
    expect(automaticGranularity({ from: '2026-06-19', to: '2026-09-16' }, TODAY)).toBe('day')
  })

  it('moves to weeks the day after that', () => {
    // ninety-one days is ninety-one bars, which is past reading a date off one
    expect(automaticGranularity({ from: '2026-06-18', to: '2026-09-16' }, TODAY)).toBe('week')
  })

  it('stays weekly up to two years', () => {
    expect(automaticGranularity({ from: '2024-09-18', to: '2026-09-16' }, TODAY)).toBe('week')
  })

  it('stays weekly over two years that happen to include a leap day', () => {
    // 731 days rather than 730, which is still the two years a reader meant
    expect(automaticGranularity({ from: '2024-02-28', to: '2026-02-27' }, TODAY)).toBe('week')
  })

  it('moves to months beyond two years', () => {
    expect(automaticGranularity({ from: '2020-01-01', to: '2026-09-16' }, TODAY)).toBe('month')
  })

  it('counts an open-ended range up to today', () => {
    // "since a week ago" is a week's worth of days, not an unbounded span
    expect(automaticGranularity({ from: '2026-09-10' }, TODAY)).toBe('day')
  })

  it('buckets all time by month, because its span is only known to the server', () => {
    // a daily all-time trend on a long-running deployment is thousands of bars
    expect(automaticGranularity({}, TODAY)).toBe('month')
  })

  it('buckets by month when only an end is named, for the same reason', () => {
    expect(automaticGranularity({ to: '2026-09-16' }, TODAY)).toBe('month')
  })

  it('buckets by month rather than guessing when a bound cannot be read', () => {
    expect(automaticGranularity({ from: 'yesterday', to: '2026-09-16' }, TODAY)).toBe('month')
  })
})

describe('workflowSelectionFromToken', () => {
  it('reads an identifier as the number it is', () => {
    expect(workflowSelectionFromToken('3')).toBe(3)
    expect(workflowSelectionFromToken('42')).toBe(42)
  })

  it('reads the Unknown workflow token', () => {
    expect(workflowSelectionFromToken('unknown')).toBe('unknown')
  })

  it('is nothing selected when the URL says nothing', () => {
    expect(workflowSelectionFromToken(undefined)).toBeUndefined()
    expect(workflowSelectionFromToken('')).toBeUndefined()
  })

  it.each([
    ['abc'],
    ['Unknown'],
    ['-1'],
    ['0'],
    ['1.5'],
    ['0x10'],
    ['1e3'],
    [' 3'],
  ])('reads %s as nothing selected rather than as an error', (token) => {
    // the server refuses these with a 400, but a reader who lands on a
    // mangled link should see the page rather than an error, exactly as an
    // unreadable preset or bucket width already gives them the default
    expect(workflowSelectionFromToken(token)).toBeUndefined()
  })

  it('is nothing selected when the parameter is repeated', () => {
    expect(workflowSelectionFromToken(['3', '4'])).toBeUndefined()
  })
})
