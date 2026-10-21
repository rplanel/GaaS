import type { WorkflowParameterValue } from 'blendtype'
import { describe, expect, it } from 'vitest'
import {
  booleanParameterSpelling,
  conditionalCaseInputs,
  isBooleanParameterTrue,
  parameterGroupValue,
  parameterGroupWithChild,
  repeatInstances,
  repeatWithChild,
  selectOptionLabels,
  selectOptions,
} from '../../../src/runtime/app/utils/parameterRules'
import { declaredParameter, FIXTURES, loadFixture, savedValue } from '../../characterisation/fixtures'

/**
 * #166. What each parameter's widget decides, as against how it looks: which
 * instances a repeat has and how one is written back, which parameters a
 * conditional's case holds, what a select offers, and how a boolean reads and
 * is written. `@gaas/ui`'s widgets render with these, and the second UI's
 * are to (#167).
 *
 * Driven from the recordings where one holds the case, for the reason the
 * characterisation suite gives: a hand-written value can only carry the
 * shapes its author already expected. Where a value is hand-written it is
 * because no recording holds that case, and the test says so.
 */

const nested = loadFixture(FIXTURES.conditionalRepeatRuntime)
const ccqtl = loadFixture(FIXTURES.ccqtlToday)

/** The five instances `__BUILD_LIST__` saved under `datasets`, on step 2. */
function savedDatasets(): WorkflowParameterValue[] {
  const saved = savedValue(nested, '2', 'datasets')
  if (!Array.isArray(saved)) {
    throw new TypeError('step 2 saved no datasets list')
  }
  return saved
}

describe('repeatInstances', () => {
  it('reads one instance per saved block, at its position in the list', () => {
    const instances = repeatInstances(savedDatasets())
    expect(instances.map(({ position }) => position)).toEqual([0, 1, 2, 3, 4])
    expect(instances.map(({ instance }) => instance.__index__)).toEqual([0, 1, 2, 3, 4])
    expect(instances[2]?.instance.id_cond).toEqual({ __current_case__: 1, id_select: 'identifier' })
  })

  it('skips an entry with no __index__, which still takes up its position', () => {
    // Hand-written: Galaxy back-fills a missing index, so no recording holds one.
    const [first, , third] = savedDatasets()
    const instances = repeatInstances([first!, { id_cond: 'legacy' }, third!])
    expect(instances.map(({ position }) => position)).toEqual([0, 2])
  })

  it('reads no instance out of a value that is not a list', () => {
    expect(repeatInstances('datasets')).toEqual([])
    expect(repeatInstances(null)).toEqual([])
    expect(repeatInstances({ __index__: 0 })).toEqual([])
  })
})

describe('repeatWithChild', () => {
  it('writes one parameter of the instance at a position, and leaves the others as saved', () => {
    const saved = savedDatasets()
    const chosen = { __current_case__: 2, id_select: 'manual', identifier: 'sample' }
    const written = repeatWithChild(saved, 3, 'id_cond', chosen)
    expect(written).toHaveLength(5)
    expect(written[3]).toEqual({ ...saved[3] as object, id_cond: chosen })
    expect(written.filter((_, position) => position !== 3)).toEqual(saved.filter((_, position) => position !== 3))
  })

  it('hands back a new list and leaves the saved one untouched', () => {
    const saved = savedDatasets()
    const before = structuredClone(saved)
    const written = repeatWithChild(saved, 0, 'id_cond', 'changed')
    expect(written).not.toBe(saved)
    expect(saved).toEqual(before)
  })

  it('carries an entry with no __index__ through an edit elsewhere in the list', () => {
    // Hand-written, as above: the entry is legacy state, kept rather than dropped.
    const [first, , third] = savedDatasets()
    const legacy = { id_cond: 'legacy' }
    const written = repeatWithChild([first!, legacy, third!], 2, 'id_cond', 'changed')
    expect(written[1]).toBe(legacy)
    expect(written[2]).toEqual({ ...third as object, id_cond: 'changed' })
  })

  it('writes nothing to an entry with no __index__', () => {
    const legacy = { id_cond: 'legacy' }
    expect(repeatWithChild([legacy], 0, 'id_cond', 'changed')).toEqual([legacy])
  })
})

describe('parameterGroupValue', () => {
  it('reads the bag a section saved as it stands', () => {
    const settings = savedValue(nested, '1', 'settings')
    expect(parameterGroupValue(settings)).toBe(settings)
  })

  it('reads anything else as an empty bag', () => {
    expect(parameterGroupValue('settings')).toEqual({})
    expect(parameterGroupValue(null)).toEqual({})
    expect(parameterGroupValue([{ __index__: 0 }])).toEqual({})
  })
})

describe('parameterGroupWithChild', () => {
  it('writes one parameter of a section, two levels down, and keeps its siblings', () => {
    const settings = savedValue(nested, '1', 'settings')
    const attc = parameterGroupValue(parameterGroupValue(settings).attc_settings!)
    const written = parameterGroupWithChild(settings, 'attc_settings', parameterGroupWithChild(attc, 'dist_thresh', '5000'))
    expect(written).toEqual({
      attc_settings: {
        calin_threshold: '2',
        covar_matrix: { __class__: 'RuntimeValue' },
        dist_thresh: '5000',
        keep_palindromes: false,
        max_attc_size: '200',
        min_attc_size: '40',
      },
      protein_settings: { func_annot: false, no_proteins: false, union_integrases: false },
    })
  })

  it('hands back a new bag and leaves the saved one untouched', () => {
    const settings = savedValue(nested, '1', 'settings')
    const before = structuredClone(settings)
    expect(parameterGroupWithChild(settings, 'protein_settings', {})).not.toBe(settings)
    expect(settings).toEqual(before)
  })

  it('starts from an empty bag when nothing was saved as one', () => {
    expect(parameterGroupWithChild(null, 'dist_thresh', '4000')).toEqual({ dist_thresh: '4000' })
  })
})

describe('conditionalCaseInputs', () => {
  /** `__MERGE_COLLECTION__`'s `advanced|conflict`: three cases hold `suffix_pattern`, three hold nothing. */
  const conflict = declaredParameter(nested, '3', 'conflict', 'conditional')

  it('reads the parameters of the case the revision was saved on', () => {
    // Step 3 saved `keep_first`, the fourth case, which declares nothing.
    const advanced = parameterGroupValue(savedValue(nested, '3', 'advanced'))
    expect(conditionalCaseInputs(conflict, advanced.conflict!)).toEqual([])
  })

  it('reads a case that holds a parameter', () => {
    // Hand-written: no recording saves a suffix case.
    const inputs = conditionalCaseInputs(conflict, { __current_case__: 0, duplicate_options: 'suffix_conflict' })
    expect(inputs?.map(input => input.name)).toEqual(['suffix_pattern'])
  })

  it('reads no case where the saved value names none the tool declares', () => {
    expect(conditionalCaseInputs(conflict, { __current_case__: 6 })).toBeUndefined()
    expect(conditionalCaseInputs(conflict, { duplicate_options: 'keep_first' })).toBeUndefined()
    expect(conditionalCaseInputs(conflict, null)).toBeUndefined()
  })
})

/** `ccqtl_find_peaks`'s `level`, whose labels (`95%`) differ from their values (`95`). */
const level = declaredParameter(ccqtl, '5', 'level', 'select')
/** `integron_finder`'s `type_replicon`, whose labels name the flag each value is. */
const typeReplicon = declaredParameter(nested, '1', 'type_replicon', 'select')

describe('selectOptions', () => {
  it('offers every option its tool declares, by label and value, in the declared order', () => {
    expect(selectOptions(level)).toEqual([
      { label: '80%', value: '80' },
      { label: '90%', value: '90' },
      { label: '95%', value: '95' },
      { label: '99%', value: '99' },
    ])
    expect(selectOptions(typeReplicon)).toEqual([
      { label: 'linear (--linear)', value: '--linear' },
      { label: 'circular (--circ)', value: '--circ' },
    ])
  })
})

/** Hand-written: no recording has a multiple select, so this is `level` declared multiple. */
const levels = { ...level, multiple: true as const }

describe('selectOptionLabels', () => {
  it('names the saved value by its option\'s label', () => {
    expect(savedValue(ccqtl, '5', 'level')).toBe('95')
    expect(selectOptionLabels(level, savedValue(ccqtl, '5', 'level'))).toEqual(['95%'])
  })

  it('names each value a multiple select saved by its label, in the saved order', () => {
    expect(selectOptionLabels(levels, ['99', '80'])).toEqual(['99%', '80%'])
  })

  it('leaves out a value no option holds', () => {
    // Hand-written: no recording saves a value its tool does not offer.
    expect(selectOptionLabels(level, '42')).toEqual([])
    expect(selectOptionLabels(level, '95%')).toEqual([])
    expect(selectOptionLabels(levels, ['42', '95'])).toEqual(['95%'])
  })

  it('names nothing for a select saved `null`', () => {
    // `type_replicon` is optional and saved `null` in the recording.
    expect(savedValue(nested, '1', 'type_replicon')).toBeNull()
    expect(selectOptionLabels(typeReplicon, savedValue(nested, '1', 'type_replicon'))).toEqual([])
  })
})

/** `integron_finder`'s `--gbk`, saved as a real `true` at 26.1. */
const gbk = declaredParameter(nested, '1', 'gbk', 'boolean')
/** `ccqtl_find_peaks`'s `adjust`, saved as the string `'false'` at 22.05. */
const adjust = declaredParameter(ccqtl, '5', 'adjust', 'boolean')

describe('isBooleanParameterTrue', () => {
  it('reads the value either release saved', () => {
    expect(savedValue(nested, '1', 'gbk')).toBe(true)
    expect(isBooleanParameterTrue(gbk, savedValue(nested, '1', 'gbk'))).toBe(true)
    expect(savedValue(ccqtl, '5', 'adjust')).toBe('false')
    expect(isBooleanParameterTrue(adjust, savedValue(ccqtl, '5', 'adjust'))).toBe(false)
    expect(isBooleanParameterTrue(adjust, 'true')).toBe(true)
  })

  it('reads a number the way Galaxy reads its string', () => {
    // Hand-written: no recording saves a number. Galaxy's `string_as_bool`
    // takes `1` as true and `string_as_bool_or_none` does not.
    expect(isBooleanParameterTrue({ optional: false }, 1)).toBe(true)
    expect(isBooleanParameterTrue({ optional: true }, 1)).toBe(false)
  })

  it('reads an optional boolean saved as none as false', () => {
    expect(isBooleanParameterTrue({ optional: true }, 'None')).toBe(false)
    expect(isBooleanParameterTrue({ optional: true }, null)).toBe(false)
  })

  it('reads a list or a bag as false', () => {
    expect(isBooleanParameterTrue({ optional: false }, ['true'])).toBe(false)
    expect(isBooleanParameterTrue({ optional: false }, { __class__: 'RuntimeValue' })).toBe(false)
  })
})

describe('booleanParameterSpelling', () => {
  it('is written in the 22.05 state spelling', () => {
    expect(booleanParameterSpelling(true)).toBe('true')
    expect(booleanParameterSpelling(false)).toBe('false')
  })
})
