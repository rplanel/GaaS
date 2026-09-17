import { describe, expect, it } from 'vitest'
import { takeUniqueOrThrow } from '../../../../src/runtime/server/utils/grizzle/helper'

describe('takeUniqueOrThrow', () => {
  it('should return null for an empty array', () => {
    const result = takeUniqueOrThrow([])
    expect(result).toBeNull()
  })

  it('should return the single element for a one-element array', () => {
    const result = takeUniqueOrThrow([{ id: 1, name: 'test' }])
    expect(result).toEqual({ id: 1, name: 'test' })
  })

  it('should throw for a multi-element array', () => {
    expect(() => takeUniqueOrThrow([{ id: 1 }, { id: 2 }])).toThrow('Found non unique')
  })

  it('should work with primitive arrays', () => {
    expect(takeUniqueOrThrow(['hello'])).toBe('hello')
    expect(takeUniqueOrThrow([42])).toBe(42)
    expect(takeUniqueOrThrow([true])).toBe(true)
  })

  it('should preserve the exact type of the element', () => {
    const complexObject = { nested: { value: [1, 2, 3] }, flag: true }
    const result = takeUniqueOrThrow([complexObject])
    expect(result).toBe(complexObject) // same reference
  })
})
