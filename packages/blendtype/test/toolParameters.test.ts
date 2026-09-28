import type { GalaxyBooleanToolParameter } from '../src/types/tool'
import { describe, expect, it } from 'vitest'
import { booleanToolParameterValue } from '../src/tools'

/**
 * That a boolean parameter reads the same on both releases GaaS meets (#110).
 *
 * `BooleanToolParameter.to_json` changed between them — `json.dumps(to_python(…))`
 * at 22.05, `to_python(…)` at 26.1 — so the same tool answers `"false"` on one
 * and `false` on the other. Galaxy@Pasteur is about to cross that line, which
 * is why this is a published reader and not a narrowing each caller writes:
 * the two spellings must reach a widget as one value, or the upgrade lands as
 * a behaviour change nobody edited.
 *
 * The expectations here are Galaxy's own `to_python`, which dispatches on
 * `optional` between `string_as_bool` and `string_as_bool_or_none` — including
 * where those two disagree.
 */

function aBoolean(value: GalaxyBooleanToolParameter['value'], optional = false) {
  return { value, optional }
}

describe('a required boolean parameter', () => {
  it('reads 26.1\'s real booleans straight through', () => {
    // `integron_finder` carries nine of these, all `false`.
    expect(booleanToolParameterValue(aBoolean(true))).toBe(true)
    expect(booleanToolParameterValue(aBoolean(false))).toBe(false)
  })

  it('reads 22.05\'s JSON strings as the booleans they encode', () => {
    // `ccqtl_genome_scan`'s `adjust` is the recorded one, `"false"`. Read as a
    // string this is truthy, which is the bug the reader exists to stop.
    expect(booleanToolParameterValue(aBoolean('true'))).toBe(true)
    expect(booleanToolParameterValue(aBoolean('false'))).toBe(false)
  })

  it('accepts every spelling `string_as_bool` accepts, case-insensitively', () => {
    for (const spelling of ['true', 'True', 'TRUE', 'yes', 'Yes', 'on', 'ON', '1']) {
      expect(booleanToolParameterValue(aBoolean(spelling)), spelling).toBe(true)
    }
  })

  it('reads anything else as false, as `string_as_bool` does', () => {
    for (const spelling of ['false', 'no', 'off', '0', '', 'null', 'none', 'maybe']) {
      expect(booleanToolParameterValue(aBoolean(spelling)), spelling).toBe(false)
    }
  })

  it('never answers null, because `checked` defaults to false when not optional', () => {
    // `input_source.get_bool("checked", None if nullable else False)` — the
    // `None` arm is unreachable for a required parameter, so `null` arriving
    // on one is a shape this project has not measured, and `string_as_bool`
    // reads it as false rather than inventing a third answer.
    expect(booleanToolParameterValue(aBoolean(null))).toBe(false)
  })
})

describe('an optional boolean parameter', () => {
  it('reads both spellings of "nothing was chosen" as null', () => {
    // 26.1 serves `null`; 22.05 serves the *string* `"null"`, its `to_json`
    // being `json.dumps(None)`. Galaxy's own `string_as_bool_or_none` accepts
    // `"none"` and `"null"` alike, so this follows it.
    expect(booleanToolParameterValue(aBoolean(null, true))).toBe(null)
    expect(booleanToolParameterValue(aBoolean('null', true))).toBe(null)
    expect(booleanToolParameterValue(aBoolean('none', true))).toBe(null)
    expect(booleanToolParameterValue(aBoolean('None', true))).toBe(null)
  })

  it('still reads a real value as itself', () => {
    expect(booleanToolParameterValue(aBoolean(true, true))).toBe(true)
    expect(booleanToolParameterValue(aBoolean('true', true))).toBe(true)
    expect(booleanToolParameterValue(aBoolean(false, true))).toBe(false)
    expect(booleanToolParameterValue(aBoolean('false', true))).toBe(false)
  })

  it('disagrees with a required parameter about "1", because Galaxy does', () => {
    // `string_as_bool` lists `1`; `string_as_bool_or_none` does not. Asserted
    // as a *pair* so that "reads 1 as true" cannot be made to pass everywhere
    // by a reader that ignores `optional` — which is the only way to tell this
    // apart from a transcription slip.
    expect(booleanToolParameterValue(aBoolean('1', false))).toBe(true)
    expect(booleanToolParameterValue(aBoolean('1', true))).toBe(false)
  })
})
