import { describe, expect, it } from 'vitest'
import { countDecimals } from '../app/utils/index'

describe('countDecimals', () => {
  it('should return correct number of decimals for finite numbers', async () => {
    // Test with finite numbers
    expect(countDecimals(1.234)).toBe(3)
    expect(countDecimals(100)).toBe(0)
    expect(countDecimals(1.00)).toBe(0)
    expect(countDecimals(123.45678)).toBe(5)
  })

  it('should handle scientific notation correctly', async () => {
    expect(countDecimals(1.23e4)).toBe(0) // 12300
    expect(countDecimals(1.23e-2)).toBe(4) // 0.0123
    expect(countDecimals(1.2e3)).toBe(0) // 1200
    expect(countDecimals(5.67e-5)).toBe(7) // 0.0000567
    expect(countDecimals(5.67e50)).toBe(48)
    expect(countDecimals(5.67e-50)).toBe(52)
  })

  it('should handle edge cases', async () => {
    expect(countDecimals(0)).toBe(0)
    expect(countDecimals(-0.123)).toBe(3)
    expect(countDecimals(Number.NaN)).toBe(0)
    expect(countDecimals(Infinity)).toBe(0)
    expect(countDecimals(-Infinity)).toBe(0)
  })
})
