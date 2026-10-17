import { describe, expect, it } from 'vitest'
import { parseDois } from '../app/utils/content/search'

describe('parseDois', () => {
  it('splits a comma-separated ref block into trimmed DOIs', () => {
    expect(parseDois(['10/100,10/101'])).toEqual(['10/100', '10/101'])
  })

  it('keeps DOIs across multiple blocks, without duplicates', () => {
    expect(parseDois(['10/100', '10/101, 10/100'])).toEqual(['10/100', '10/101'])
  })

  it('drops empty fragments', () => {
    expect(parseDois(['10/100,, ,10/101', ''])).toEqual(['10/100', '10/101'])
  })

  it('returns an empty list for no blocks', () => {
    expect(parseDois([])).toEqual([])
  })
})
