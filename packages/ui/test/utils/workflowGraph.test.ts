/**
 * The nodes, the edges and the layout the canvas draws (#89).
 *
 * Driven off the committed recordings wherever the claim is about a shape
 * Galaxy emits — a fan-in, a subworkflow nested in a subworkflow — because a
 * hand-written fixture can only carry shapes somebody thought of, and these
 * are the two the graph exists to draw correctly. The stored definitions are
 * put through the real normaliser rather than read raw, so what is asserted
 * is what the endpoint serves.
 */

import type { DescribedStep } from 'nuxt-galaxy'
import { galaxyWorkflowExportSchema } from 'blendtype'
import { describe, expect, it } from 'vitest'
// Reached by path, and deliberately: this is the normaliser the description
// endpoint answers with, and the graph is only correct if it draws what that
// function really produces. `nuxt-galaxy`'s `exports` field offers no subpath
// for it, and copying it here would make this suite agree with a copy of the
// thing it is meant to be testing against.
import { describedStepsOf } from '../../../nuxt-galaxy/src/runtime/server/utils/grizzle/storedDefinition'
import {
  handleSides,
  NODE_HEIGHT,
  NODE_WIDTH,
  stepNodeLabel,
  stepsAtPath,
  subworkflowTrail,
  toolDisplayName,
  workflowGraph,
} from '../../app/utils/workflowGraph'
import { FIXTURES, loadFixture } from '../characterisation/fixtures'

/** One recording's stored definition, normalised exactly as the endpoint normalises it. */
function describedSteps(slug: string): Record<string, DescribedStep> {
  const parsed = galaxyWorkflowExportSchema.loose().parse(loadFixture(slug).exported)
  return describedStepsOf(parsed)
}

/** A step built by hand, for the claims that are about this code and not about Galaxy. */
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

describe('workflowGraph', () => {
  it('draws one node per step and one edge per connection', () => {
    const steps = describedSteps(FIXTURES.ccqtlToday)
    const { nodes, edges, dangling } = workflowGraph(steps)

    expect(nodes.map(node => node.id)).toEqual(['0', '1', '2', '3', '4', '5', '6'])
    // Every connection of every step, counted off the definition rather than
    // written down: 2 + 3 + 4 + 7 + 4 on the five tool steps.
    const declared = Object.values(steps)
      .flatMap(step => Object.values(step.input_connections))
      .flatMap(value => (Array.isArray(value) ? value : [value]))
    expect(edges).toHaveLength(declared.length)
    expect(dangling).toEqual([])
  })

  it('draws both edges of an input fed by two upstream outputs', () => {
    // The acceptance criterion the whole switch of source exists for (Q12):
    // Galaxy's live payload assigns `input_steps[input_name]` in a loop, so
    // the second of these two would have been dropped with nothing on the
    // picture to say so.
    const { edges } = workflowGraph(describedSteps(FIXTURES.fanIn))

    const intoStep = (target: string) =>
      edges.filter(edge => edge.target === target && edge.label === 'batchmode|input_fastas')

    // Two upstream steps feeding one input.
    expect(intoStep('9').map(edge => edge.source).sort()).toEqual(['5', '6'])

    // And the sharper case the same recording carries: **one** upstream step
    // feeding one input twice, from two of its outputs. Two edges between the
    // same pair of nodes, so they are distinguishable only if the output's
    // name is part of the edge's identity — which is why it is.
    const fromOneStep = intoStep('19')
    expect(fromOneStep.map(edge => edge.source)).toEqual(['14', '14'])
    expect(new Set(fromOneStep.map(edge => edge.id)).size).toBe(2)
    expect(new Set(edges.map(edge => edge.id)).size).toBe(edges.length)
  })

  it('names a connection that points at no step instead of dropping it silently', () => {
    // Vue Flow drops an edge whose source matches no node and says nothing,
    // which is precisely the failure a graph cannot signal.
    const { edges, dangling } = workflowGraph({
      0: aStep(0, { type: 'data_input', tool_id: null, tool_version: null }),
      1: aStep(1, { input_connections: { input1: { id: 0, output_name: 'output' }, other: { id: 7, output_name: 'output' } } }),
    })

    expect(edges.map(edge => edge.label)).toEqual(['input1'])
    expect(dangling).toEqual(['7 → 1.other'])
  })

  it('lays out left to right by default and top to bottom on request', () => {
    const steps = {
      0: aStep(0, { type: 'data_input', tool_id: null, tool_version: null }),
      1: aStep(1, { input_connections: { input1: { id: 0, output_name: 'output' } } }),
    }

    const lr = workflowGraph(steps, 'LR')
    const tb = workflowGraph(steps, 'TB')

    const xOf = (graph: typeof lr, id: string) => graph.nodes.find(node => node.id === id)!.position.x
    const yOf = (graph: typeof lr, id: string) => graph.nodes.find(node => node.id === id)!.position.y

    // Left to right: the downstream step is further right and on the same row.
    expect(xOf(lr, '1')).toBeGreaterThan(xOf(lr, '0'))
    expect(yOf(lr, '1')).toBe(yOf(lr, '0'))
    // Top to bottom: the other way about.
    expect(yOf(tb, '1')).toBeGreaterThan(yOf(tb, '0'))
    expect(xOf(tb, '1')).toBe(xOf(tb, '0'))
  })

  it('tells each node which side its edges leave and arrive on', () => {
    // The canvas places its handles from these, and the handle is what Vue
    // Flow routes an edge by — it measures `handleBounds` and falls back to
    // bottom-and-top when it cannot. So a handle on the wrong side is an edge
    // drawn round the outside of its own node, and this is the single place
    // the side is decided.
    const [lr] = workflowGraph({ 0: aStep(0) }, 'LR').nodes
    const [tb] = workflowGraph({ 0: aStep(0) }, 'TB').nodes

    expect([lr!.sourcePosition, lr!.targetPosition]).toEqual(['right', 'left'])
    expect([tb!.sourcePosition, tb!.targetPosition]).toEqual(['bottom', 'top'])
    // The handles are placed from the same function, not a second ternary.
    expect(handleSides('LR')).toEqual({ source: lr!.sourcePosition, target: lr!.targetPosition })
    expect(handleSides('TB')).toEqual({ source: tb!.sourcePosition, target: tb!.targetPosition })
  })

  it('positions a node by its top-left corner, as Vue Flow reads it', () => {
    // Dagre answers with centres. Handed over unconverted every node sits
    // half its own size up and to the left of where its edges arrive.
    const { nodes } = workflowGraph({ 0: aStep(0) })
    const node = nodes[0]!
    // One node, so dagre puts its centre at the margin plus half the box.
    expect(node.position).toEqual({ x: 16, y: 16 })
    expect({ NODE_WIDTH, NODE_HEIGHT }).toEqual({ NODE_WIDTH: 260, NODE_HEIGHT: 96 })
  })

  it('draws a subworkflow as one node, not as the steps it contains', () => {
    // Q19: one node that a reader opens, never expanded inline. The recording
    // has 14 outer steps and 21 nested ones.
    const steps = describedSteps(FIXTURES.subworkflowNested)
    const { nodes } = workflowGraph(steps)

    expect(nodes).toHaveLength(Object.keys(steps).length)
    expect(nodes.filter(node => node.data.isSubworkflow).map(node => node.id)).toEqual(['8', '12'])
  })

  it('gives every step but an input step a target handle', () => {
    const { nodes } = workflowGraph({
      0: aStep(0, { type: 'data_input', tool_id: null, tool_version: null }),
      1: aStep(1, { type: 'data_collection_input', tool_id: null, tool_version: null }),
      2: aStep(2, { type: 'parameter_input', tool_id: null, tool_version: null }),
      3: aStep(3),
      4: aStep(4, { type: 'subworkflow', tool_id: null, tool_version: null, subworkflow: { name: 'Inner', steps: {} } }),
    })

    expect(nodes.map(node => node.data.acceptsInput)).toEqual([false, false, false, true, true])
  })
})

describe('stepNodeLabel', () => {
  it('prefers the author\'s own label, as Galaxy\'s editor does', () => {
    expect(stepNodeLabel(aStep(1, { label: 'Align the reads' }))).toBe('Align the reads')
  })

  it('falls back to the tool name for a tool step', () => {
    expect(stepNodeLabel(aStep(1))).toBe('foo')
  })

  it('names an input step as Galaxy names it, through the shared derivation', () => {
    const unnamed = aStep(0, { type: 'data_input', tool_id: null, tool_version: null })
    expect(stepNodeLabel(unnamed)).toBe('Input Dataset')
    expect(stepNodeLabel({ ...unnamed, type: 'parameter_input' })).toBe('Input Parameter')
    // The `name` in the saved state comes before the type's own string, which
    // is the order `describedInputsOf` uses for the datamap. Both read one
    // derivation so a node and a form field cannot name one input two ways.
    expect(stepNodeLabel({ ...unnamed, tool_inputs: { name: 'Named in state' } })).toBe('Named in state')
  })

  it('falls back to the subworkflow\'s own name for an unlabelled subworkflow step', () => {
    const step = aStep(8, {
      type: 'subworkflow',
      tool_id: null,
      tool_version: null,
      subworkflow: { name: 'Trim and map', steps: {} },
    })
    expect(stepNodeLabel(step)).toBe('Trim and map')
    // And says something rather than nothing when the nested export names
    // itself no more than the step does.
    expect(stepNodeLabel({ ...step, subworkflow: { name: null, steps: {} } })).toBe('Step 8')
  })

  it('labels the real recording as the label the author gave the node', () => {
    const steps = describedSteps(FIXTURES.subworkflowNested)
    expect(stepNodeLabel(steps['8']!)).toBe(steps['8']!.label)
    expect(steps['8']!.label).not.toBeNull()
  })
})

describe('toolDisplayName', () => {
  it('reads the name out of a toolshed guid, and leaves a built-in id alone', () => {
    expect(toolDisplayName('toolshed.g2.bx.psu.edu/repos/iuc/megahit/megahit/1.2.9+galaxy2')).toBe('megahit')
    expect(toolDisplayName('__BUILD_LIST__')).toBe('__BUILD_LIST__')
    expect(toolDisplayName('Cut1')).toBe('Cut1')
  })
})

describe('stepsAtPath', () => {
  const steps = describedSteps(FIXTURES.subworkflowNested)

  it('answers the workflow itself for an empty path', () => {
    expect(stepsAtPath(steps, [])).toBe(steps)
  })

  it('answers a subworkflow\'s own steps, which draw as their own graph', () => {
    const nested = stepsAtPath(steps, ['8'])
    expect(Object.keys(nested ?? {})).toHaveLength(9)
    // And they are describable steps like any others, so one canvas draws
    // both levels: this is what "links out to that subworkflow's graph" is.
    const { nodes, edges } = workflowGraph(nested!)
    expect(nodes).toHaveLength(9)
    expect(edges.length).toBeGreaterThan(0)
  })

  it('walks two levels down, into a subworkflow inside a subworkflow', () => {
    expect(Object.keys(stepsAtPath(steps, ['8', '8']) ?? {})).toHaveLength(12)
  })

  it('answers nothing for a path naming a step that embeds no workflow', () => {
    // Reachable when the description is refetched and the revision it
    // describes no longer has the step a reader had drilled into.
    expect(stepsAtPath(steps, ['9'])).toBeUndefined()
    expect(stepsAtPath(steps, ['nonesuch'])).toBeUndefined()
  })
})

describe('subworkflowTrail', () => {
  const steps = describedSteps(FIXTURES.subworkflowNested)

  it('is empty at the workflow itself', () => {
    expect(subworkflowTrail(steps, [])).toEqual([])
  })

  it('names each level walked into, with the path back to it', () => {
    const trail = subworkflowTrail(steps, ['8', '8'])
    expect(trail.map(crumb => crumb.stepId)).toEqual(['8', '8'])
    expect(trail.map(crumb => crumb.path)).toEqual([['8'], ['8', '8']])
    expect(trail.map(crumb => crumb.label)).toEqual([steps['8']!.label, stepNodeLabel(steps['8']!.subworkflow!.steps['8']!)])
  })

  it('stops where the path stops resolving, at the deepest level still drawable', () => {
    expect(subworkflowTrail(steps, ['8', 'nonesuch', '8']).map(crumb => crumb.stepId)).toEqual(['8'])
  })
})
