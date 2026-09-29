/**
 * The whole of #101 read from the one component the ticket names: that a
 * parameter inside a section or a repeat reaches the screen, and that editing
 * it writes back to the right place in the step's model.
 *
 * The component tests beside this one mount `SectionToolParameter` and
 * `RepeatToolParameter` directly, so they say what each container does once
 * it is chosen. What chooses it is `useGalaxyToolInputComponent`'s map, and
 * an unmapped type is exactly what the defect was: `section` and `repeat`
 * resolved to `undefined`, which `<component :is>` renders as nothing at all.
 * So this drives the map as well as the containers, through the real props
 * `InvokeForm` builds.
 *
 * Recorded payloads throughout, for the reason `BooleanToolParameter.test.ts`
 * gives: what `Step.vue` hands a widget is not typechecked, so a hand-written
 * fixture can only carry shapes somebody already thought of.
 */

import type { WorkflowToolParameters } from 'blendtype'
import type { DescribedStep } from 'nuxt-galaxy'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { toValue } from 'vue'
import BooleanToolParameter from '../../app/components/galaxy/BooleanToolParameter.vue'
import IntegerToolParameter from '../../app/components/galaxy/IntegerToolParameter.vue'
import Step from '../../app/components/galaxy/workflow/Step.vue'
import { useGalaxyToolInputComponent } from '../../app/composables/galaxy/useGalaxyToolInputComponent'
import { FIXTURES, loadFixture, toolOfStep } from '../characterisation/fixtures'

const nested = loadFixture(FIXTURES.conditionalRepeatRuntime)

/**
 * One step's panel, built the way `InvokeForm` builds it: the offered
 * parameters through the production filter, the component map through the
 * production composable, and a **copy** of the recorded state as the model —
 * a copy because the panel writes into it, and the fixture is shared with
 * every other test in the file.
 */
async function mountStep(step: string, variant: 'form' | 'display' = 'form') {
  const definition = nested.live.steps[step]!
  const toolParameters = offeredToolInputs(toolOfStep(nested, step).inputs)
  const { inputComponentsObject } = useGalaxyToolInputComponent(toolParameters)
  const workflowParametersModel = structuredClone(definition.tool_inputs) as WorkflowToolParameters

  const wrapper = await mountSuspended(Step, {
    props: {
      workflowStep: definition as unknown as DescribedStep,
      toolParameters,
      parametersInputsComponent: toValue(inputComponentsObject),
      workflowParametersModel,
      variant,
    },
  })
  return { wrapper, workflowParametersModel }
}

describe('a step whose tool declares a section', () => {
  it('renders the parameters inside it, which is what #101 was about', async () => {
    const { wrapper } = await mountStep('1')

    expect(wrapper.find('[data-testid="section-settings"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="section-attc_settings"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="section-protein_settings"]').exists()).toBe(true)
    // Eight of the nine nested parameters. The ninth, `covar_matrix`, is a
    // dataset input: fed by an edge and never by this panel (#97), so the
    // filter drops it and the step's unconnected mark names it instead.
    expect(wrapper.findAllComponents(IntegerToolParameter)).toHaveLength(4)
    expect(wrapper.findAllComponents(BooleanToolParameter)).toHaveLength(9)
  })

  it('writes a nested edit back into the step model, two levels down', async () => {
    // The acceptance criterion in one assertion. `Step.vue` v-models into
    // `workflowParametersModel[name]`, so what has to arrive there is the
    // whole `settings` bag with one leaf changed — which is what the chain of
    // `update:modelValue` up through the two sections produces.
    const { wrapper, workflowParametersModel } = await mountStep('1')
    const target = wrapper.findAllComponents(BooleanToolParameter)
      .find(input => input.props('name') === 'keep_palindromes')

    await target!.get('[role="switch"]').trigger('click')

    const settings = workflowParametersModel.settings as Record<string, Record<string, unknown>>
    expect(settings.attc_settings!.keep_palindromes).toBe('true')
    expect(settings.attc_settings!.dist_thresh).toBe('4000')
    expect(settings.protein_settings!.func_annot).toBe(false)
  })

  it('still renders the top-level parameters beside the section', async () => {
    const { wrapper } = await mountStep('1')
    const names = wrapper.findAllComponents(BooleanToolParameter).map(input => input.props('name'))
    expect(names).toContain('gbk')
    expect(names).toContain('no_logfile')
  })
})

describe('a step whose tool declares a repeat', () => {
  it('renders one block per saved instance', async () => {
    const { wrapper } = await mountStep('2')
    expect(wrapper.find('[data-testid="repeat-datasets"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid^="repeat-datasets-"]')).toHaveLength(5)
  })

  it('offers nothing for a repeat whose only input is a dataset one', async () => {
    // `__MERGE_COLLECTION__`'s `inputs` repeat declares one child and it is a
    // `data_collection`, so the filter empties it and drops it whole rather
    // than rendering a titled box with no form in it. Its `advanced` section
    // is what is left.
    const { wrapper } = await mountStep('3')
    expect(wrapper.find('[data-testid="repeat-inputs"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="section-advanced"]').exists()).toBe(true)
  })

  it('renders the read-only variant of both containers', async () => {
    const { wrapper } = await mountStep('1', 'display')
    expect(wrapper.find('[data-testid="section-settings"]').exists()).toBe(true)
    const { wrapper: repeated } = await mountStep('2', 'display')
    expect(repeated.findAll('[data-testid^="repeat-datasets-"]')).toHaveLength(5)
  })
})
