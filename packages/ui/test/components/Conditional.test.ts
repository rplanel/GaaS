/**
 * That a conditional shows the parameters of the case its saved value is on,
 * and the label of the option that chose it (#166).
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

import type { WorkflowConditionalParametersValue } from 'blendtype'
import { isParameterGroupValue } from '#imports'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { declaredParameter, FIXTURES, loadFixture, savedValue } from '../../../nuxt-galaxy/test/characterisation/fixtures'
import Conditional from '../../app/components/galaxy/Conditional.vue'
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
async function mountOpen(modelValue: WorkflowConditionalParametersValue) {
  const wrapper = await mountSuspended(Conditional, {
    props: { ...conflict, modelValue: modelValue as { __current_case__: number } & Record<string, string> },
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
})
