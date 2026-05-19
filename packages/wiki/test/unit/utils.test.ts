import { describe, expect, it } from 'vitest'
import { searchContentRef } from '../../app/utils/content/search'

describe('searchContentRef', () => {
  it('returns empty array for non-array content', () => {
    expect(searchContentRef(null)).toEqual([])
    expect(searchContentRef('string')).toEqual([])
    expect(searchContentRef(123)).toEqual([])
  })

  it('returns empty array for short arrays', () => {
    expect(searchContentRef([])).toEqual([])
    expect(searchContentRef(['ref'])).toEqual([])
  })

  it('extracts DOIs from a simple ref element', () => {
    const content = ['ref', { dois: '10.1234/example' }]
    expect(searchContentRef(content)).toEqual(['10.1234/example'])
  })

  it('extracts DOIs recursively from nested content', () => {
    const content = [
      'div',
      {},
      ['ref', { dois: '10.1111/first' }],
      ['p', {}, ['ref', { dois: '10.2222/second' }]],
    ]
    expect(searchContentRef(content)).toEqual(['10.1111/first', '10.2222/second'])
  })

  it('ignores non-ref elements', () => {
    const content = [
      'div',
      {},
      ['span', {}, 'some text'],
      ['ref', { dois: '10.3333/only' }],
    ]
    expect(searchContentRef(content)).toEqual(['10.3333/only'])
  })
})
