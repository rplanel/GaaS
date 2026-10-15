import type { WorkflowRun } from './await-publish.mts'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runFor } from './await-publish.mts'

function run(databaseId: number, headSha: string, event = 'push'): WorkflowRun {
  return { databaseId, headSha, event, url: `https://github.com/rplanel/GaaS/actions/runs/${databaseId}` }
}

describe('runFor', () => {
  it('picks the run started by a push of the tagged commit', () => {
    const runs = [run(3, 'bbb'), run(2, 'aaa'), run(1, 'ccc')]
    assert.equal(runFor(runs, 'aaa')?.databaseId, 2)
  })

  it('picks the newest when the tag was pushed more than once', () => {
    const runs = [run(5, 'aaa'), run(4, 'aaa')]
    assert.equal(runFor(runs, 'aaa')?.databaseId, 5)
  })

  it('ignores a run of the same commit started another way', () => {
    assert.equal(runFor([run(6, 'aaa', 'workflow_dispatch')], 'aaa'), undefined)
  })

  it('finds nothing before the run has started', () => {
    assert.equal(runFor([run(1, 'zzz')], 'aaa'), undefined)
  })
})
