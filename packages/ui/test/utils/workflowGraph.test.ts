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

import type { EdgeLabel } from '@dagrejs/dagre'
import type { JobState } from 'blendtype'
import type { DescribedStep } from 'nuxt-galaxy'
import type { ConnectionRoute, GraphDirection } from '../../app/utils/workflowGraph'
import { Graph, layout } from '@dagrejs/dagre'
import { getBezierPath, Position } from '@vue-flow/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stepMarks } from '../../app/utils/stepMarks'
import { toolDisplayName } from '../../app/utils/toolName'
import {
  anchorAlong,
  animatedEdges,
  connectionPath,
  dagreGraph,
  handleSides,
  stepNodeLabel,
  stepsAtPath,
  subworkflowTrail,
  workflowGraph,
} from '../../app/utils/workflowGraph'
import { FIXTURES } from '../characterisation/fixtures'
import { aStep, describedSteps } from '../describedSteps'
import { crossings, drawnLine, entersStep } from '../drawnLines'

/**
 * Dagre's own layout, watched (#136): which graph a level was laid out from,
 * and a way to make it fail as dagre 3.1 does.
 *
 * Every call goes through to dagre unless a test says otherwise, so every
 * other test here is laid out exactly as the canvas is.
 */
vi.mock('@dagrejs/dagre', async (importOriginal) => {
  const dagre = await importOriginal<typeof import('@dagrejs/dagre')>()
  return { ...dagre, layout: vi.fn(dagre.layout) }
})

/**
 * Every level a reader can open in one recording — the workflow, then each
 * subworkflow inside it at any depth — since each is laid out as a graph of
 * its own.
 */
function levelsOf(steps: Record<string, DescribedStep>, path: readonly string[] = []): { path: string, steps: Record<string, DescribedStep> }[] {
  return [
    { path: path.join('/'), steps },
    ...Object.entries(steps).flatMap(([stepId, step]) =>
      step.subworkflow === null ? [] : levelsOf(step.subworkflow.steps, [...path, stepId]),
    ),
  ]
}

/** Every level of every recording, named `<slug>` or `<slug>/<step>/…`. */
const RECORDED_LEVELS = Object.values(FIXTURES).flatMap(slug =>
  levelsOf(describedSteps(slug)).map(level => ({
    name: level.path === '' ? slug : `${slug}/${level.path}`,
    steps: level.steps,
  })),
)

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
      edges.filter(edge => edge.target === target && edge.data.inputName === 'batchmode|input_fastas')

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

    expect(edges.map(edge => edge.data.inputName)).toEqual(['input1'])
    expect(dangling).toEqual(['7 → 1.other'])
  })

  it('hands every connection to the canvas\'s own edge with its input name, and Vue Flow no label', () => {
    // #135. Vue Flow draws an edge's `label` all the time, so it is given
    // none, and the name travels as data for the canvas's own edge.
    const edges = RECORDED_LEVELS.flatMap(({ steps }) => workflowGraph(steps).edges)

    expect(edges.length).toBeGreaterThan(0)
    for (const edge of edges) {
      expect(edge.type).toBe('connection')
      expect(edge.data.inputName).toBe(edge.targetHandle)
      expect(edge).not.toHaveProperty('label')
    }
    expect(edges.map(edge => edge.data.inputName)).toContain('results_0|software_cond|output_0|type|input')
  })

  it('anchors each edge at the output it leaves and the input it arrives at', () => {
    // One anchor per node is not enough: two edges from one step into one
    // input of another leave and arrive at the same point, so they draw as a
    // single line with both labels stacked on it.
    const { edges, nodes } = workflowGraph(describedSteps(FIXTURES.fanIn))

    const intoOneInput = edges.filter(edge => edge.target === '19' && edge.data.inputName === 'batchmode|input_fastas')
    expect(intoOneInput.map(edge => edge.sourceHandle).sort()).toEqual(['proviruses', 'viruses'])
    expect(intoOneInput.map(edge => edge.targetHandle)).toEqual(['batchmode|input_fastas', 'batchmode|input_fastas'])

    // And step 14 carries an anchor for each of them.
    const source = nodes.find(node => node.id === '14')!
    expect(source.data.sourceHandles).toContain('proviruses')
    expect(source.data.sourceHandles).toContain('viruses')
  })

  it('anchors an output of a subworkflow step, which declares none', () => {
    // Galaxy writes `outputs: []` on a subworkflow step whatever the workflow
    // inside it produces, naming the real ones in `workflow_outputs`. Read
    // only from the declared list, a subworkflow feeding a downstream step
    // would have no anchor for the edge to leave from — and the recording has
    // exactly that: step 8 declares nothing, and step 10 reads from it.
    const steps = describedSteps(FIXTURES.subworkflowNested)
    expect(steps['8']!.outputs).toEqual([])

    const { nodes, edges } = workflowGraph(steps)
    const read = edges.find(edge => edge.source === '8')!
    expect(read.sourceHandle).toBe('Seurat input for gene expression (filtered)')
    expect(nodes.find(node => node.id === '8')!.data.sourceHandles).toContain(read.sourceHandle)
  })

  it('gives an input nothing feeds no anchor, and an unread output none either', () => {
    const { nodes } = workflowGraph({
      0: aStep(0, { type: 'data_input', tool_id: null, tool_version: null, outputs: [{ name: 'output', type: 'input' }] }),
      1: aStep(1, {
        input_connections: { fed: { id: 0, output_name: 'output' } },
        outputs: [{ name: 'produced', type: 'txt' }],
      }),
    })

    const fed = nodes.find(node => node.id === '1')!
    // Only the input something feeds: there is no edge to meet an anchor for
    // the others, and #97's mark is how a reader hears about one that should
    // have had an edge.
    expect(fed.data.targetHandles).toEqual(['fed'])
    // A declared output keeps its anchor whether or not anything reads it,
    // so the day an output handle is shown it is already there.
    expect(fed.data.sourceHandles).toEqual(['produced'])
    expect(nodes.find(node => node.id === '0')!.data.targetHandles).toEqual([])
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
    // The handles are placed from the same function, not a second ternary —
    // and so is which of a step's dimensions they are spread along, which is
    // what a step's height is sized for (#122): down the side left to right,
    // across it top to bottom.
    expect(handleSides('LR')).toEqual({ source: lr!.sourcePosition, target: lr!.targetPosition, along: 'height' })
    expect(handleSides('TB')).toEqual({ source: tb!.sourcePosition, target: tb!.targetPosition, along: 'width' })
  })

  it('sizes a step by its anchors left to right, never below the 96 px a step always had', () => {
    // #122. On ccqtl-today step 2 has ten outputs, step 5 seven inputs and
    // steps 4 and 6 four of each: 20 px between two anchors, and one gap more
    // than there are anchors. The other steps fit in 96 px, as every step
    // used to.
    const steps = describedSteps(FIXTURES.ccqtlToday)
    const sizes = (direction: GraphDirection) =>
      Object.fromEntries(workflowGraph(steps, direction).nodes.map(node => [node.id, [node.width, node.height]]))

    expect(sizes('LR')).toEqual({
      0: [260, 96],
      1: [260, 96],
      2: [260, 220],
      3: [260, 96],
      4: [260, 100],
      5: [260, 160],
      6: [260, 100],
    })
    // Top to bottom the anchors run along the width instead, and the width
    // is fixed — a rank of equal-width steps is what makes it readable — so
    // there is nothing for a taller step to spread.
    expect(Object.values(sizes('TB'))).toEqual(Array.from({ length: 7 }, () => [260, 96]))
  })

  it.each(RECORDED_LEVELS)('keeps the anchors on every step of $name at least 20 px apart, in either direction', ({ steps }) => {
    // #122, over every recording rather than the one step that showed it.
    // fan-in's step 6 put eight outputs 10.7 px apart and ccqtl-today's
    // step 2 ten 8.7 px apart, on handles 6 px across: no gap a reader can
    // tell one edge from the next by.
    const crowded: string[] = []
    for (const direction of ['LR', 'TB'] as const) {
      for (const node of workflowGraph(steps, direction).nodes) {
        // Down the side left to right, across it top to bottom.
        const side = node[handleSides(direction).along]
        for (const anchors of [node.data.sourceHandles, node.data.targetHandles]) {
          const offsets = anchors.map((_, index) => anchorAlong(index, anchors.length) * side)
          // To a hundredth of a pixel, which floating point does not hold.
          const gaps = offsets.slice(1).map((offset, index) => Math.round((offset - offsets[index]!) * 100) / 100)
          crowded.push(...gaps.filter(gap => gap < 20).map(gap => `${direction} step ${node.id}: ${gap} px`))
        }
      }
    }
    expect(crowded).toEqual([])
  })

  it.each(RECORDED_LEVELS)('lays no step of $name over another, at the size each is drawn', ({ steps }) => {
    // #122. Vue Flow draws each step at its node's own size, so dagre has to
    // lay it out at that size too: a step taller than dagre was told
    // overlaps its neighbour in the rank rather than pushing it away.
    const overlapping: string[] = []
    for (const direction of ['LR', 'TB'] as const) {
      const { nodes } = workflowGraph(steps, direction)
      nodes.forEach((a, index) => {
        for (const b of nodes.slice(index + 1)) {
          const apart = a.position.x + a.width <= b.position.x || b.position.x + b.width <= a.position.x
            || a.position.y + a.height <= b.position.y || b.position.y + b.height <= a.position.y
          if (!apart) {
            overlapping.push(`${direction} steps ${a.id} and ${b.id}`)
          }
        }
      })
    }
    expect(overlapping).toEqual([])
  })

  it('positions a node by its top-left corner, as Vue Flow reads it', () => {
    // Dagre answers with centres. Handed over unconverted every node sits
    // half its own size up and to the left of where its edges arrive.
    // One node, so dagre puts its centre at the margin plus half the box —
    // half of *its own* box, which a step with ten outputs makes 220 px tall
    // rather than the 96 px of one with none (#122).
    const outputs = Array.from({ length: 10 }, (_, index) => ({ name: `out${index}`, type: 'txt' }))
    const [short] = workflowGraph({ 0: aStep(0) }).nodes
    const [tall] = workflowGraph({ 0: aStep(0, { outputs }) }).nodes

    expect([short!.height, tall!.height]).toEqual([96, 220])
    expect(short!.position).toEqual({ x: 16, y: 16 })
    expect(tall!.position).toEqual({ x: 16, y: 16 })
  })

  it('lays ccqtl-today out from all twenty of its connections', () => {
    // #121. Laid out from the ten pairs of steps those twenty connections
    // join, every one of these seven steps sat somewhere else, in a graph
    // 283 px tall instead of 427: the layout of a different graph. (Both at
    // #122's heights, which moved six of the seven from where #121 pinned
    // them. #136's order by anchor then put step 1 above step 0, and moved
    // every step up or down its rank.)
    const { nodes } = workflowGraph(describedSteps(FIXTURES.ccqtlToday))

    expect(Object.fromEntries(nodes.map(node => [node.id, node.position]))).toEqual({
      0: { x: 16, y: 144 },
      1: { x: 16, y: 16 },
      2: { x: 366, y: 18 },
      3: { x: 716, y: 209 },
      4: { x: 1066, y: 132 },
      5: { x: 1416, y: 92 },
      6: { x: 1766, y: 69 },
    })
  })

  it.each(['LR', 'TB'] as const)('routes a connection spanning more than one rank round the steps between, and no other, %s', (direction) => {
    // #136. Between adjacent ranks nothing can stand in the way, so the
    // bezier between the anchors is drawn; a longer connection follows the
    // route dagre laid out for it.
    const { nodes, edges } = workflowGraph(describedSteps(FIXTURES.ccqtlToday), direction)
    const along = direction === 'LR' ? 'x' : 'y'
    const size = direction === 'LR' ? 'width' : 'height'
    const at = (id: string) => nodes.find(node => node.id === id)!
    // A rank is a column left to right and a row top to bottom, and every
    // step of one starts at the same place along the way the ranks run.
    const starts = [...new Set(nodes.map(node => node.position[along]))].sort((a, b) => a - b)
    const span = (source: string, target: string) => starts.indexOf(at(target).position[along]) - starts.indexOf(at(source).position[along])

    const routed = edges.filter(edge => edge.data.route !== null)
    expect(routed.length, 'some connection of ccqtl-today spans several ranks').toBeGreaterThan(0)
    expect(routed.map(edge => edge.id)).toEqual(edges.filter(edge => span(edge.source, edge.target) > 1).map(edge => edge.id))

    for (const { id, source, target, data: { route } } of routed) {
      // Laid out where the two steps stand, so a step still there follows it.
      expect(route!.sourceAt, id).toEqual(at(source).position)
      expect(route!.targetAt, id).toEqual(at(target).position)
      // One point on each rank it crosses and one between each two, all
      // between the two steps it joins.
      expect(route!.through, id).toHaveLength(2 * span(source, target) - 1)
      const from = at(source).position[along] + at(source)[size]
      const to = at(target).position[along]
      for (const point of route!.through) {
        expect(from < point[along] && point[along] < to, `${id} at ${point[along]}, between ${from} and ${to}`).toBe(true)
      }
    }
  })

  it.each(RECORDED_LEVELS)('places every step of $name, in either direction', ({ steps }) => {
    // Handed one edge per connection, dagre 3.1's own order can lose the
    // second of three parallel edges and throw, on a shape as plain as
    // conditional-repeat-runtime's: step 1 feeds step 2 three times and step
    // 3 twice, and both feed step 4. The order by anchor stops it (#136), and
    // whichever layout runs, every step is placed.
    for (const direction of ['LR', 'TB'] as const) {
      const { nodes } = workflowGraph(steps, direction)

      expect(nodes.map(node => node.id)).toEqual(Object.keys(steps))
      const unplaced = nodes.filter(({ position }) => !Number.isFinite(position.x) || !Number.isFinite(position.y))
      expect(unplaced.map(node => node.id), direction).toEqual([])
    }
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

/**
 * What the canvas draws of one level in one direction (#134): how many times
 * two of its connections cross, and which connections run through a step
 * that is neither end of them, with the steps each one runs through.
 */
function drawing(steps: Record<string, DescribedStep>, direction: GraphDirection): { crossings: number, runThrough: Map<string, string[]> } {
  const { nodes, edges } = workflowGraph(steps, direction)
  const lines = edges.map(edge => ({ edge, line: drawnLine(edge, nodes, direction) }))
  const crossed = lines.reduce((sum, { line }, index) =>
    sum + lines.slice(index + 1).reduce((pairs, other) => pairs + crossings(line, other.line), 0), 0)
  const runThrough = new Map(lines.flatMap(({ edge, line }) => {
    const entered = nodes
      .filter(node => node.id !== edge.source && node.id !== edge.target && entersStep(line, node))
      .map(node => node.id)
    return entered.length === 0 ? [] : [[edge.id, entered] as const]
  }))
  return { crossings: crossed, runThrough }
}

/**
 * The most each recorded level may draw, per direction (#134): ceilings for
 * every layout change and every dagre bump (#133), which may lower them and
 * never raise them.
 *
 * Measured at dagre 3.1.1 on #136's layout, ranks ordered by anchor and
 * longer connections drawn through their routes: 62 crossings, and no
 * connection through a step. The canvas before it drew 156 crossings and
 * ran 13 connections through a step, 19 connection–step pairs in all; no
 * level rose. #123's design spike counted the same 62, anchoring each line
 * on the step's side where Vue Flow anchors it 3 px further out, at the
 * handle's outer edge. The 3 px had added two crossings to the old layout,
 * on a pair of connections that ran within 0.02 px of each other; on this
 * one it adds none.
 */
const DRAWN_AT_MOST: Record<string, Record<GraphDirection, { crossings: number, throughAStep: number }>> = {
  'ccqtl-today': { LR: { crossings: 17, throughAStep: 0 }, TB: { crossings: 17, throughAStep: 0 } },
  'conditional-repeat-runtime': { LR: { crossings: 3, throughAStep: 0 }, TB: { crossings: 3, throughAStep: 0 } },
  'fan-in': { LR: { crossings: 0, throughAStep: 0 }, TB: { crossings: 0, throughAStep: 0 } },
  'subworkflow-nested': { LR: { crossings: 6, throughAStep: 0 }, TB: { crossings: 6, throughAStep: 0 } },
  'subworkflow-nested/8': { LR: { crossings: 3, throughAStep: 0 }, TB: { crossings: 3, throughAStep: 0 } },
  'subworkflow-nested/8/8': { LR: { crossings: 1, throughAStep: 0 }, TB: { crossings: 1, throughAStep: 0 } },
  'subworkflow-nested/12': { LR: { crossings: 1, throughAStep: 0 }, TB: { crossings: 1, throughAStep: 0 } },
}

describe('workflowGraph, as the canvas draws it', () => {
  it.each(RECORDED_LEVELS)('crosses no more connections of $name, and runs no more through a step, than pinned', ({ name, steps }) => {
    const drawn = { LR: drawing(steps, 'LR'), TB: drawing(steps, 'TB') }
    const pinned = DRAWN_AT_MOST[name]
    // A new recording is measured the moment it is committed, and stays red
    // here until what it draws is pinned.
    expect(pinned, `${name} is not pinned: it draws ${(['LR', 'TB'] as const).map(direction =>
      `${direction} ${drawn[direction].crossings} crossings and ${drawn[direction].runThrough.size} connections through a step`).join(', ')}`).toBeDefined()

    const over = (['LR', 'TB'] as const).flatMap((direction) => {
      const now = drawn[direction]
      const most = pinned![direction]
      const through = [...now.runThrough].map(([edge, entered]) => `${edge} through step ${entered.join(', ')}`)
      return [
        ...(now.crossings > most.crossings ? [`${direction}: ${now.crossings} crossings, pinned at ${most.crossings}`] : []),
        ...(now.runThrough.size > most.throughAStep ? [`${direction}: ${through.join('; ')}, pinned at ${most.throughAStep}`] : []),
      ]
    })
    expect(over).toEqual([])
  })

  it('pins no ceiling on a level that is no longer recorded', () => {
    // A ceiling for a level that has gone holds nothing to anything.
    expect(Object.keys(DRAWN_AT_MOST).filter(name => !RECORDED_LEVELS.some(level => level.name === name))).toEqual([])
  })
})

describe('workflowGraph, as dagre lays it out', () => {
  const dagreLayout = vi.mocked(layout)

  beforeEach(() => {
    dagreLayout.mockClear()
  })

  /** Whether each layout dagre was asked for was of one edge per connection, in the order asked. */
  const keyings = () => dagreLayout.mock.calls.map(([graph]) => (graph.isMultigraph() ? 'per connection' : 'per pair'))

  it.each(RECORDED_LEVELS)('lays $name out from one edge per connection in either direction, never per pair', ({ steps }) => {
    // #136. Dagre 3.1.1 throws on three parallel connections, and
    // conditional-repeat-runtime has them: step 1 feeds step 2 three times.
    // An order that numbers each rank afresh stops it.
    for (const direction of ['LR', 'TB'] as const) {
      dagreLayout.mockClear()
      workflowGraph(steps, direction)
      expect(keyings(), direction).toEqual(['per connection'])
    }
  })

  it.each(['LR', 'TB'] as const)('lays out per connection the four steps dagre\'s own order throws on, %s', (direction) => {
    // The smallest shape that sets dagre 3.1.1 off: one step feeding another
    // three times and a third once, both feeding a fourth. Numbering each
    // rank afresh is what stops it, whether or not a sweep then finds an
    // ordering crossing less. A dagre that stops throwing here fails the
    // first assertion, which is the day #133 can remove the fallback.
    const steps = {
      0: aStep(0, { type: 'data_input', tool_id: null, tool_version: null }),
      1: aStep(1, {
        input_connections: {
          a: { id: 0, output_name: 'output' },
          b: { id: 0, output_name: 'output' },
          c: { id: 0, output_name: 'output' },
        },
      }),
      2: aStep(2, { input_connections: { in: { id: 0, output_name: 'output' } } }),
      3: aStep(3, { input_connections: { x: { id: 1, output_name: 'out_file1' }, y: { id: 2, output_name: 'out_file1' } } }),
    }
    const { nodes, edges } = workflowGraph(steps, direction)
    expect(() => layout(dagreGraph(nodes, edges, direction)), 'dagre\'s own order').toThrow('Not possible to find intersection inside of the rectangle')

    dagreLayout.mockClear()
    workflowGraph(steps, direction)
    expect(keyings()).toEqual(['per connection'])
  })

  it('hands dagre every rank numbered 0 to n − 1, whatever dagre\'s own order left', () => {
    // What stops the throw is the numbering, not the sweeps: dagre 3.1.1 can
    // leave two nodes of one rank on the same place, and an ordering no
    // sweep improves on is kept as it came. Here dagre's order leaves every
    // node on place 0, which counts no crossing at all.
    workflowGraph(describedSteps(FIXTURES.conditionalRepeatRuntime))
    const customOrder = dagreLayout.mock.calls[0]![1]!.customOrder!
    const graph = new Graph({ multigraph: true })
    for (const [id, rank] of [['0', 0], ['1', 2], ['2', 2], ['3', 2], ['4', 4]] as const) {
      graph.setNode(id, { width: 260, height: 96, rank })
    }
    for (const [v, w] of [['0', '1'], ['0', '2'], ['0', '3'], ['1', '4'], ['3', '4']] as const) {
      graph.setEdge(v, w, { weight: 1 }, `${v}->${w}`)
    }

    customOrder(graph, (laid) => {
      for (const v of laid.nodes()) {
        laid.node(v).order = 0
      }
    })

    expect(['1', '2', '3'].map(v => graph.node(v).order).sort()).toEqual([0, 1, 2])
    expect([graph.node('0').order, graph.node('4').order]).toEqual([0, 0])
  })

  it('falls back to one edge per pair where dagre cannot lay a level out per connection, and draws every connection of it live', () => {
    // #121's safety net, kept (#136): a pair's connections share one route,
    // and drawn through it they would all pinch through its points.
    const steps = describedSteps(FIXTURES.ccqtlToday)
    expect(workflowGraph(steps).edges.some(edge => edge.data.route !== null), 'routed, laid out per connection').toBe(true)

    dagreLayout.mockClear()
    dagreLayout.mockImplementationOnce(() => {
      throw new Error('Not possible to find intersection inside of the rectangle')
    })
    const { nodes, edges } = workflowGraph(steps)

    expect(keyings()).toEqual(['per connection', 'per pair'])
    // Ordered by anchor both times.
    expect(dagreLayout.mock.calls.map(([, options]) => typeof options?.customOrder)).toEqual(['function', 'function'])
    expect(edges.filter(edge => edge.data.route !== null).map(edge => edge.id)).toEqual([])
    expect(nodes.filter(({ position }) => !Number.isFinite(position.x) || !Number.isFinite(position.y))).toEqual([])
  })

  it('draws a connection whose route is not finite live, and keeps the layout of the others', async () => {
    // Dagre can place every step and still put a `NaN` inside a route (see
    // `tryLayOut`). That connection draws the bezier between its anchors
    // rather than a path that draws nothing, and nothing else moves.
    const { layout: dagreItself } = await vi.importActual<typeof import('@dagrejs/dagre')>('@dagrejs/dagre')
    const steps = describedSteps(FIXTURES.ccqtlToday)
    const sound = workflowGraph(steps)
    const [broken, ...others] = sound.edges.filter(edge => edge.data.route !== null)

    dagreLayout.mockClear()
    dagreLayout.mockImplementationOnce((graph, options) => {
      const laidOut = dagreItself(graph, options)
      const edge = graph.edges().find(({ name }) => name === broken!.id)!
      const { points } = graph.edge(edge) as EdgeLabel
      points![2]!.x = Number.NaN
      return laidOut
    })
    const { nodes, edges } = workflowGraph(steps)

    expect(keyings()).toEqual(['per connection'])
    expect(edges.find(edge => edge.id === broken!.id)!.data.route).toBeNull()
    expect(edges.filter(edge => edge.data.route !== null)).toEqual(others)
    expect(nodes).toEqual(sound.nodes)
  })
})

describe('connectionPath', () => {
  // #136. The one function the canvas's own edge draws a connection with,
  // and the one #134's count measures.

  /** Two anchors left to right, as Vue Flow measures them, on steps at rest where they were laid out. */
  const ends = {
    sourceX: 100,
    sourceY: 40,
    sourcePosition: Position.Right,
    targetX: 500,
    targetY: 160,
    targetPosition: Position.Left,
  }
  const sourceAt = { x: -163, y: 0 }
  const targetAt = { x: 503, y: 112 }
  const route: ConnectionRoute = {
    through: [{ x: 200, y: 60 }, { x: 300, y: 90 }, { x: 400, y: 120 }],
    sourceAt,
    targetAt,
  }

  /** The pieces of a path, one cubic each, as the four points that draw it. */
  function piecesOf(path: string): string[] {
    const [start, ...cubics] = path.split(' C')
    return cubics.reduce<{ from: string, pieces: string[] }>(({ from, pieces }, cubic) => {
      const to = cubic.trim().split(' ').at(-1)!
      return { from: to, pieces: [...pieces, `${from} C${cubic.trim()}`] }
    }, { from: start!.replace(/^M/, ''), pieces: [] }).pieces
  }

  /** Vue Flow's own bezier between two points, left to right, as the same four points. */
  function bezier(from: { x: number, y: number }, to: { x: number, y: number }): string {
    const [path] = getBezierPath({ sourceX: from.x, sourceY: from.y, sourcePosition: Position.Right, targetX: to.x, targetY: to.y, targetPosition: Position.Left })
    return path.replace(/^M/, '')
  }

  it('draws a connection with no route as Vue Flow\'s bezier between its anchors', () => {
    const drawn = connectionPath({ ...ends, route: null, sourceStepAt: sourceAt, targetStepAt: targetAt })

    expect(drawn).toEqual(getBezierPath(ends).slice(0, 3))
  })

  it('draws a routed connection as Vue Flow\'s bezier from each point of its route to the next, anchor to anchor', () => {
    const [path] = connectionPath({ ...ends, route, sourceStepAt: sourceAt, targetStepAt: targetAt })

    const points = [{ x: ends.sourceX, y: ends.sourceY }, ...route.through, { x: ends.targetX, y: ends.targetY }]
    expect(piecesOf(path)).toEqual(points.slice(1).map((to, index) => bezier(points[index]!, to)))
    // One line, not four: a path restarted at each point would restart a
    // flowing connection's dashes there too.
    expect(path.match(/M/g)).toHaveLength(1)
  })

  it('draws each piece of a route along the way the ranks run, top to bottom too', () => {
    const down = {
      sourceX: 40,
      sourceY: 100,
      sourcePosition: Position.Bottom,
      targetX: 160,
      targetY: 500,
      targetPosition: Position.Top,
    }
    const through = [{ x: 60, y: 300 }]
    const [path] = connectionPath({ ...down, route: { through, sourceAt, targetAt }, sourceStepAt: sourceAt, targetStepAt: targetAt })

    const [first] = getBezierPath({ ...down, targetX: 60, targetY: 300 })
    const [second] = getBezierPath({ ...down, sourceX: 60, sourceY: 300 })
    expect(piecesOf(path)).toEqual([first, second].map(piece => piece.replace(/^M/, '')))
  })

  it('names a routed connection halfway along its route', () => {
    // An even number of pieces meets at a point of the route, which is
    // where every route dagre draws is halved: between its ends it puts one
    // point per rank and one between each two.
    const evenly: ConnectionRoute = { ...route, through: [{ x: 200, y: 60 }, { x: 300, y: 90 }, { x: 400, y: 150 }] }
    const [, x, y] = connectionPath({ ...ends, route: evenly, sourceStepAt: sourceAt, targetStepAt: targetAt })
    expect([x, y]).toEqual([300, 90])

    // An odd number is halved inside its middle piece, where Vue Flow names
    // that piece.
    const oddly: ConnectionRoute = { ...route, through: [{ x: 200, y: 60 }, { x: 400, y: 150 }] }
    const [, oddX, oddY] = connectionPath({ ...ends, route: oddly, sourceStepAt: sourceAt, targetStepAt: targetAt })
    const [, middleX, middleY] = getBezierPath({ ...ends, sourceX: 200, sourceY: 60, targetX: 400, targetY: 150 })
    expect([oddX, oddY]).toEqual([middleX, middleY])
  })

  it('draws the live bezier once a reader drags either step off where the route was laid out', () => {
    // A route runs round the steps where they stood. Dragged, a step leaves
    // its connections' routes behind, and the bezier between the anchors
    // Vue Flow measured goes where the step went.
    const live = getBezierPath(ends).slice(0, 3)
    const dragged = { x: sourceAt.x + 1, y: sourceAt.y }

    expect(connectionPath({ ...ends, route, sourceStepAt: dragged, targetStepAt: targetAt })).toEqual(live)
    expect(connectionPath({ ...ends, route, sourceStepAt: sourceAt, targetStepAt: { x: targetAt.x, y: targetAt.y - 1 } })).toEqual(live)
    // And back where it was laid out, the route is followed again.
    expect(connectionPath({ ...ends, route, sourceStepAt: { ...sourceAt }, targetStepAt: { ...targetAt } })).not.toEqual(live)
  })
})

describe('dagreGraph', () => {
  it.each(RECORDED_LEVELS)('hands dagre every connection of $name, keyed as the canvas keys it', ({ steps }) => {
    // #121. Keyed by its two steps alone, a second connection between one
    // pair of steps overwrote the first, so the canvas drew every edge at
    // positions worked out from a graph missing some of them — half, on
    // ccqtl-today.
    const { nodes, edges } = workflowGraph(steps)
    const graph = dagreGraph(nodes, edges, 'LR')

    const held = graph.edges().map(({ v, w, name }) => `${name} (${v} → ${w})`).sort()
    const drawn = edges.map(({ source, target, id }) => `${id} (${source} → ${target})`).sort()
    expect(held).toEqual(drawn)
  })

  it.each(['connection', 'pair'] as const)('makes room for no label when keyed by %s', (keying) => {
    // #135. Nothing names a connection at rest, so the layout has no label
    // to keep clear.
    const { nodes, edges } = workflowGraph(describedSteps(FIXTURES.ccqtlToday))
    const graph = dagreGraph(nodes, edges, 'LR', keying)

    for (const edge of graph.edges()) {
      expect(graph.edge(edge)).not.toHaveProperty('width')
      expect(graph.edge(edge)).not.toHaveProperty('height')
    }
  })

  it('falls back to one edge per pair of steps, weighted by the connections it stands for', () => {
    // The shape `layOut` retries a level dagre cannot place one edge per
    // connection in. Every connection still counts, as weight on its pair's
    // one edge: the same sum dagre's ranker reduces parallel edges to.
    const { nodes, edges } = workflowGraph(describedSteps(FIXTURES.conditionalRepeatRuntime))
    const graph = dagreGraph(nodes, edges, 'LR', 'pair')

    const weights = Object.fromEntries(graph.edges().map(({ v, w }) => [`${v} → ${w}`, graph.edge(v, w).weight]))
    expect(weights).toEqual({ '0 → 1': 1, '1 → 2': 3, '1 → 3': 2, '2 → 4': 1, '3 → 4': 1 })
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

describe('workflowGraph, and what a running invocation adds to it', () => {
  /** The marks a canvas is handed, derived as the panel derives them (#90). */
  function marksFor(steps: Record<string, ReturnType<typeof aStep>>, jobs: { step_id: number, state: JobState }[]) {
    return stepMarks(steps, jobs)
  }

  it('lays a level out identically however its jobs are doing', () => {
    // The whole reason a mark is not in the node data. Vue Flow re-parses a
    // changed `nodes` array and `Object.assign(existingNode, node)` writes
    // the laid-out position back over a dragged one, so a node array that
    // moved with the jobs would undo a reader's drag on every realtime
    // refetch (Q6). The layout takes no marks at all, so it cannot.
    const steps = { 0: aStep(0), 1: aStep(1) }
    const before = workflowGraph(steps, 'LR').nodes
    const after = workflowGraph(steps, 'LR').nodes

    expect(after.map(node => node.position)).toEqual(before.map(node => node.position))
    expect(after.map(node => node.data)).toEqual(before.map(node => node.data))
  })

  it('leaves every edge still when no marks are supplied', () => {
    // Invoke-mode, and the canvas before #90: one canvas, no mode (Q2'), so
    // supplying nothing has to draw exactly what #89 drew.
    const { edges } = workflowGraph(describedSteps(FIXTURES.ccqtlToday))

    expect(edges.every(edge => edge.animated === false)).toBe(true)
    expect(animatedEdges(edges, {}).every(edge => edge.animated === false)).toBe(true)
  })

  it('animates an edge while its source step is running, and no other', () => {
    // AC2. The edge animates on its *source*: an edge into a running step is
    // carrying nothing yet, and drawing it as flowing would say the opposite.
    const steps = {
      0: aStep(0, { type: 'data_input', tool_id: null, tool_version: null }),
      1: aStep(1, { input_connections: { input: { id: 0, output_name: 'output' } } }),
      2: aStep(2, { input_connections: { input: { id: 1, output_name: 'out_file1' } } }),
      // A fourth step so that step 2 has an outgoing edge of its own; an
      // edge only exists where something reads from the step.
      3: aStep(3, { input_connections: { input: { id: 2, output_name: 'out_file1' } } }),
    }
    const running = animatedEdges(workflowGraph(steps, 'LR').edges, marksFor(steps, [
      { step_id: 1, state: 'running' },
      { step_id: 2, state: 'queued' },
    ]))

    expect(running.find(edge => edge.source === '1')?.animated).toBe(true)
    // Step 0 is an input step: it runs no job, so nothing leaving it ever
    // animates, whatever is happening downstream.
    expect(running.find(edge => edge.source === '0')?.animated).toBe(false)

    // And it stops again when the step does, which a single snapshot of a
    // running invocation cannot see.
    const finished = animatedEdges(workflowGraph(steps, 'LR').edges, marksFor(steps, [
      { step_id: 1, state: 'ok' },
      { step_id: 2, state: 'running' },
    ]))
    expect(finished.find(edge => edge.source === '1')?.animated).toBe(false)
    expect(finished.find(edge => edge.source === '2')?.animated).toBe(true)
  })
})
