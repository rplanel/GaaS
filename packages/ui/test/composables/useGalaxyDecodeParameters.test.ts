/**
 * The way back: the flat dict a stored analysis holds, read into the model
 * the invoke form and the history panel render (#95).
 *
 * This is the other half of the same guard. The encoder dropped falsy values
 * on the way out; the decoder dropped them on the way back, at both depths.
 * Fixing only the encoder would have written `adv|threshold: 0` to the row
 * and then lost it again the moment somebody copied the analysis — and
 * `adv|__current_case__: 0` with it, which is the key `Conditional.vue`
 * indexes `props.cases` with. A conditional on branch 0 rendered no inputs
 * at all.
 *
 * Same rule as the encoder: only `undefined` is an absence.
 */

import type { EncodedGalaxyWorkflowParameter } from '../../app/composables/galaxy/types'
import { describe, expect, it } from 'vitest'
import { toValue } from 'vue'
import { useGalaxyDecodeParameters } from '../../app/composables/galaxy/useGalaxyDecodeParameters'
import { useGalaxyEncodeParameters } from '../../app/composables/galaxy/useGalaxyEncodeParameters'

/** See the note in the encoder suite: the stored dict holds what its type does not. */
function decode(stored: Record<string, Record<string, unknown>>) {
  const { decodedParameters } = useGalaxyDecodeParameters(stored as EncodedGalaxyWorkflowParameter)
  return toValue(decodedParameters)
}

describe('a falsy value read back out of a stored analysis', () => {
  it('restores an integer set to 0 inside a conditional', () => {
    expect(decode({ 1: { 'adv|threshold': 0 } })['1'])
      .toEqual({ adv: { threshold: 0 } })
  })

  it('restores an empty-string select option inside a conditional', () => {
    expect(decode({ 1: { 'adv|mode': '' } })['1'])
      .toEqual({ adv: { mode: '' } })
  })

  it('restores a null inside a conditional', () => {
    expect(decode({ 1: { 'adv|opt': null } })['1'])
      .toEqual({ adv: { opt: null } })
  })

  it('restores a falsy value at the top level of a step', () => {
    // Dropped today by the *first* guard: a single-segment name whose value
    // is falsy failed the `length === 1 &&` test and fell into the nesting
    // branch, which then refused it again.
    expect(decode({ 1: { zero: 0, empty: '', name: 'kept' } })['1'])
      .toEqual({ zero: 0, empty: '', name: 'kept' })
  })

  it('omits a value that is genuinely absent', () => {
    expect(decode({ 1: { 'adv|gone': undefined, 'adv|kept': 0, 'top': undefined } })['1'])
      .toEqual({ adv: { kept: 0 } })
  })

  it('restores branch 0, so the conditional has a case to render', () => {
    expect(decode({ 1: { 'adv|__current_case__': 0, 'adv|foo': 'bar' } })['1'])
      .toEqual({ adv: { __current_case__: 0, foo: 'bar' } })
  })
})

describe('encode then decode, which is what copying an analysis does', () => {
  it('returns the model it was given, falsy values and all', () => {
    // The round trip the fix exists for: this is the invoke form's model,
    // stored on the row by `runAnalysis` and read back by the copy path and
    // by the history panel.
    const model = {
      1: {
        adv: {
          __current_case__: 0,
          threshold: 0,
          cutoff: 0.0,
          mode: '',
          keep: 'false',
          name: 'kept',
        },
        topLevelZero: 0,
        topLevelEmpty: '',
      },
      2: { adv: { __current_case__: 1, foo: 'bar' } },
    }
    const { encodedParameters } = useGalaxyEncodeParameters(model as never)
    expect(decode(toValue(encodedParameters) as never)).toEqual(model)
  })

  it('drops an absent value on the way out and does not invent it on the way back', () => {
    const model = { 1: { adv: { kept: 0, gone: undefined }, top: undefined } }
    const { encodedParameters } = useGalaxyEncodeParameters(model as never)
    expect(decode(toValue(encodedParameters) as never)).toEqual({ 1: { adv: { kept: 0 } } })
  })
})

describe('the shapes the guard must not touch', () => {
  it('keeps sibling entries of one conditional together rather than overwriting', () => {
    expect(decode({ 1: { 'adv|a': 0, 'adv|b': '', 'adv|c': 'x' } })['1'])
      .toEqual({ adv: { a: 0, b: '', c: 'x' } })
  })

  it('keeps a multi-select array whole', () => {
    expect(decode({ 1: { picks: ['a', 'b'], empty: [] } })['1'])
      .toEqual({ picks: ['a', 'b'], empty: [] })
  })

  it('gives a step that stored no parameters an empty entry', () => {
    expect(decode({ 1: {}, 2: { a: 'b' } })).toEqual({ 1: {}, 2: { a: 'b' } })
  })
})
