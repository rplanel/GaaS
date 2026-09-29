/**
 * That a repeat renders one block per saved instance, and that editing one
 * block leaves the rest of the list as it was (#101).
 *
 * A repeat is the one group whose arity lives in the **state** rather than in
 * the declaration: the tool declares one blueprint and the saved list holds
 * however many blocks the author added. So the walk has to go the other way
 * round from a section's — read the list, resolve each value against the
 * blueprint — which is the direction `unconnectedDatasetInputs` already takes.
 *
 * Adding and removing blocks is deliberately absent, and `useGalaxyEncodeParameters`
 * carries the reason: `compute_runtime_state` applies invocation parameters
 * by walking the instances the saved state already holds, so a name for a
 * block that is not there matches nothing and there is no spelling for
 * removing one.
 */

import type { GalaxyRepeatToolParameter, GalaxyTool, WorkflowParameterValue } from 'blendtype'
import type { WorkflowFixture } from '../characterisation/fixtures'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import Conditional from '../../app/components/galaxy/Conditional.vue'
import RepeatToolParameter from '../../app/components/galaxy/RepeatToolParameter.vue'
import { FIXTURES, loadFixture } from '../characterisation/fixtures'

const nested = loadFixture(FIXTURES.conditionalRepeatRuntime)

function toolOf(fixture: WorkflowFixture, step: string): GalaxyTool {
  const definition = fixture.live.steps[step]
  const tool = fixture.tools[`${definition?.tool_id}@${definition?.tool_version}`]
  if (!tool) {
    throw new Error(`step ${step} of ${fixture.slug} recorded no tool`)
  }
  return tool
}

/**
 * `__BUILD_LIST__`'s `datasets` repeat, pruned through the production filter.
 *
 * What survives the prune is the conditional; its `data` sibling `input` does
 * not, being fed by an edge (#97). So the block a reader sees is the branch
 * selector and nothing else, which is the whole of what this repeat offers.
 */
function datasetsRepeat(): GalaxyRepeatToolParameter {
  const [repeat] = offeredToolInputs(toolOf(nested, '2').inputs).filter(input => input.name === 'datasets')
  if (repeat === undefined || repeat.type !== 'repeat') {
    throw new Error('__BUILD_LIST__ declares no offered datasets repeat')
  }
  return repeat
}

/** The five blocks the revision saved on step 2, exactly as recorded. */
function savedDatasets(): WorkflowParameterValue[] {
  const saved = nested.live.steps['2']?.tool_inputs?.datasets
  if (!Array.isArray(saved)) {
    throw new TypeError('step 2 saved no datasets list')
  }
  return saved
}

async function mountRepeat(modelValue: WorkflowParameterValue = savedDatasets(), variant: 'form' | 'display' = 'form') {
  return mountSuspended(RepeatToolParameter, {
    props: { ...datasetsRepeat(), modelValue, variant },
  })
}

function blocks(html: string): string[] {
  return [...html.matchAll(/data-index="(\d+)"/g)].map(match => match[1]!)
}

describe('the recording this is about', () => {
  it('saves five blocks, each carrying its own __index__', () => {
    const saved = savedDatasets() as { __index__: number }[]
    expect(saved.map(block => block.__index__)).toEqual([0, 1, 2, 3, 4])
  })
})

describe('what a repeat puts on screen', () => {
  it('renders one block per saved instance, not one per declared input', async () => {
    const wrapper = await mountRepeat()
    expect(wrapper.findAll('[data-testid^="repeat-datasets-"]')).toHaveLength(5)
    expect(wrapper.findAllComponents(Conditional)).toHaveLength(5)
  })

  it('numbers the blocks the way Galaxy labels them, one-based from the position', async () => {
    // `"%s %d > " % (input.title, i + 1)` in `visit_input_values`, both
    // releases. The title is `Dataset(s)`.
    const wrapper = await mountRepeat()
    expect(wrapper.text()).toContain('Dataset(s) 1')
    expect(wrapper.text()).toContain('Dataset(s) 5')
    expect(wrapper.text()).not.toContain('Dataset(s) 6')
  })

  it('identifies a block by the __index__ it carries, so a gap survives', async () => {
    // The acceptance criterion, read as what it can still mean: the
    // submitted *name* is the position, because `visit_input_values`
    // renumbers `__index__` to the position before building it. What the
    // saved index still decides is which block is which across a re-render,
    // and a state with a gap keeps it rather than being renumbered on screen.
    const wrapper = await mountRepeat([
      { __index__: 0, id_cond: { __current_case__: 0, id_select: 'idx' } },
      { __index__: 2, id_cond: { __current_case__: 0, id_select: 'idx' } },
    ])
    expect(blocks(wrapper.html())).toEqual(['0', '2'])
    expect(wrapper.text()).toContain('Dataset(s) 1')
    expect(wrapper.text()).toContain('Dataset(s) 2')
  })

  it('skips an entry that is not an instance, and renders the rest', async () => {
    // Galaxy back-fills a missing `__index__` from the position "for backward
    // compatibility" (`grouping.py`, both releases), so an entry without one
    // is legacy state rather than an impossibility. It has no name this
    // component can submit, so it is not drawn.
    const wrapper = await mountRepeat([
      { id_cond: { __current_case__: 0, id_select: 'idx' } },
      { __index__: 1, id_cond: { __current_case__: 0, id_select: 'idx' } },
    ])
    expect(blocks(wrapper.html())).toEqual(['1'])
  })

  it('renders nothing rather than throwing when the saved value is not a list', async () => {
    const wrapper = await mountRepeat({ __class__: 'RuntimeValue' })
    expect(wrapper.findAll('[data-testid^="repeat-datasets-"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="repeat-datasets"]').exists()).toBe(true)
  })

  it('renders in the read-only variant too', async () => {
    const wrapper = await mountRepeat(savedDatasets(), 'display')
    expect(wrapper.findAllComponents(Conditional)).toHaveLength(5)
  })
})

describe('what a repeat writes back', () => {
  it('replaces one block and carries every other entry through untouched', async () => {
    const wrapper = await mountRepeat()
    const third = wrapper.findAllComponents(Conditional)[2]
    expect(third).toBeDefined()

    third!.vm.$emit('update:modelValue', { __current_case__: 0, id_select: 'idx' })
    await wrapper.vm.$nextTick()

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toHaveLength(1)
    const [value] = emitted![0] as [Record<string, unknown>[]]
    expect(value).toHaveLength(5)
    expect(value[2]).toEqual({
      __index__: 2,
      id_cond: { __current_case__: 0, id_select: 'idx' },
      input: { __class__: 'ConnectedValue' },
    })
    // The four the reader did not touch, including the `data` input the
    // filter never offered a widget for.
    expect(value.filter((_, index) => index !== 2)).toEqual(savedDatasets().filter((_, index) => index !== 2))
  })

  it('keeps an entry it did not render, rather than dropping it on the first edit', async () => {
    const orphan = { id_cond: { __current_case__: 0, id_select: 'idx' } }
    const wrapper = await mountRepeat([orphan, { __index__: 1, id_cond: { __current_case__: 1, id_select: 'identifier' } }])

    wrapper.findAllComponents(Conditional)[0]!.vm.$emit('update:modelValue', { __current_case__: 0, id_select: 'idx' })
    await wrapper.vm.$nextTick()

    const [value] = wrapper.emitted('update:modelValue')![0] as [Record<string, unknown>[]]
    expect(value).toHaveLength(2)
    expect(value[0]).toEqual(orphan)
  })

  it('leaves the list it was given alone', async () => {
    const wrapper = await mountRepeat()
    wrapper.findAllComponents(Conditional)[0]!.vm.$emit('update:modelValue', { __current_case__: 0, id_select: 'idx' })
    await wrapper.vm.$nextTick()

    const saved = savedDatasets() as { id_cond: { __current_case__: number } }[]
    expect(saved[0]!.id_cond.__current_case__).toBe(1)
  })
})
