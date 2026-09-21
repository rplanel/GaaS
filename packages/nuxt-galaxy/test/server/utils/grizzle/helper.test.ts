import { describe, expect, it } from 'vitest'
import { takeExactlyOne, takeUniqueOrNull } from '../../../../src/runtime/server/utils/grizzle/helper'

describe('takeUniqueOrNull', () => {
  it('hands back null for no rows, which is a real answer', () => {
    // a row that does not exist, or does not belong to this caller: the
    // caller decides what that means, so it is not thrown
    expect(takeUniqueOrNull([])).toBeNull()
  })

  it('hands back the row for one row', () => {
    expect(takeUniqueOrNull([{ id: 1, name: 'test' }])).toEqual({ id: 1, name: 'test' })
  })

  it('refuses several rows', () => {
    expect(() => takeUniqueOrNull([{ id: 1 }, { id: 2 }])).toThrow('Found non unique')
  })

  it('works with primitives', () => {
    expect(takeUniqueOrNull(['hello'])).toBe('hello')
    expect(takeUniqueOrNull([42])).toBe(42)
    expect(takeUniqueOrNull([true])).toBe(true)
  })

  it('preserves the exact element, not a copy of it', () => {
    const complexObject = { nested: { value: [1, 2, 3] }, flag: true }
    expect(takeUniqueOrNull([complexObject])).toBe(complexObject)
  })
})

describe('takeExactlyOne', () => {
  it('hands back the row for one row', () => {
    expect(takeExactlyOne([{ insertedId: 7 }])).toEqual({ insertedId: 7 })
  })

  it('refuses no rows, where absence means the query premise was wrong', () => {
    // for an `insert ... returning()` asking back for what it just wrote,
    // none means the database broke a promise
    expect(() => takeExactlyOne([])).toThrow(/exactly one/i)
  })

  it('refuses several rows', () => {
    expect(() => takeExactlyOne([{ id: 1 }, { id: 2 }])).toThrow('Found non unique')
  })
})

describe('a non-unique result', () => {
  it.each([
    ['takeUniqueOrNull', 'takeUniqueOrNull'],
    ['takeExactlyOne', 'takeExactlyOne'],
  ])('is refused by %s with a reason a caller can read', (_label, name) => {
    const take = name === 'takeUniqueOrNull' ? takeUniqueOrNull : takeExactlyOne

    expect(() => take([{ id: 1 }, { id: 2 }])).toThrow('Found non unique')
  })
})
