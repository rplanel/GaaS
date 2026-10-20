/**
 * What survives the trip from the invoke form's model to the flat dict Galaxy
 * is sent (#95).
 *
 * The bug this pins: the encoder flattened a conditional to `name|subname`
 * but guarded each entry on *truthiness*, so an input inside a conditional
 * whose value was `0` or `''` was silently omitted and Galaxy ran the step
 * with the tool's own default instead. The same value one level up, at the
 * top of a step, was kept — so the two paths disagreed about what an empty
 * value meant.
 *
 * The rule the suite holds the encoder to is the narrow one: **only
 * `undefined` is omitted**, at every depth. Everything else Galaxy stored is
 * something somebody chose, including `0`, `''` and `null`.
 */

import type { WorkflowParametersModel } from '../../../../src/runtime/app/composables/galaxy/types'
import { describe, expect, it } from 'vitest'
import { toValue } from 'vue'
import { useGalaxyEncodeParameters } from '../../../../src/runtime/app/composables/galaxy/useGalaxyEncodeParameters'

/**
 * The model as it really arrives, not as its type declares it.
 *
 * `WorkflowParameterValue` is `string | string[] | conditional`, but Galaxy's
 * saved `tool_inputs` carries integers, floats, booleans and nulls — which is
 * precisely why the falsy guard was reachable. The cast lives here, once, so
 * each test can hold the values the bug was about without repeating it.
 */
function encode(model: Record<string, Record<string, unknown>>) {
  const { encodedParameters } = useGalaxyEncodeParameters(model as WorkflowParametersModel)
  return toValue(encodedParameters)
}

describe('a falsy value inside a conditional', () => {
  it('submits an integer deliberately set to 0', () => {
    expect(encode({ 1: { adv: { threshold: 0 } } })['1'])
      .toEqual({ 'adv|threshold': 0 })
  })

  it('submits a float set to 0', () => {
    expect(encode({ 1: { adv: { cutoff: 0.0 } } })['1'])
      .toEqual({ 'adv|cutoff': 0 })
  })

  it('submits a select whose chosen option value is the empty string', () => {
    expect(encode({ 1: { adv: { mode: '' } } })['1'])
      .toEqual({ 'adv|mode': '' })
  })

  it('submits a null, which is a value Galaxy stored and not an absence', () => {
    // This one broke for a second reason: `typeof null === 'object'`, so it
    // took the flattening branch and `for (const key in null)` emitted
    // nothing at all — the key vanished from the top level too.
    expect(encode({ 1: { adv: { opt: null }, topLevelNull: null } })['1'])
      .toEqual({ 'adv|opt': null, 'topLevelNull': null })
  })

  it('omits a value that is genuinely absent', () => {
    expect(encode({ 1: { adv: { threshold: 0, missing: undefined } } })['1'])
      .toEqual({ 'adv|threshold': 0 })
  })

  it('keeps a boolean the component emits as a string, as it always did', () => {
    // Booleans were never at risk — the widget writes the *strings* `'true'`
    // and `'false'`, both truthy. Pinned so that a widget that starts writing
    // real booleans is a failure here rather than a silent drop of `false`.
    expect(encode({ 1: { adv: { keep: 'false', gbk: false } } })['1'])
      .toEqual({ 'adv|keep': 'false', 'adv|gbk': false })
  })
})

describe('nested and top level', () => {
  /** The same value, written once at the top of a step and once one level down. */
  const VALUES: [name: string, value: unknown][] = [
    ['zero', 0],
    ['emptyString', ''],
    ['null', null],
    ['falseBoolean', false],
    ['nan', Number.NaN],
    ['undefined', undefined],
  ]

  it.each(VALUES)('agree on what is omitted for %s', (name, value) => {
    const encoded = encode({ 1: { [name]: value, adv: { [name]: value } } })['1']!
    expect(Object.hasOwn(encoded, name))
      .toBe(Object.hasOwn(encoded, `adv|${name}`))
  })

  it('omits undefined at both depths, and only undefined', () => {
    const encoded = encode({
      1: {
        top: undefined,
        adv: { nested: undefined, kept: 0 },
      },
    })['1']
    expect(encoded).toEqual({ 'adv|kept': 0 })
  })
})

describe('__current_case__, the key the model round-trips on', () => {
  it('submits the branch index even when it is 0', () => {
    // Inert in Galaxy — it recomputes the key in `visit_input_values` before
    // anything reads it — but not inert here: `Conditional.vue` indexes
    // `props.cases` with it, and the decoder hands it back when an analysis
    // is copied or shown in the history panel. Dropped at case 0, as the old
    // guard dropped it, the branch rendered no inputs at all.
    expect(encode({ 1: { adv: { __current_case__: 0, foo: 'bar' } } })['1'])
      .toEqual({ 'adv|__current_case__': 0, 'adv|foo': 'bar' })
  })

  it('submits it at a non-zero index too, as it always did', () => {
    expect(encode({ 1: { adv: { __current_case__: 1, foo: 'bar' } } })['1'])
      .toEqual({ 'adv|__current_case__': 1, 'adv|foo': 'bar' })
  })
})

describe('the model measured in #95', () => {
  it('submits every value it holds, not just the truthy ones', () => {
    // The ticket's own reproduction, kept whole. Before the fix it lost
    // `adv|threshold`, `adv|cutoff`, `adv|mode` and `2`'s `adv|__current_case__`
    // while keeping the identical `topLevelZero` and `topLevelEmpty`.
    expect(encode({
      1: {
        adv: {
          __current_case__: 1,
          threshold: 0,
          cutoff: 0.0,
          mode: '',
          keep: 'false',
          name: 'kept',
        },
        topLevelZero: 0,
        topLevelEmpty: '',
      },
      2: { adv: { __current_case__: 0, foo: 'bar' } },
    })).toEqual({
      1: {
        'adv|__current_case__': 1,
        'adv|threshold': 0,
        'adv|cutoff': 0,
        'adv|mode': '',
        'adv|keep': 'false',
        'adv|name': 'kept',
        'topLevelZero': 0,
        'topLevelEmpty': '',
      },
      2: { 'adv|__current_case__': 0, 'adv|foo': 'bar' },
    })
  })
})

describe('a section, which nests as deeply as the tool declares (#101)', () => {
  it('flattens every level, not only the first', () => {
    // What this used to emit: `settings|attc_settings` carrying the whole
    // nested object. Galaxy finished the job itself — `_flatten_step_params`
    // recurses — so the leaves arrived correctly and the partial flattening
    // was redundant rather than wrong (#98). It is the *decoder* that could
    // not read a name it had never written, and a section that renders is
    // the first thing to write one.
    expect(encode({ 1: { settings: { attc_settings: { dist_thresh: '4000' } } } })['1'])
      .toEqual({ 'settings|attc_settings|dist_thresh': '4000' })
  })

  it('keeps a falsy leaf at the third level, as it does at the first two', () => {
    expect(encode({ 1: { settings: { protein_settings: { func_annot: false, gone: undefined } } } })['1'])
      .toEqual({ 'settings|protein_settings|func_annot': false })
  })
})

describe('a conditional inside a section, which is #98\'s own case', () => {
  it('names the leaf the way Galaxy resolves it', () => {
    // Step 3 of `conditional-repeat-runtime`: `__MERGE_COLLECTION__` keeps
    // its `conflict` conditional inside an `advanced` section, which is the
    // shape #98 quoted and could reach only in the decode direction while
    // the encoder joined one level.
    expect(encode({ 3: { advanced: { conflict: { __current_case__: 3, duplicate_options: 'keep_first' } } } })['3'])
      .toEqual({
        'advanced|conflict|__current_case__': 3,
        'advanced|conflict|duplicate_options': 'keep_first',
      })
  })
})

describe('the bags Galaxy\'s own flattener refuses to walk into', () => {
  it('leaves a dataset reference whole', () => {
    // `not ("src" in value and "id" in value)` in `_flatten_step_params`.
    // Split into `picked|src` and `picked|id` the reference would match no
    // declared input and the step would run with nothing.
    expect(encode({ 1: { picked: { src: 'hda', id: 'abc123' } } })['1'])
      .toEqual({ picked: { src: 'hda', id: 'abc123' } })
  })

  it('walks into a bag carrying only one of the two, as Galaxy does', () => {
    // The condition is `and`, so a bag with `src` alone is an ordinary one.
    expect(encode({ 1: { partial: { src: 'hda' } } })['1'])
      .toEqual({ 'partial|src': 'hda' })
  })

  it('leaves __POST_JOB_ACTIONS__ whole, by its bare name at any depth', () => {
    expect(encode({ 1: { __POST_JOB_ACTIONS__: { RenameDatasetActionout: { action_arguments: { newname: 'x' } } } } })['1'])
      .toEqual({ __POST_JOB_ACTIONS__: { RenameDatasetActionout: { action_arguments: { newname: 'x' } } } })
  })

  it('still walks a runtime marker, which Galaxy also walks', () => {
    // `{__class__: …}` has neither `src` nor `id`, so the flattener goes into
    // it and yields `…|__class__` — a key no input claims, ignored. Alarming
    // in a payload dump and identical to sending the marker nested, which is
    // why it is not carved out (#98).
    expect(encode({ 1: { topology_file: { __class__: 'RuntimeValue' } } })['1'])
      .toEqual({ 'topology_file|__class__': 'RuntimeValue' })
  })
})

describe('a repeat, whose instances Galaxy will not read as a list (#101, #98)', () => {
  /** `__BUILD_LIST__` step 2 of `conditional-repeat-runtime`, cut to two blocks. */
  const TWO_BLOCKS = {
    datasets: [
      { __index__: 0, id_cond: { __current_case__: 1, id_select: 'identifier' }, input: { __class__: 'ConnectedValue' } },
      { __index__: 1, id_cond: { __current_case__: 0, id_select: 'idx' }, input: { __class__: 'ConnectedValue' } },
    ],
  }

  it('names each instance so that Galaxy looks it up, instead of sending a list it ignores', () => {
    // A list is not a dict, so `_flatten_step_params` assigns it whole under
    // `datasets`, which matches no declared input and is silently dropped —
    // Galaxy's own TODO on that function names the gap. The names below are
    // what `visit_input_values` builds instead.
    expect(encode({ 1: TWO_BLOCKS })['1']).toEqual({
      'datasets_0|__index__': 0,
      'datasets_0|id_cond|__current_case__': 1,
      'datasets_0|id_cond|id_select': 'identifier',
      'datasets_0|input|__class__': 'ConnectedValue',
      'datasets_1|__index__': 1,
      'datasets_1|id_cond|__current_case__': 0,
      'datasets_1|id_cond|id_select': 'idx',
      'datasets_1|input|__class__': 'ConnectedValue',
    })
  })

  it('numbers an instance by its position, not by the __index__ it carries', () => {
    // The correction #101 made to its own ticket, read off the source. The
    // AC asked for the saved `__index__` "and not the position"; Galaxy does
    // the opposite, and does it in one statement:
    //
    //     for i, d in enumerate(values):
    //         d["__index__"] = i
    //         new_name_prefix = name_prefix + f"{input.name}_{i}|"
    //
    // — `tools/parameters/__init__.py:174-176` at 22.05, `:238-240` at 26.1.
    // The stored index is overwritten with the position before the name is
    // built, so a gapped state addressed by `__index__` would send
    // `gapped_2|…` for a block Galaxy has already renumbered to 1, and the
    // edit would land on nothing. The value is still whatever the model
    // holds; only the name is Galaxy's.
    expect(encode({ 1: { gapped: [{ __index__: 0, x: 'a' }, { __index__: 2, x: 'b' }] } })['1'])
      .toEqual({
        'gapped_0|__index__': 0,
        'gapped_0|x': 'a',
        'gapped_1|__index__': 2,
        'gapped_1|x': 'b',
      })
  })

  it('submits __index__ itself, which is inert in Galaxy and load-bearing here', () => {
    // The same bargain `__current_case__` already has. `__index__` matches no
    // declared input of the repeat, so `compute_runtime_state` never looks it
    // up and `visit_input_values` overwrites it regardless. What it does do
    // is tell the decoder that `datasets_0` is one block of a repeat rather
    // than a conditional that happens to be named `datasets_0` — without it
    // the way back would be a guess about a name ending in an underscore and
    // a digit.
    const encoded = encode({ 1: TWO_BLOCKS })['1']!
    expect(Object.keys(encoded).filter(name => name.endsWith('|__index__')))
      .toEqual(['datasets_0|__index__', 'datasets_1|__index__'])
  })

  it('leaves a list alone unless every entry is an instance', () => {
    // `__APPLY_RULES__` saves `rules` and `mapping` as lists of plain objects
    // with no `__index__` between them, on step 11 of the inner subworkflow
    // of `subworkflow-nested`. Those are one parameter's value, not a
    // repeat's arity, and flattening them by position would invent names no
    // tool declares.
    expect(encode({ 1: { rules: [{ type: 'add_column_metadata' }], picks: ['a', 'b'] } })['1'])
      .toEqual({ rules: [{ type: 'add_column_metadata' }], picks: ['a', 'b'] })
  })

  it('omits an instance value that is genuinely absent, at repeat depth too', () => {
    expect(encode({ 1: { datasets: [{ __index__: 0, kept: 0, gone: undefined }] } })['1'])
      .toEqual({ 'datasets_0|__index__': 0, 'datasets_0|kept': 0 })
  })
})

describe('the shapes the guard must not touch', () => {
  it('keeps a multi-select array whole rather than flattening it by index', () => {
    expect(encode({ 1: { picks: ['a', 'b'], empty: [] } })['1'])
      .toEqual({ picks: ['a', 'b'], empty: [] })
  })

  it('gives a step that declares no parameters an empty entry, not a missing one', () => {
    expect(encode({ 1: {}, 2: { a: 'b' } })).toEqual({ 1: {}, 2: { a: 'b' } })
  })

  it('answers an empty model with an empty result', () => {
    expect(encode({})).toEqual({})
  })
})
