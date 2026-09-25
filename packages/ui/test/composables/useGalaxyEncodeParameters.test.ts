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

import type { WorkflowParametersModel } from '../../app/composables/galaxy/types'
import { describe, expect, it } from 'vitest'
import { toValue } from 'vue'
import { useGalaxyEncodeParameters } from '../../app/composables/galaxy/useGalaxyEncodeParameters'

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
    // Dropped today for a second reason: `typeof null === 'object'`, so it
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
    // is copied or shown in the history panel. Dropped at case 0, the branch
    // renders no inputs at all.
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
    // The ticket's own reproduction, kept whole: before the fix this lost
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
