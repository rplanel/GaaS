import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { notYetOut } from './confirm-published.mts'

describe('notYetOut', () => {
  it('is satisfied once the version exists and the dist-tag points at it', () => {
    const packument = { 'versions': { '0.0.4-beta.5': {} }, 'dist-tags': { beta: '0.0.4-beta.5', latest: '0.0.3' } }
    assert.equal(notYetOut(packument, '0.0.4-beta.5', 'beta'), undefined)
  })

  it('says so while the version is missing', () => {
    const packument = { 'versions': { '0.0.4-beta.4': {} }, 'dist-tags': { beta: '0.0.4-beta.4' } }
    assert.match(notYetOut(packument, '0.0.4-beta.5', 'beta') ?? '', /0\.0\.4-beta\.5 is not on the registry/)
  })

  it('says so while the dist-tag still points at another version', () => {
    // The stale answer npm gave for minutes on 2026-10-15 looked exactly like this.
    const packument = { 'versions': { '0.0.4-beta.4': {}, '0.0.4-beta.5': {} }, 'dist-tags': { beta: '0.0.4-beta.4' } }
    assert.match(notYetOut(packument, '0.0.4-beta.5', 'beta') ?? '', /beta points at 0\.0\.4-beta\.4/)
  })

  it('reads a packument with no dist-tags at all', () => {
    assert.match(notYetOut({}, '0.1.0', 'latest') ?? '', /not on the registry/)
  })
})
