/**
 * The canvas and the panel beside it, as a reader meets them (#89).
 *
 * The derivation has its own suite in `../utils/workflowGraph.test.ts`; what
 * is here is what only a mounted canvas can answer — that the nodes and edges
 * really reach the DOM, that pressing a subworkflow node draws that
 * subworkflow's own graph, and that the panel is beside the canvas on a wide
 * screen and a slideover below the breakpoint.
 *
 * The shapes that matter come from the committed recordings, put through the
 * real normaliser: a fan-in and a subworkflow nested in a subworkflow are the
 * two this canvas exists to draw, and neither could be trusted to a
 * hand-written fixture.
 */

import type { DescribedStep } from 'nuxt-galaxy'
import { UApp } from '#components'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { galaxyWorkflowExportSchema } from 'blendtype'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
// The normaliser the description endpoint answers with — see the note in
// `../utils/workflowGraph.test.ts` for why it is reached by path.
import { describedStepsOf } from '../../../nuxt-galaxy/src/runtime/server/utils/grizzle/storedDefinition'
import Graph from '../../app/components/galaxy/workflow/Graph.vue'
import GraphView from '../../app/components/galaxy/workflow/GraphView.vue'
import { FIXTURES, loadFixture } from '../characterisation/fixtures'

/**
 * Which side of the small-screen breakpoint the view is mounted on.
 *
 * Mocked rather than driven through `matchMedia`: happy-dom's window is a
 * fixed 1024 wide and `useBreakpoints` reads media queries, so there is no
 * width to set that would move it. `false` is the wide screen, which is what
 * happy-dom would have answered anyway.
 */
const isSmallDesktopOrMobile = ref(false)

vi.mock('../../app/composables/useDefinedBreakpoints', () => ({
  useDefinedBreakpoints: () => ({
    isMobile: ref(false),
    isSmallDesktopOrMobile,
    isDesktop: ref(true),
  }),
}))

/** One recording's stored definition, normalised exactly as the endpoint normalises it. */
function describedSteps(slug: string): Record<string, DescribedStep> {
  return describedStepsOf(galaxyWorkflowExportSchema.loose().parse(loadFixture(slug).exported))
}

function aStep(id: number, over: Partial<DescribedStep> = {}): DescribedStep {
  return {
    id,
    type: 'tool',
    label: null,
    uuid: `uuid-${id}`,
    annotation: null,
    tool_id: 'toolshed.g2.bx.psu.edu/repos/iuc/foo/foo/1.2.3',
    tool_version: '1.2.3',
    tool_inputs: {},
    input_connections: {},
    outputs: [],
    subworkflow: null,
    ...over,
  }
}

/**
 * The canvas, or the whole view, inside a `UApp` — which `USlideover` needs
 * for its portal target.
 *
 * Sized, because Vue Flow measures its container: a canvas of no size lays
 * out all the same, but nothing is gained by pretending otherwise.
 */
async function mountIn(component: unknown, props: Record<string, unknown>) {
  return mountSuspended(defineComponent({
    setup: () => () => h(UApp, () => h(
      'div',
      { style: 'width: 1200px; height: 800px' },
      [h(component as never, props)],
    )),
  }))
}

/**
 * A dialog and a toast outlive the component that opened them: both are
 * portalled to the body, which no unmount empties. Left behind, the next test
 * reads the previous one's slideover.
 */
let mounted: { unmount: () => void } | undefined

beforeEach(() => {
  isSmallDesktopOrMobile.value = false
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

describe('galaxyWorkflowGraph', () => {
  it('draws one node per step of a published revision', async () => {
    const steps = describedSteps(FIXTURES.ccqtlToday)
    const wrapper = await mountIn(Graph, { steps })
    mounted = wrapper

    expect(wrapper.find('[data-testid="workflow-graph"]').exists()).toBe(true)
    for (const stepId of Object.keys(steps)) {
      expect(wrapper.find(`[data-testid="workflow-node-${stepId}"]`).exists()).toBe(true)
    }
    expect(wrapper.findAll('.vue-flow__node')).toHaveLength(Object.keys(steps).length)
  })

  it('draws both edges of an input fed by two upstream outputs', async () => {
    // The acceptance criterion the switch of source exists for: the live
    // payload keeps only the last of these two, with nothing to show for it.
    const wrapper = await mountIn(Graph, { steps: describedSteps(FIXTURES.fanIn) })
    mounted = wrapper

    // Step 19 is fed twice through one input by one upstream step, from two
    // of its outputs — so the two edges are distinguishable only if the
    // output's name is part of the edge's identity.
    expect(wrapper.find('[data-id="14:proviruses->19:batchmode|input_fastas"]').exists()).toBe(true)
    expect(wrapper.find('[data-id="14:viruses->19:batchmode|input_fastas"]').exists()).toBe(true)
  })

  it('names a connection pointing at no step instead of dropping it silently', async () => {
    const wrapper = await mountIn(Graph, {
      steps: {
        0: aStep(0, { type: 'data_input', tool_id: null, tool_version: null }),
        1: aStep(1, { input_connections: { other: { id: 7, output_name: 'output' } } }),
      },
    })
    mounted = wrapper

    const warning = wrapper.find('[data-testid="graph-dangling"]')
    expect(warning.exists()).toBe(true)
    expect(warning.text()).toContain('7 → 1.other')
  })

  it('says nothing when every connection is drawn', async () => {
    const wrapper = await mountIn(Graph, { steps: describedSteps(FIXTURES.ccqtlToday) })
    mounted = wrapper

    expect(wrapper.find('[data-testid="graph-dangling"]').exists()).toBe(false)
  })

  it('emits the step a reader presses, with the level it was pressed on', async () => {
    const steps = describedSteps(FIXTURES.ccqtlToday)
    const selections: unknown[] = []
    const wrapper = await mountSuspended(defineComponent({
      setup: () => () => h(UApp, () => h(Graph, {
        steps,
        onSelect: (selection: unknown) => selections.push(selection),
      })),
    }))
    mounted = wrapper

    await wrapper.find('.vue-flow__node[data-id="2"]').trigger('click')
    await nextTick()

    expect(selections).toHaveLength(1)
    expect(selections[0]).toMatchObject({ stepId: '2', path: [] })
    // The level comes with it, so whatever renders the selection can name the
    // steps feeding it without knowing how deep the canvas has been drilled.
    expect(Object.keys((selections[0] as { level: Record<string, unknown> }).level)).toEqual(Object.keys(steps))
  })

  it('leaves no stored layout behind, so the next render lays the graph out again', async () => {
    // Q6: dragging is allowed and positions are deliberately not persisted.
    // Nothing writes them, and this is what says so — a canvas that started
    // remembering a layout would have to write it somewhere a reader's
    // browser keeps.
    const before = { local: Object.keys({ ...localStorage }), session: Object.keys({ ...sessionStorage }) }
    const wrapper = await mountIn(Graph, { steps: describedSteps(FIXTURES.ccqtlToday) })
    mounted = wrapper
    await nextTick()

    // Compared against what was there rather than against nothing: the app
    // around the canvas keeps a colour-mode preference, and the claim is that
    // *this* component adds no key of its own.
    expect(Object.keys({ ...localStorage })).toEqual(before.local)
    expect(Object.keys({ ...sessionStorage })).toEqual(before.session)
    // And dragging is on rather than merely defaulted, which is the half of
    // the criterion the storage check cannot see.
    expect(wrapper.find('.vue-flow__node[data-id="0"]').classes()).toContain('draggable')
  })
})

describe('galaxyWorkflowGraph, on a subworkflow step', () => {
  const steps = describedSteps(FIXTURES.subworkflowNested)

  it('draws it as one node with a way into it, not as the steps it holds', async () => {
    const wrapper = await mountIn(Graph, { steps })
    mounted = wrapper

    // 14 outer steps, although the definition holds 21 nested ones as well.
    expect(wrapper.findAll('.vue-flow__node')).toHaveLength(14)
    expect(wrapper.find('[data-testid="open-subworkflow-8"]').exists()).toBe(true)
    // And only the subworkflow steps carry one.
    expect(wrapper.findAll('[data-testid^="open-subworkflow-"]')).toHaveLength(2)
  })

  it('draws that subworkflow\'s own graph when the node is opened', async () => {
    const wrapper = await mountIn(Graph, { steps })
    mounted = wrapper

    await wrapper.find('[data-testid="open-subworkflow-8"]').trigger('click')
    await nextTick()

    // The nine steps of the subworkflow, in place of the fourteen outer ones.
    expect(wrapper.findAll('.vue-flow__node')).toHaveLength(9)
    expect(wrapper.find('[data-testid="graph-trail-8"]').text()).toBe(steps['8']!.label)
  })

  it('goes two levels down, and back out again', async () => {
    const wrapper = await mountIn(Graph, { steps })
    mounted = wrapper

    await wrapper.find('[data-testid="open-subworkflow-8"]').trigger('click')
    await nextTick()
    // The subworkflow holds a subworkflow of its own, at its own step 8.
    await wrapper.find('[data-testid="open-subworkflow-8"]').trigger('click')
    await nextTick()

    expect(wrapper.findAll('.vue-flow__node')).toHaveLength(12)
    expect(wrapper.find('[data-testid="graph-trail-8-8"]').exists()).toBe(true)

    // Back to the workflow itself, which is the way out a reader needs.
    await wrapper.find('[data-testid="graph-trail-root"]').trigger('click')
    await nextTick()
    expect(wrapper.findAll('.vue-flow__node')).toHaveLength(14)
    expect(wrapper.find('[data-testid="graph-trail-root"]').exists()).toBe(false)
  })

  it('emits the nested step it is inside, so nothing joins it to a job row', async () => {
    // A job row's `step_id` is the *outer* step's order index, so a nested
    // step has no row of its own. #90 reads the path to know that.
    const selections: { stepId: string, path: string[] }[] = []
    const wrapper = await mountSuspended(defineComponent({
      setup: () => () => h(UApp, () => h(Graph, {
        steps,
        onSelect: (selection: { stepId: string, path: string[] } | undefined) => {
          if (selection) {
            selections.push(selection)
          }
        },
      })),
    }))
    mounted = wrapper

    await wrapper.find('[data-testid="open-subworkflow-8"]').trigger('click')
    await nextTick()
    await wrapper.find('.vue-flow__node[data-id="1"]').trigger('click')
    await nextTick()

    expect(selections.at(-1)).toMatchObject({ stepId: '1', path: ['8'] })
  })
})

describe('galaxyWorkflowGraphView', () => {
  const steps = describedSteps(FIXTURES.subworkflowNested)

  it('puts the panel beside the canvas on a wide screen', async () => {
    const wrapper = await mountIn(GraphView, { steps })
    mounted = wrapper

    expect(wrapper.find('[data-testid="graph-detail-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="graph-step-details"]').text())
      .toContain('Select a step on the canvas')
  })

  it('shows what feeds the selected step, named as the canvas names it', async () => {
    const wrapper = await mountIn(GraphView, { steps })
    mounted = wrapper

    await wrapper.find('.vue-flow__node[data-id="9"]').trigger('click')
    await nextTick()

    const details = wrapper.find('[data-testid="graph-step-details"]')
    // The edges feeding it, which is the one thing a reader cannot get off a
    // node: the input's name, and the step and output it comes from.
    const fedBy = Object.keys(steps['9']!.input_connections)
    expect(fedBy.length).toBeGreaterThan(0)
    for (const inputName of fedBy) {
      expect(details.text()).toContain(inputName)
    }
  })

  it('offers the way into a subworkflow from the panel as well as from the node', async () => {
    const wrapper = await mountIn(GraphView, { steps })
    mounted = wrapper

    await wrapper.find('.vue-flow__node[data-id="8"]').trigger('click')
    await nextTick()

    const open = wrapper.find('[data-testid="graph-open-subworkflow"]')
    expect(open.exists()).toBe(true)
    await open.trigger('click')
    await nextTick()

    expect(wrapper.findAll('.vue-flow__node')).toHaveLength(9)
  })

  it('becomes a slideover below the small-screen breakpoint', async () => {
    isSmallDesktopOrMobile.value = true
    const wrapper = await mountIn(GraphView, { steps })
    mounted = wrapper

    // No column beside the canvas on this side of the breakpoint — there is
    // no room for two.
    expect(wrapper.find('[data-testid="graph-detail-panel"]').exists()).toBe(false)
    // And nothing is over the canvas until a step is selected.
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()

    await wrapper.find('.vue-flow__node[data-id="9"]').trigger('click')
    await nextTick()
    await nextTick()

    // The slideover is portalled to the body, so it is looked for there
    // rather than in the wrapper.
    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog!.textContent).toContain('Fed by')
  })
})
