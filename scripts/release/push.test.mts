import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pushes } from './push.mts'

describe('pushes', () => {
  const [gitlab, github] = pushes('v0.0.4-beta.5')

  it('pushes to GitLab before the mirror, which publishes what it receives', () => {
    assert.equal(gitlab?.[2], 'origin')
    assert.equal(github?.[2], 'git@github.com:rplanel/GaaS.git')
  })

  it('pushes main and the release tag together or not at all, on each', () => {
    // --follow-tags is not atomic: a refused main still lands the tag.
    for (const args of [gitlab, github]) {
      assert.deepEqual(args, ['push', '--atomic', args?.[2], 'main', 'refs/tags/v0.0.4-beta.5'])
    }
  })

  it('pushes no tag but the release one', () => {
    // GitHub starts no run for a push of more than three tags, and an older
    // v tag would start a run of its own.
    assert.ok(pushes('v1.0.0').flat().every(arg => arg !== '--follow-tags' && arg !== '--tags'))
  })
})
