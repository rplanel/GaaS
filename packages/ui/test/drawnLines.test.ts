/**
 * The counter `workflowGraph.test.ts` holds every recorded level's drawing
 * to (#134), on lines small enough to see the answer in.
 *
 * Each case is one way a counter can be wrong. The ceilings it pins can only
 * be trusted as far as these: a counter that counts a shared anchor, or
 * misses a crossing that lands on a sampled point, moves every number at
 * once, and every number then still looks plausible.
 */

import type { Line, Point, StepBox } from './drawnLines'
import { getBezierPath } from '@vue-flow/core'
import { describe, expect, it } from 'vitest'
import { workflowGraph } from '../app/utils/workflowGraph'
import { FIXTURES } from './characterisation/fixtures'
import { aStep, describedSteps } from './describedSteps'
import { crossings, drawnLine, entersStep } from './drawnLines'

function line(...points: [number, number][]): Line {
  return points.map(([x, y]) => ({ x, y }))
}

/** How often two lines cross, asked both ways round: a crossing is one of a pair, not of either line. */
function crossingsEitherWay(a: Line, b: Line): number {
  const count = crossings(a, b)
  expect(crossings(b, a), 'the same asked the other way round').toBe(count)
  return count
}

describe('crossings', () => {
  it('counts two lines crossing', () => {
    expect(crossingsEitherWay(line([0, 0], [10, 10]), line([0, 10], [10, 0]))).toBe(1)
  })

  it('counts a crossing that lands on a sampled point', () => {
    // Two mirrored connections are sampled at the same steps along their
    // curves, so the point they cross at can be a sampled point of both, or
    // of one. No two pieces cut through each other there — an end of one
    // touches the other, at its end or in its middle — and a counter that
    // only asks whether pieces cut through each other misses it.
    expect(crossingsEitherWay(line([0, 0], [5, 5], [10, 10]), line([0, 10], [5, 5], [10, 0]))).toBe(1)
    expect(crossingsEitherWay(line([0, 0], [5, 5], [10, 10]), line([0, 10], [10, 0]))).toBe(1)
  })

  it('counts every crossing of two lines that cross more than once', () => {
    expect(crossingsEitherWay(line([0, 0], [10, 10], [20, 0]), line([0, 5], [20, 5]))).toBe(2)
  })

  it('does not count two lines sharing an anchor', () => {
    // One output feeding two steps, and two outputs feeding one input: both
    // draw two connections out of, or into, one point.
    expect(crossingsEitherWay(line([0, 0], [10, 5]), line([0, 0], [10, -5]))).toBe(0)
    expect(crossingsEitherWay(line([0, 5], [10, 0]), line([0, -5], [10, 0]))).toBe(0)
  })

  it('does not count a T-junction', () => {
    expect(crossingsEitherWay(line([0, 0], [10, 0]), line([5, 0], [5, 10]))).toBe(0)
    // Ending on a point the other line is sampled at, too.
    expect(crossingsEitherWay(line([0, 0], [5, 0], [10, 0]), line([5, 0], [5, 10]))).toBe(0)
  })

  it('does not count a line stopping short of another', () => {
    // It would cross if it ran on, which a counter asking only whether each
    // piece's ends lie either side of the other's line counts.
    expect(crossingsEitherWay(line([0, 0], [10, 10]), line([12, 0], [20, -8]))).toBe(0)
  })

  it('does not count two parallel lines', () => {
    expect(crossingsEitherWay(line([0, 0], [10, 10]), line([2, 0], [12, 10]))).toBe(0)
  })

  it('does not count two lines that touch without crossing', () => {
    expect(crossingsEitherWay(line([0, 0], [5, 5], [10, 0]), line([0, 5], [10, 5]))).toBe(0)
    expect(crossingsEitherWay(line([0, 0], [5, 5], [10, 0]), line([0, 5], [5, 5], [10, 5]))).toBe(0)
  })
})

describe('entersStep', () => {
  const step: StepBox = { position: { x: 10, y: 10 }, width: 20, height: 10 }

  it('sees a line through a step', () => {
    expect(entersStep(line([0, 15], [40, 15]), step)).toBe(true)
    // Across one corner only, with no sampled point inside.
    expect(entersStep(line([5, 17], [15, 7]), step)).toBe(true)
  })

  it('does not see a line passing just beside a step', () => {
    expect(entersStep(line([0, 9.5], [40, 9.5]), step)).toBe(false)
    // Along its side, and through its corner: touching, not entering.
    expect(entersStep(line([0, 20], [40, 20]), step)).toBe(false)
    expect(entersStep(line([0, 20], [20, 0]), step)).toBe(false)
  })
})

describe('drawnLine', () => {
  it('runs from half a handle outside the source\'s side to half a handle outside the target\'s', () => {
    // Vue Flow measures a handle and anchors an edge at its outer edge, and
    // the canvas's 6 px handles straddle the step's side: the line starts
    // 3 px out of the source and ends 3 px short of the target.
    const outputs = [{ name: 'out', type: 'txt' }]
    const steps = {
      0: aStep(0, { outputs }),
      1: aStep(1, { input_connections: { in: { id: 0, output_name: 'out' } } }),
    }
    for (const direction of ['LR', 'TB'] as const) {
      const graph = workflowGraph(steps, direction)
      const [source, target] = graph.nodes
      const drawn = drawnLine(graph.edges[0]!, graph.nodes, direction)

      expect(drawn[0], direction).toEqual(direction === 'LR'
        ? { x: source!.position.x + 263, y: source!.position.y + 48 }
        : { x: source!.position.x + 130, y: source!.position.y + 99 })
      expect(drawn.at(-1), direction).toEqual(direction === 'LR'
        ? { x: target!.position.x - 3, y: target!.position.y + 48 }
        : { x: target!.position.x + 130, y: target!.position.y - 3 })
    }
  })

  it('follows Vue Flow\'s bezier, which leaves and arrives along the direction', () => {
    // A connection between anchors at different heights, so the curve
    // bends: it leaves its source and reaches its target running along the
    // direction the graph is laid out in, where a straight line between the
    // two anchors would run at a slant all the way.
    const steps = {
      0: aStep(0, { outputs: [{ name: 'a', type: 'txt' }, { name: 'b', type: 'txt' }, { name: 'c', type: 'txt' }] }),
      1: aStep(1, { input_connections: { in: { id: 0, output_name: 'a' } } }),
    }
    for (const direction of ['LR', 'TB'] as const) {
      const graph = workflowGraph(steps, direction)
      const drawn = drawnLine(graph.edges[0]!, graph.nodes, direction)
      const [, labelX, labelY] = getBezierPath({
        sourceX: drawn[0]!.x,
        sourceY: drawn[0]!.y,
        sourcePosition: graph.nodes[0]!.sourcePosition,
        targetX: drawn.at(-1)!.x,
        targetY: drawn.at(-1)!.y,
        targetPosition: graph.nodes[1]!.targetPosition,
      })
      const middle = drawn[(drawn.length - 1) / 2]!

      expect(middle.x, direction).toBeCloseTo(labelX, 6)
      expect(middle.y, direction).toBeCloseTo(labelY, 6)
      const across = (from: Point, to: Point): number => direction === 'LR'
        ? Math.abs((to.y - from.y) / (to.x - from.x))
        : Math.abs((to.x - from.x) / (to.y - from.y))
      expect(across(drawn[0]!, drawn.at(-1)!), direction).toBeGreaterThan(0.2)
      expect(across(drawn[0]!, drawn[1]!), direction).toBeLessThan(0.05)
      expect(across(drawn.at(-2)!, drawn.at(-1)!), direction).toBeLessThan(0.05)
    }
  })

  it('follows a routed connection through every point of its route, as the canvas draws it (#136)', () => {
    // The count measures the line `connectionPath` draws, so a routed
    // connection is measured round the steps it is routed round.
    for (const direction of ['LR', 'TB'] as const) {
      const graph = workflowGraph(describedSteps(FIXTURES.ccqtlToday), direction)
      const routed = graph.edges.find(edge => edge.data.route !== null)!
      const drawn = drawnLine(routed, graph.nodes, direction)
      const straight = drawnLine({ ...routed, data: { ...routed.data, route: null } }, graph.nodes, direction)

      expect([drawn[0], drawn.at(-1)], direction).toEqual([straight[0], straight.at(-1)])
      for (const point of routed.data.route!.through) {
        expect(drawn, direction).toContainEqual(point)
      }
      // Each point once: where two pieces meet, the second starts where the
      // first ended, and a point read twice is a piece of no length, which
      // has no side for a crossing to be read off.
      expect(new Set(drawn.map(({ x, y }) => `${x},${y}`)).size, direction).toBe(drawn.length)

      // And with its source dragged off where it was routed, the bezier
      // between its anchors, wherever the step was put.
      const moved = graph.nodes.map(node => (node.id === routed.source ? { ...node, position: { x: node.position.x, y: node.position.y + 40 } } : node))
      const live = drawnLine(routed, moved, direction)
      expect(live, direction).toHaveLength(straight.length)
      expect(live[0], direction).toEqual({ x: straight[0]!.x, y: straight[0]!.y + 40 })
    }
  })
})
