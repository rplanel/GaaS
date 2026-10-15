import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { poll } from './poll.mts'

/** Answers each call with the next of `answers`, an Error being thrown. */
function answering<T>(...answers: (T | undefined | Error)[]): { attempt: () => T | undefined, calls: () => number } {
  let calls = 0
  return {
    attempt: () => {
      const answer = answers[Math.min(calls++, answers.length - 1)]
      if (answer instanceof Error) {
        throw answer
      }
      return answer
    },
    calls: () => calls,
  }
}

describe('poll', () => {
  it('stops at the first answer', async () => {
    const asked = answering(undefined, 'run', 'later')
    assert.deepEqual(await poll(5, 0, asked.attempt), { value: 'run' })
    assert.equal(asked.calls(), 2)
  })

  it('keeps asking through a throw, which counts as no answer yet', async () => {
    // `gh run list` answers "could not find any workflows named publish.yml"
    // until GitHub has read the workflow the same push brought.
    const asked = answering(new Error('workflow not found'), 'run')
    assert.deepEqual(await poll(5, 0, asked.attempt), { value: 'run' })
  })

  it('gives up after so many attempts, with the last error it met', async () => {
    const asked = answering<string>(new Error('first'), undefined, new Error('last'))
    const result = await poll(3, 0, asked.attempt)
    assert.equal(result.value, undefined)
    assert.equal((result.lastError as Error).message, 'last')
    assert.equal(asked.calls(), 3)
  })

  it('awaits an attempt that answers asynchronously', async () => {
    assert.deepEqual(await poll(2, 0, async () => 42), { value: 42 })
  })
})
