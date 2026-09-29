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

import type { JobState } from 'blendtype'
import type { DescribedStep } from 'nuxt-galaxy'
import { UApp } from '#components'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useVueFlow } from '@vue-flow/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import Graph from '../../app/components/galaxy/workflow/Graph.vue'
import GraphView from '../../app/components/galaxy/workflow/GraphView.vue'
import { stepMarks } from '../../app/utils/stepMarks'
import { FIXTURES } from '../characterisation/fixtures'
import { aStep, describedSteps } from '../describedSteps'

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
 * The canvas with `steps` a test can replace, for the claims about what
 * survives a change of revision.
 *
 * `wrapper.setProps` cannot serve: the wrapper is the sized `UApp` host, so it
 * would set a prop on that and never reach the canvas.
 */
async function mountReactive(steps: Record<string, DescribedStep>) {
  const current = ref(steps)
  const wrapper = await mountSuspended(defineComponent({
    setup: () => () => h(UApp, () => h(
      'div',
      { style: 'width: 1200px; height: 800px' },
      [h(Graph, { steps: current.value })],
    )),
  }))
  function setSteps(next: Record<string, DescribedStep>) {
    current.value = next
  }
  return { wrapper, setSteps }
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

  it('anchors the two edges of a fan-in at the two outputs they really come from', async () => {
    // The half of AC2 the assertion above cannot see. Both edges were in the
    // DOM from the start, but every node had a single source handle, so the
    // two left and arrived at the same point with the same label: one line on
    // screen, two labels stacked on it, and a reader unable to tell that from
    // a single connection.
    const wrapper = await mountIn(Graph, { steps: describedSteps(FIXTURES.fanIn) })
    mounted = wrapper

    // Step 14 feeds step 19's one input from two of its outputs, so it has an
    // anchor for each rather than one for both.
    const anchors = wrapper.findAll('.vue-flow__node[data-id="14"] .vue-flow__handle[data-handlepos]')
      .map(handle => handle.attributes('data-handleid'))
    expect(anchors).toContain('proviruses')
    expect(anchors).toContain('viruses')

    // And they are at different places along the node's edge, which is what
    // makes the two lines distinguishable rather than coincident.
    const offsets = wrapper.findAll('.vue-flow__node[data-id="14"] .vue-flow__handle')
      .filter(handle => ['proviruses', 'viruses'].includes(handle.attributes('data-handleid') ?? ''))
      .map(handle => handle.attributes('style'))
    expect(new Set(offsets).size).toBe(2)
  })

  it('still anchors a step that neither declares an output nor is read from', async () => {
    // A node with no handle at all is one Vue Flow can route no edge to, so a
    // single-step workflow must not render handle-less.
    const wrapper = await mountIn(Graph, { steps: { 0: aStep(0, { type: 'data_input', tool_id: null, tool_version: null }) } })
    mounted = wrapper

    expect(wrapper.findAll('.vue-flow__node[data-id="0"] .vue-flow__handle').length).toBeGreaterThan(0)
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

  it('forgets a reader\'s place when a different revision arrives, and keeps it across a refetch', async () => {
    // Two defects in one assertion. The reset was keyed on the steps' *ids*,
    // which are `order_index`es — so any two workflows of the same length
    // shared them, and since the analysis page mounts this panel without a
    // `:key`, routing from one analysis to another kept the first one's
    // drill-down. Keyed on the object instead, the Retry beside an
    // unavailable tool would throw the reader's place away on every refetch.
    const nested = describedSteps(FIXTURES.subworkflowNested)
    const { wrapper, setSteps } = await mountReactive(nested)
    mounted = wrapper

    await wrapper.find('[data-testid="open-subworkflow-8"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="graph-trail-8"]').exists()).toBe(true)

    // A refetch of the same revision: a new object, the same steps.
    setSteps({ ...nested })
    await nextTick()
    expect(wrapper.find('[data-testid="graph-trail-8"]').exists()).toBe(true)

    // A different revision, of the same length: different uuids, so the place
    // goes.
    setSteps(Object.fromEntries(
      Object.entries(nested).map(([stepId, step]) => [stepId, { ...step, uuid: `other-${stepId}` }]),
    ))
    await nextTick()
    expect(wrapper.find('[data-testid="graph-trail-8"]').exists()).toBe(false)
  })

  it('falls back to the deepest drawable level rather than a blank canvas', async () => {
    // Reachable when a refetch answers a revision that no longer declares the
    // step a reader had drilled into. Drawn at the raw path, the canvas went
    // blank *and* the breadcrumb vanished with it, so there was no way back.
    const nested = describedSteps(FIXTURES.subworkflowNested)
    const { wrapper, setSteps } = await mountReactive(nested)
    mounted = wrapper

    await wrapper.find('[data-testid="open-subworkflow-8"]').trigger('click')
    await nextTick()
    expect(wrapper.findAll('.vue-flow__node')).toHaveLength(9)

    // The same steps by uuid — so the reset above does not fire — but step 8
    // embeds nothing any more.
    setSteps({ ...nested, 8: { ...nested['8']!, subworkflow: null } })
    await nextTick()

    expect(wrapper.findAll('.vue-flow__node')).toHaveLength(14)
    expect(wrapper.find('[data-testid="graph-trail-root"]').exists()).toBe(false)
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

  it('lays the graph out downwards when asked, and says which way it will go next', async () => {
    // Q6 is "left-to-right **by default**", so there is another way to lay it
    // out. The button carries no visible label — it read `LR`/`TB`, the
    // layout library's vocabulary — so what it will do is in its aria-label
    // and its icon, and that is what is asserted.
    const wrapper = await mountIn(GraphView, { steps })
    mounted = wrapper

    const posOf = () => wrapper.find('.vue-flow__node[data-id="9"] .vue-flow__handle[data-handlepos]')
      .attributes('data-handlepos')
    expect(posOf()).toBe('left')

    const toggle = wrapper.find('[data-testid="graph-direction"]')
    expect(toggle.attributes('aria-label')).toBe('Lay the graph out downwards')
    await toggle.trigger('click')
    await nextTick()

    // The anchors moved to the top and bottom, which is what routes the
    // edges the other way about.
    expect(posOf()).toBe('top')
    expect(toggle.attributes('aria-label')).toBe('Lay the graph out left to right')
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

describe('galaxyWorkflowGraph, following a running invocation', () => {
  /** An input feeding a tool feeding a tool: two steps that run jobs, and an edge out of each. */
  const chain = {
    0: aStep(0, { type: 'data_input', tool_id: null, tool_version: null }),
    1: aStep(1, { input_connections: { input: { id: 0, output_name: 'output' } } }),
    2: aStep(2, { input_connections: { input: { id: 1, output_name: 'out_file1' } } }),
  }

  /** The marks the analysis panel hands the canvas, derived as it derives them. */
  function marks(steps: Record<string, DescribedStep>, jobs: { step_id: number, state: JobState }[]) {
    return stepMarks(steps, jobs)
  }

  const stateOf = (wrapper: { find: (s: string) => { attributes: (a: string) => string | undefined } }, id: string) =>
    wrapper.find(`[data-testid="workflow-node-${id}"]`).attributes('data-state')

  it('colours each node by what that step is doing', async () => {
    // AC1. The input step at 0 runs no job and is never coloured by run
    // state; the two tool steps are.
    const wrapper = await mountIn(Graph, {
      steps: chain,
      marks: marks(chain, [{ step_id: 1, state: 'running' }, { step_id: 2, state: 'queued' }]),
    })
    mounted = wrapper

    expect(stateOf(wrapper, '0')).toBe('unmarked')
    expect(stateOf(wrapper, '1')).toBe('running')
    expect(stateOf(wrapper, '2')).toBe('queued')
  })

  it('draws a skipped step differently from one that has not started', async () => {
    // AC4, and the reason it is worth its own criterion: a conditional
    // Galaxy declined to run and a step whose turn has not come are two
    // different answers, and collapsing them tells the reader the wrong one.
    const wrapper = await mountIn(Graph, {
      steps: chain,
      marks: marks(chain, [{ step_id: 1, state: 'skipped' }]),
    })
    mounted = wrapper

    expect(stateOf(wrapper, '1')).toBe('skipped')
    expect(stateOf(wrapper, '2')).toBe('notStarted')

    // Distinct on screen, not only in an attribute: a different word and a
    // different icon, which is what a reader actually has to tell apart.
    const skipped = wrapper.find('[data-testid="node-mark-1"]')
    const notStarted = wrapper.find('[data-testid="node-mark-2"]')
    expect(skipped.attributes('aria-label')).toBe('Skipped')
    expect(notStarted.attributes('aria-label')).toBe('Not started')
    expect(skipped.html()).not.toBe(notStarted.html())
  })

  it('draws a paused step as paused, and offers nothing to resume it', async () => {
    // AC5. Galaxy pauses a job whose input dataset is paused or errored; the
    // graph says so and stops there, because resuming runs under a service
    // account and who may do it is unanswered (Q21).
    const wrapper = await mountIn(Graph, {
      steps: chain,
      marks: marks(chain, [{ step_id: 1, state: 'ok' }, { step_id: 2, state: 'paused' }]),
    })
    mounted = wrapper

    expect(stateOf(wrapper, '2')).toBe('paused')
    expect(wrapper.find('[data-testid="node-mark-2"]').attributes('aria-label')).toBe('Paused')
    expect(wrapper.html().toLowerCase()).not.toContain('resume')
  })

  it('animates the edge leaving a running step, and no other', async () => {
    // AC2, in the DOM rather than in the derivation: Vue Flow puts its own
    // `animated` class on the edge, and that is the whole of the drawing.
    const wrapper = await mountIn(Graph, {
      steps: chain,
      marks: marks(chain, [{ step_id: 1, state: 'running' }, { step_id: 2, state: 'queued' }]),
    })
    mounted = wrapper

    const edgeFrom = (id: string) => wrapper.find(`.vue-flow__edge[data-id^="${id}:"]`)
    expect(edgeFrom('1').classes()).toContain('animated')
    expect(edgeFrom('0').classes()).not.toContain('animated')
  })

  it('badges a mapped step with every one of its jobs', async () => {
    // AC3, and what #84 had to land for: before it, a step mapping over
    // fifteen elements recorded nothing at all and this would read zero.
    const jobs: { step_id: number, state: JobState }[] = [
      ...Array.from({ length: 12 }, () => ({ step_id: 1, state: 'ok' as const })),
      ...Array.from({ length: 3 }, () => ({ step_id: 1, state: 'running' as const })),
    ]
    const wrapper = await mountIn(Graph, { steps: chain, marks: marks(chain, jobs) })
    mounted = wrapper

    expect(wrapper.find('[data-testid="node-count-1"]').text()).toBe('12/15 Succeeded, 3 Running')
    // And a step with one job is not badged: its colour already says it.
    expect(wrapper.find('[data-testid="node-count-2"]').exists()).toBe(false)
  })

  it('never carries a mark into a subworkflow, where the same index means another step', async () => {
    // A nested step's `order_index` collides with an outer step's — they are
    // both 0, 1, 2 — and a job row's `step_id` is the *outer* one's. Handing
    // the level's marks straight down would mark the wrong steps with real
    // states, which is worse than marking nothing.
    const outer = describedSteps(FIXTURES.subworkflowNested)
    const wrapper = await mountIn(Graph, {
      steps: outer,
      marks: stepMarks({ 0: aStep(0) }, [{ step_id: 0, state: 'running' }]),
    })
    mounted = wrapper

    await wrapper.find('[data-testid="open-subworkflow-8"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="graph-trail-8"]').exists()).toBe(true)
    expect(stateOf(wrapper, '0')).toBe('unmarked')
    expect(wrapper.findAll('.vue-flow__edge.animated')).toHaveLength(0)
  })

  it('keeps a node where a reader dragged it when the marks change', async () => {
    // Q6 says dragging is allowed, and #90 is what nearly took it away. Vue
    // Flow re-parses whenever the `nodes` array changes and
    // `Object.assign(existingNode, node)` puts the laid-out position back
    // (`vue-flow-core.mjs:3573`), so carrying the marks *inside* the node
    // data snapped every dragged node home on each realtime refetch — on the
    // one screen where the marks change every few seconds.
    const marked = ref(marks(chain, [{ step_id: 1, state: 'queued' }]))
    const wrapper = await mountSuspended(defineComponent({
      setup: () => () => h(UApp, () => h(
        'div',
        { style: 'width: 1200px; height: 800px' },
        [h(Graph, { steps: chain, marks: marked.value })],
      )),
    }))
    mounted = wrapper

    // The store the canvas made for itself, reached the way the DOM names
    // it, so the node can be moved exactly as a drag moves it.
    const describedBy = wrapper.find('.vue-flow__node').attributes('aria-describedby')!
    const flow = useVueFlow(describedBy.replace('vue-flow__node-desc-', ''))
    const transform = () => wrapper.find('.vue-flow__node[data-id="1"]').attributes('style')

    flow.updateNode('1', { position: { x: 999, y: 777 } })
    await nextTick()
    expect(transform(), 'the node moved').toContain('translate(999px,777px)')

    marked.value = marks(chain, [{ step_id: 1, state: 'running' }])
    await nextTick()

    expect(transform(), 'and stayed where it was put').toContain('translate(999px,777px)')
    // And the mark still arrived, which is what makes this a fix rather than
    // a canvas that stopped listening.
    expect(stateOf(wrapper, '1')).toBe('running')
  })

  it('draws no run state at all when the canvas is handed no marks', async () => {
    // Invoke-mode, and every canvas before #90: one canvas, no mode (Q2').
    const wrapper = await mountIn(Graph, { steps: chain })
    mounted = wrapper

    expect(stateOf(wrapper, '1')).toBe('unmarked')
    expect(wrapper.find('[data-testid="node-mark-1"]').exists()).toBe(false)
    expect(wrapper.findAll('.vue-flow__edge.animated')).toHaveLength(0)
  })
})
