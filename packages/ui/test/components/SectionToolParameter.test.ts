/**
 * That a parameter inside a section reaches the screen at all, and that
 * editing it writes back where the step's model keeps it (#101).
 *
 * `integron_finder` keeps nine parameters two levels down inside `settings`,
 * and none of them rendered: `section` was in neither `GalaxyToolParameterType`
 * nor the component map, so it arrived as a parameter with a value, no
 * component and no recursion into its children.
 *
 * Driven from the recorded declaration and the recorded state, for the reason
 * `BooleanToolParameter.test.ts` gives: `Step.vue` renders every widget
 * through `<component :is>`, whose props Vue does not typecheck, so a
 * hand-written fixture can only carry shapes somebody already thought of —
 * and the shape here is two levels of section around a `RuntimeValue`, a
 * string-typed integer and a real boolean.
 */

import type { GalaxySectionToolParameter, WorkflowConditionalParametersValue } from 'blendtype'
import { isParameterGroupValue } from '#imports'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { FIXTURES, loadFixture, toolOfStep } from '../../../nuxt-galaxy/test/characterisation/fixtures'
import BooleanToolParameter from '../../app/components/galaxy/BooleanToolParameter.vue'
import IntegerToolParameter from '../../app/components/galaxy/IntegerToolParameter.vue'
import SectionToolParameter from '../../app/components/galaxy/SectionToolParameter.vue'

const nested = loadFixture(FIXTURES.conditionalRepeatRuntime)

/**
 * The recorded `settings` section, with its dataset inputs pruned — which is
 * what `useGalaxyWorkflowDescription` hands `Step.vue`, and so what this
 * component is really given.
 *
 * Pruned through the production filter rather than by hand, so that the
 * component test and the composable cannot disagree about what arrives. Which
 * parameters survive the prune is pinned in `workflowParameterModel.test.ts`;
 * here it matters only that `covar_matrix` is absent, since a `data`
 * parameter is fed by an edge and never by this panel (#97).
 */
function settingsSection(): GalaxySectionToolParameter {
  const [section] = offeredToolInputs(toolOfStep(nested, '1').inputs).filter(input => input.name === 'settings')
  if (section === undefined || section.type !== 'section') {
    throw new Error('integron_finder declares no offered settings section')
  }
  return section
}

/**
 * What the revision saved under `settings`, exactly as recorded — read
 * through the same predicate the component reads it with, so the two cannot
 * disagree about what a section's value is.
 */
function savedSettings(): WorkflowConditionalParametersValue {
  const saved = nested.live.steps['1']?.tool_inputs?.settings
  if (!isParameterGroupValue(saved)) {
    throw new TypeError('step 1 saved no settings bag')
  }
  return saved
}

async function mountSettings(variant: 'form' | 'display' = 'form') {
  return mountSuspended(SectionToolParameter, {
    props: { ...settingsSection(), modelValue: savedSettings(), variant },
  })
}

describe('the recording this is about', () => {
  it('keeps nine parameters two levels down, one of them a dataset input', () => {
    // The premise, pinned so a re-recording that flattens the tool leaves the
    // tests below vacuous rather than passing.
    const saved = savedSettings()
    expect(Object.keys(saved).sort()).toEqual(['attc_settings', 'protein_settings'])
    const attc = saved.attc_settings as Record<string, unknown>
    expect(Object.keys(attc).sort()).toEqual([
      'calin_threshold',
      'covar_matrix',
      'dist_thresh',
      'keep_palindromes',
      'max_attc_size',
      'min_attc_size',
    ])
    expect(attc.covar_matrix).toEqual({ __class__: 'RuntimeValue' })
  })
})

describe('what a section puts on screen', () => {
  it('renders a widget for each parameter of each nested section', async () => {
    const wrapper = await mountSettings()

    // Four integers and one boolean in `attc_settings`, three booleans in
    // `protein_settings`. `covar_matrix` is the ninth and is not here: the
    // filter drops it, and `unconnectedInputsByStep` names it instead.
    expect(wrapper.findAllComponents(IntegerToolParameter).map(input => input.props('name')).sort())
      .toEqual(['calin_threshold', 'dist_thresh', 'max_attc_size', 'min_attc_size'])
    expect(wrapper.findAllComponents(BooleanToolParameter).map(input => input.props('name')).sort())
      .toEqual(['func_annot', 'keep_palindromes', 'no_proteins', 'union_integrases'])
  })

  it('renders the sections inside it, not only its own children', async () => {
    const wrapper = await mountSettings()

    expect(wrapper.find('[data-testid="section-settings"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="section-attc_settings"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="section-protein_settings"]').exists()).toBe(true)
  })

  it('shows each nested section under the title the tool gave it', async () => {
    const wrapper = await mountSettings()
    expect(wrapper.text()).toContain('Attc options')
    expect(wrapper.text()).toContain('Protein options')
  })

  it('hands a widget the value the revision saved for it, not the tool default', async () => {
    // `dist_thresh` is saved as the **string** `"4000"` — every integer
    // parameter is, since `IntegerToolParameter` inherits
    // `ToolParameter.to_json`, which is `unicodify(value)` (#112).
    const wrapper = await mountSettings()
    const distThresh = wrapper.findAllComponents(IntegerToolParameter)
      .find(input => input.props('name') === 'dist_thresh')
    expect(distThresh?.props('modelValue')).toBe('4000')
  })

  it('renders nothing rather than throwing when the saved value is not a bag', async () => {
    const wrapper = await mountSuspended(SectionToolParameter, {
      props: { ...settingsSection(), modelValue: null, variant: 'form' },
    })
    expect(wrapper.findAllComponents(IntegerToolParameter)).toHaveLength(0)
    expect(wrapper.find('[data-testid="section-settings"]').exists()).toBe(true)
  })

  it('renders in the read-only variant too, which is the analysis panel', async () => {
    const wrapper = await mountSettings('display')
    expect(wrapper.findAllComponents(BooleanToolParameter)).toHaveLength(4)
    expect(wrapper.text()).toContain('Attc options')
  })
})

describe('what a section writes back', () => {
  it('carries an edit two levels up, with the rest of the bag untouched', async () => {
    // The chain #101 needed: the switch emits, `attc_settings` replaces its
    // own bag and emits, and `settings` replaces its bag and emits the value
    // `Step.vue` assigns into the step's model. Mutating in place would look
    // identical here and would stop working the first time any level copies.
    const wrapper = await mountSettings()
    const target = wrapper.findAllComponents(BooleanToolParameter)
      .find(input => input.props('name') === 'keep_palindromes')
    expect(target).toBeDefined()

    await target!.get('[role="switch"]').trigger('click')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toHaveLength(1)
    const [value] = emitted![0] as [Record<string, Record<string, unknown>>]
    // `'true'` rather than `true`: the widget submits the 22.05 state
    // spelling, which `string_as_bool` reads on both releases (#111).
    expect(value.attc_settings!.keep_palindromes).toBe('true')
    expect(value.attc_settings!.dist_thresh).toBe('4000')
    expect(value.attc_settings!.covar_matrix).toEqual({ __class__: 'RuntimeValue' })
    expect(value.protein_settings).toEqual(savedSettings().protein_settings)
  })

  it('leaves the model it was given alone', async () => {
    // The copy `useGalaxyWorkflowDescription` makes protects the query cache
    // from `Step.vue`; nothing protects the bag this component is handed from
    // this component, so it must not write into it.
    const wrapper = await mountSettings()
    const target = wrapper.findAllComponents(BooleanToolParameter)
      .find(input => input.props('name') === 'keep_palindromes')
    await target!.get('[role="switch"]').trigger('click')

    const attc = nested.live.steps['1']!.tool_inputs!.settings as Record<string, Record<string, unknown>>
    expect(attc.attc_settings!.keep_palindromes).toBe(false)
  })
})
