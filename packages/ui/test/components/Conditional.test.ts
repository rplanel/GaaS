/**
 * That a conditional shows the parameters of the case its saved value is on,
 * and the label of the option that chose it (#166), and that it writes an
 * edit inside that case back as a new value (#182).
 *
 * Written before #166 moved the rule to `nuxt-galaxy`, against the component
 * as it was, so that the move is shown to change nothing a reader sees.
 *
 * Driven from `__MERGE_COLLECTION__`'s `advanced|conflict`, the one recorded
 * conditional whose cases differ in what they hold: the three suffix cases
 * declare `suffix_pattern`, the other three declare nothing. The revision is
 * saved on `keep_first`, which holds nothing, so the case that does hold a
 * parameter is hand-written below and says so.
 */

import type { WorkflowConditionalParametersValue, WorkflowParameterValue } from 'blendtype'
import { isParameterGroupValue } from '#imports'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { declaredParameter, FIXTURES, loadFixture, savedValue } from '../../../nuxt-galaxy/test/characterisation/fixtures'
import Conditional from '../../app/components/galaxy/Conditional.vue'
import SelectToolParameter from '../../app/components/galaxy/SelectToolParameter.vue'
import TextToolParameter from '../../app/components/galaxy/TextToolParameter.vue'

const nested = loadFixture(FIXTURES.conditionalRepeatRuntime)

const conflict = declaredParameter(nested, '3', 'conflict', 'conditional')

/** What step 3 saved for the conditional: `keep_first`, case 3. */
function savedConflict(): WorkflowConditionalParametersValue {
  const advanced = savedValue(nested, '3', 'advanced')
  const conflict = isParameterGroupValue(advanced) ? advanced.conflict : undefined
  if (!isParameterGroupValue(conflict)) {
    throw new TypeError('step 3 saved no advanced|conflict')
  }
  return conflict
}

/**
 * Mounted, with its accordion opened: the case's parameters are rendered in
 * the accordion's body, which is not in the document until it is.
 */
async function mountOpen(modelValue: WorkflowParameterValue) {
  const wrapper = await mountSuspended(Conditional, {
    props: { ...conflict, modelValue },
  })
  await wrapper.get('button[aria-expanded]').trigger('click')
  return wrapper
}

describe('the recording this is about', () => {
  it('is saved on keep_first, the fourth case, which declares nothing', () => {
    expect(savedConflict()).toEqual({ __current_case__: 3, duplicate_options: 'keep_first' })
    expect(conflict.cases[3]?.value).toBe('keep_first')
    expect(conflict.cases[3]?.inputs).toEqual([])
  })

  it('declares suffix_pattern in the first case', () => {
    expect(conflict.cases[0]?.value).toBe('suffix_conflict')
    expect(conflict.cases[0]?.inputs.map(input => input.name)).toEqual(['suffix_pattern'])
  })
})

describe('what a conditional puts on screen', () => {
  it('heads the conditional with its test parameter\'s label', async () => {
    // Galaxy's own form titles a conditional with the test parameter's label
    // (`FormInputs.vue`: `input.test_param.label` at 22.05,
    // `input.test_param.label || input.test_param.name` at 26.1). Already true
    // before #182, which filed it: the accordion's item label was the literal
    // 'props.test_param.name', but the default slot replaces it with the test
    // parameter's widget, which prints the label. Kept so that stays so.
    const wrapper = await mountOpen(savedConflict())
    const header = wrapper.get('button[aria-expanded]')
    expect(header.text()).toContain('How should conflicts (or potential conflicts) be handled?')
    expect(header.text()).not.toContain('props.test_param.name')
  })

  it('heads it with the test parameter\'s name when the tool gave it no label', async () => {
    // Hand-written: both recorded test parameters have a label. Galaxy sends
    // `label: ''` for a parameter declared without one (the `to_dict`
    // doctests, `basic.py:218` at 26.1), and its form heads the conditional
    // with the name instead from 26.1 on (`FormInputs.vue:9`).
    const wrapper = await mountSuspended(Conditional, {
      props: { ...conflict, test_param: { ...conflict.test_param, label: '' }, modelValue: savedConflict() },
    })
    expect(wrapper.get('button[aria-expanded]').text()).toContain('duplicate_options')
  })

  it('names the saved case by the label of the option that chose it', async () => {
    const wrapper = await mountOpen(savedConflict())
    expect(wrapper.text()).toContain('Keep first instance')
  })

  it('shows no parameter for a saved case that declares none', async () => {
    const wrapper = await mountOpen(savedConflict())
    expect(wrapper.findAllComponents(TextToolParameter)).toHaveLength(0)
  })

  it('shows the parameters of the case the saved value is on', async () => {
    // Hand-written: no recording saves a suffix case. `_#` is the value the
    // tool declares for `suffix_pattern`.
    const wrapper = await mountOpen({ __current_case__: 0, duplicate_options: 'suffix_conflict', suffix_pattern: '_#' })
    const shown = wrapper.findAllComponents(TextToolParameter)
    expect(shown).toHaveLength(1)
    expect(shown[0]?.props('name')).toBe('suffix_pattern')
    expect(shown[0]?.props('modelValue')).toBe('_#')
  })

  it('reads a saved value that is not a bag as one with no case, and still heads it', async () => {
    // Hand-written: no recording saves one, and Galaxy does not write `null`
    // for a conditional. `Step.vue` hands every widget its value through
    // `<component :is>`, which checks no type (#111), so the conditional
    // reads what it is given as the section does rather than failing to
    // render the step.
    const wrapper = await mountOpen(null)
    expect(wrapper.get('button[aria-expanded]').text()).toContain('How should conflicts (or potential conflicts) be handled?')
    expect(wrapper.findAllComponents(TextToolParameter)).toHaveLength(0)
  })
})

describe('what a conditional writes back', () => {
  it('writes nothing back from its test parameter, so the case is never switched', async () => {
    // The test parameter's widget is read-only and does not emit today. This
    // pins that the conditional would not act on it if it did: a test
    // parameter written alone would leave `__current_case__` and the case's
    // parameters on the old case, which is the switch #94 refused.
    const handed = { __current_case__: 3, duplicate_options: 'keep_first' }
    const wrapper = await mountOpen(handed)
    const testParameter = wrapper.findAllComponents(SelectToolParameter)
    expect(testParameter).toHaveLength(1)

    testParameter[0]!.vm.$emit('update:modelValue', 'suffix_conflict')
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(handed).toEqual({ __current_case__: 3, duplicate_options: 'keep_first' })
  })

  it('emits an edit inside the shown case as a new value, and leaves the one it was handed alone', async () => {
    // Hand-written, as above: no recording saves a case that holds an
    // editable parameter. A section or a repeat above hears of the edit only
    // through the emit, and a level that copied its value would drop an edit
    // written in place (#182).
    const handed = { __current_case__: 0, duplicate_options: 'suffix_conflict', suffix_pattern: '_#' }
    const wrapper = await mountOpen(handed)

    await wrapper.getComponent(TextToolParameter).get('input').setValue('_copy#')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toHaveLength(1)
    expect(emitted![0]).toEqual([{ __current_case__: 0, duplicate_options: 'suffix_conflict', suffix_pattern: '_copy#' }])
    expect(handed).toEqual({ __current_case__: 0, duplicate_options: 'suffix_conflict', suffix_pattern: '_#' })
  })
})
