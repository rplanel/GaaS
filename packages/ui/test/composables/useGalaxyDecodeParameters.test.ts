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

import type { EncodedGalaxyWorkflowParameter, WorkflowParametersModel } from '../../app/composables/galaxy/types'
import { describe, expect, it } from 'vitest'
import { toValue } from 'vue'
import { useGalaxyDecodeParameters } from '../../app/composables/galaxy/useGalaxyDecodeParameters'
import { useGalaxyEncodeParameters } from '../../app/composables/galaxy/useGalaxyEncodeParameters'

/**
 * See the note in the encoder suite: both dicts hold what their types do not,
 * so the cast lives in these two helpers and nowhere else in the file.
 */
function decode(stored: Record<string, Record<string, unknown>>) {
  const { decodedParameters } = useGalaxyDecodeParameters(stored as EncodedGalaxyWorkflowParameter)
  return toValue(decodedParameters)
}

function encode(model: Record<string, Record<string, unknown>>) {
  const { encodedParameters } = useGalaxyEncodeParameters(model as WorkflowParametersModel)
  return toValue(encodedParameters) as Record<string, Record<string, unknown>>
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
    // The *first* guard used to take this one: a single-segment name whose
    // value is falsy failed the `length === 1 &&` test and fell into the
    // nesting branch, which then refused it again.
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
    expect(decode(encode(model))).toEqual(model)
  })

  it('drops an absent value on the way out and does not invent it on the way back', () => {
    const model = { 1: { adv: { kept: 0, gone: undefined }, top: undefined } }
    expect(decode(encode(model))).toEqual({ 1: { adv: { kept: 0 } } })
  })
})

describe('a name of three segments or more (#98, #101)', () => {
  it('nests each level inside the one above, rather than beside it', () => {
    // The bug #98 recorded and could not reach: the walk down the parents
    // wrote every level at the **step root**, so a three-segment name came
    // back as two siblings and the inner one was lost from its parent. It
    // was unreachable while the encoder joined at most one level, and #101
    // made it reachable the moment a section rendered.
    expect(decode({ 3: { 'advanced|conflict|duplicate_options': 'keep_first' } })['3'])
      .toEqual({ advanced: { conflict: { duplicate_options: 'keep_first' } } })
  })

  it('keeps siblings of an inner bag together', () => {
    expect(decode({ 1: {
      'settings|attc_settings|dist_thresh': '4000',
      'settings|attc_settings|keep_palindromes': false,
      'settings|protein_settings|func_annot': false,
    } })['1']).toEqual({
      settings: {
        attc_settings: { dist_thresh: '4000', keep_palindromes: false },
        protein_settings: { func_annot: false },
      },
    })
  })
})

describe('a repeat read back out of a stored analysis (#101)', () => {
  it('rebuilds the instances as a list, in position order', () => {
    expect(decode({ 2: {
      'datasets_1|__index__': 1,
      'datasets_1|id_cond|id_select': 'idx',
      'datasets_0|__index__': 0,
      'datasets_0|id_cond|id_select': 'identifier',
    } })['2']).toEqual({
      datasets: [
        { __index__: 0, id_cond: { id_select: 'identifier' } },
        { __index__: 1, id_cond: { id_select: 'idx' } },
      ],
    })
  })

  it('orders by the position in the name, not by the __index__ the value carries', () => {
    // Which is the same thing on any state Galaxy wrote, and not the same
    // thing on one that has been edited elsewhere. The position is what the
    // encoder will name it by next time, so it is what decides the order.
    expect(decode({ 2: {
      'gapped_0|__index__': 4,
      'gapped_0|x': 'first',
      'gapped_1|__index__': 2,
      'gapped_1|x': 'second',
    } })['2']).toEqual({
      gapped: [
        { __index__: 4, x: 'first' },
        { __index__: 2, x: 'second' },
      ],
    })
  })

  it('leaves a bag that merely looks like an instance alone', () => {
    // `datasets_0` is a legal name for a conditional or a section, and
    // Galaxy tells them apart by reading the tool's declaration, which this
    // side does not have. `__index__` is the marker the encoder sends for
    // exactly this, so a bag without one stays a bag.
    expect(decode({ 2: { 'datasets_0|id_select': 'idx' } })['2'])
      .toEqual({ datasets_0: { id_select: 'idx' } })
  })

  it('leaves a repeat alone when a value already occupies its name', () => {
    expect(decode({ 2: { 'datasets': 'taken', 'datasets_0|__index__': 0 } })['2'])
      .toEqual({ datasets: 'taken', datasets_0: { __index__: 0 } })
  })

  it('rebuilds a repeat nested inside a section', () => {
    expect(decode({ 2: {
      'outer|inner_0|__index__': 0,
      'outer|inner_0|x': 'a',
      'outer|inner_1|__index__': 1,
      'outer|inner_1|x': 'b',
    } })['2']).toEqual({
      outer: { inner: [{ __index__: 0, x: 'a' }, { __index__: 1, x: 'b' }] },
    })
  })
})

describe('the recorded step shapes, round-tripped', () => {
  it('returns step 1 of conditional-repeat-runtime, sections and all', () => {
    // `integron_finder`'s saved state, verbatim but for the bookkeeping keys.
    // Two levels of section, a runtime marker inside them, and a `null` that
    // #95 had to fight for.
    const model = {
      1: {
        gbk: true,
        local_max: true,
        no_logfile: false,
        sequence: { __class__: 'ConnectedValue' },
        settings: {
          attc_settings: {
            calin_threshold: '2',
            covar_matrix: { __class__: 'RuntimeValue' },
            dist_thresh: '4000',
            keep_palindromes: false,
          },
          protein_settings: { func_annot: false, no_proteins: false },
        },
        topology_file: { __class__: 'RuntimeValue' },
        type_replicon: null,
      },
    }
    expect(decode(encode(model))).toEqual(model)
  })

  it('returns step 2 of conditional-repeat-runtime, whose repeat blocks sit on two branches', () => {
    const model = {
      2: {
        datasets: [
          { __index__: 0, id_cond: { __current_case__: 1, id_select: 'identifier' }, input: { __class__: 'ConnectedValue' } },
          { __index__: 1, id_cond: { __current_case__: 0, id_select: 'idx' }, input: { __class__: 'ConnectedValue' } },
        ],
      },
    }
    expect(decode(encode(model))).toEqual(model)
  })
})

describe('the round trip over the shapes Galaxy leaves whole', () => {
  it('returns step 3 of conditional-repeat-runtime, a conditional inside a section', () => {
    const model = {
      3: {
        advanced: { conflict: { __current_case__: 3, duplicate_options: 'keep_first' } },
        inputs: [
          { __index__: 0, input: { __class__: 'RuntimeValue' } },
          { __index__: 1, input: { __class__: 'RuntimeValue' } },
        ],
      },
    }
    expect(decode(encode(model))).toEqual(model)
  })

  it('returns a dataset reference unsplit', () => {
    const model = { 1: { picked: { src: 'hda', id: 'abc123' } } }
    expect(decode(encode(model))).toEqual(model)
  })
})

describe('the shapes the guard must not touch', () => {
  it('keeps sibling entries of one conditional together rather than overwriting', () => {
    expect(decode({ 1: { 'adv|a': 0, 'adv|b': '', 'adv|c': 'x' } })['1'])
      .toEqual({ adv: { a: 0, b: '', c: 'x' } })
  })

  /**
   * The last truthiness guard in the file, and what replaced it.
   *
   * The walk down to a conditional asked whether something *truthy* sat at
   * the name, when the question it meant was whether a bag to nest into sat
   * there. Our own encoder cannot produce both keys — a name is either a
   * conditional, emitting only `adv|*`, or a scalar, emitting only `adv` —
   * so neither case is reachable from a round trip today. They are pinned
   * because the failures are silent-or-fatal rather than wrong-looking, and
   * because this is the bug family the whole ticket is about.
   */
  describe('a name that a value already occupies', () => {
    it('nests under a truthy scalar rather than throwing', () => {
      // The old guard saw `'x'` as "something is here", kept it as the
      // parent, and assigned a property to a string primitive — a
      // TypeError in strict mode, which every ES module is.
      expect(decode({ 1: { 'adv': 'x', 'adv|foo': 'bar' } })['1']).toEqual({ adv: { foo: 'bar' } })
    })

    it('nests under an array rather than dropping the value', () => {
      // Truthy too, so the old guard kept the array as the parent and hung
      // `foo` off it, where nothing reads it: the nested value vanished with
      // no error at all.
      expect(decode({ 1: { 'adv': ['a'], 'adv|foo': 'bar' } })['1']).toEqual({ adv: { foo: 'bar' } })
    })

    it('nests under a falsy scalar, which the old guard also did', () => {
      // Pinned to mark the boundary: this is the one shape where the two
      // guards agreed, so it is not evidence the fix works.
      expect(decode({ 1: { 'adv': 0, 'adv|foo': 'bar' } })['1']).toEqual({ adv: { foo: 'bar' } })
    })
  })

  it('keeps a multi-select array whole', () => {
    expect(decode({ 1: { picks: ['a', 'b'], empty: [] } })['1'])
      .toEqual({ picks: ['a', 'b'], empty: [] })
  })

  it('gives a step that stored no parameters an empty entry', () => {
    expect(decode({ 1: {}, 2: { a: 'b' } })).toEqual({ 1: {}, 2: { a: 'b' } })
  })
})
