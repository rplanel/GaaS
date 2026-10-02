/**
 * The lines the workflow graph's canvas draws, and what they run into (#134).
 *
 * What `workflowGraph.test.ts` holds every recorded level's layout to: how
 * often two connections cross, and which connections run through a step that
 * is neither end of them. Measured on the line the canvas actually draws, not
 * on the straight line between two anchors — the bezier is what a reader
 * follows, and it bends round, or into, what the straight line would miss.
 *
 * Here and not in the app, which draws through Vue Flow and has no use for
 * any of this: the ticket keeps the app untouched, and these are measurements
 * of the app.
 */

import type { GraphDirection, WorkflowGraphEdge, WorkflowGraphNode } from '../app/utils/workflowGraph'
import { getBezierPath, Position } from '@vue-flow/core'
import { anchorAlong, handleSides } from '../app/utils/workflowGraph'

export interface Point {
  readonly x: number
  readonly y: number
}

/** A drawn line, as the points it is sampled at, from its source to its target. */
export type Line = readonly Point[]

/** Where a step is drawn, in the canvas's own coordinates. */
export type StepBox = Pick<WorkflowGraphNode, 'position' | 'width' | 'height'>

/**
 * How many straight pieces a connection's curve is measured as.
 *
 * Even, so that the curve's own midpoint — where Vue Flow puts the label —
 * is one of the sampled points.
 */
const SEGMENTS = 64

/**
 * How far outside a step's side an edge starts or ends.
 *
 * Vue Flow anchors an edge at the outer edge of the handle it measures
 * (`getHandlePosition`), and the canvas's handles are the default theme's
 * 6 px dots, centred on the side.
 */
const HALF_HANDLE = 3

/** Where on the canvas the named anchor a connection leaves or arrives at is, on one of its two steps. */
function anchorPoint(node: WorkflowGraphNode, end: 'source' | 'target', name: string, direction: GraphDirection): Point {
  const anchors = end === 'source' ? node.data.sourceHandles : node.data.targetHandles
  const index = anchors.indexOf(name)
  if (index === -1) {
    throw new Error(`step ${node.id} has no anchor ${name}`)
  }
  const along = anchorAlong(index, anchors.length)
  const { x, y } = node.position
  switch (handleSides(direction)[end]) {
    case Position.Left:
      return { x: x - HALF_HANDLE, y: y + along * node.height }
    case Position.Right:
      return { x: x + node.width + HALF_HANDLE, y: y + along * node.height }
    case Position.Top:
      return { x: x + along * node.width, y: y - HALF_HANDLE }
    case Position.Bottom:
      return { x: x + along * node.width, y: y + node.height + HALF_HANDLE }
  }
}

/**
 * The line the canvas draws for one connection today: Vue Flow's default
 * edge, a bezier between its two anchors at curvature 0.25.
 *
 * The curve is read off Vue Flow's own `getBezierPath` rather than copied
 * from it, so a Vue Flow that changes its curvature is measured as it
 * draws. Where the anchors sit, how big a handle is and that the canvas
 * draws the default edge at all are this file's reading of the canvas, not
 * Vue Flow's, and `drawnLines.test.ts` pins them.
 */
export function drawnLine(edge: WorkflowGraphEdge, nodes: readonly WorkflowGraphNode[], direction: GraphDirection): Line {
  const sides = handleSides(direction)
  const nodeOf = (id: string): WorkflowGraphNode => {
    const node = nodes.find(one => one.id === id)
    if (!node) {
      throw new Error(`connection ${edge.id} names no step ${id}`)
    }
    return node
  }
  const source = nodeOf(edge.source)
  const target = nodeOf(edge.target)
  const from = anchorPoint(source, 'source', edge.sourceHandle, direction)
  const to = anchorPoint(target, 'target', edge.targetHandle, direction)

  const [path] = getBezierPath({
    sourceX: from.x,
    sourceY: from.y,
    sourcePosition: sides.source,
    targetX: to.x,
    targetY: to.y,
    targetPosition: sides.target,
  })
  const numbers = /^M([^,\s]+),([^,\s]+) C([^,\s]+),([^,\s]+) ([^,\s]+),([^,\s]+) ([^,\s]+),([^,\s]+)$/.exec(path)?.slice(1).map(Number)
  if (numbers?.length !== 8 || numbers.some(number => !Number.isFinite(number))) {
    throw new Error(`Vue Flow drew ${edge.id} as ${path}, which is not one cubic`)
  }
  const [x0, y0, x1, y1, x2, y2, x3, y3] = numbers as [number, number, number, number, number, number, number, number]

  return Array.from({ length: SEGMENTS + 1 }, (_, index) => {
    const t = index / SEGMENTS
    const u = 1 - t
    return {
      x: u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
      y: u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
    }
  })
}

/** Which side of the line through `a` and `b` the point `c` lies on, by sign: 0 on the line. */
function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function onSegment(a: Point, b: Point, c: Point): boolean {
  return orientation(a, b, c) === 0
    && Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x)
    && Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y)
}

/** The index of the straight piece of a line that `point` lies on, ends included, or -1. */
function pieceHolding(line: Line, point: Point): number {
  return line.findIndex((start, index) => index < line.length - 1 && onSegment(start, line[index + 1]!, point))
}

/**
 * The points either side of `at` along a line, or `undefined` where the line
 * starts or ends there — which is an anchor, or a T-junction.
 */
function around(line: Line, at: Point): [Point, Point] | undefined {
  const vertex = line.findIndex(point => point.x === at.x && point.y === at.y)
  if (vertex !== -1) {
    return vertex === 0 || vertex === line.length - 1 ? undefined : [line[vertex - 1]!, line[vertex + 1]!]
  }
  const piece = pieceHolding(line, at)
  return [line[piece]!, line[piece + 1]!]
}

/**
 * Which side of a line bending at `at`, from `before` to `after`, the point
 * `toward` lies on: 1 on one, -1 on the other, 0 on the line itself.
 *
 * By angle round `at`: the line's two ways out of `at`, on and back, split
 * the turn round it in two, and turning from the way on, a point is on the
 * first side if it comes before the way back.
 */
function sideOf(before: Point, at: Point, after: Point, toward: Point): number {
  const angle = (to: Point): number => {
    const ahead = { x: after.x - at.x, y: after.y - at.y }
    const there = { x: to.x - at.x, y: to.y - at.y }
    const turned = Math.atan2(ahead.x * there.y - ahead.y * there.x, ahead.x * there.x + ahead.y * there.y)
    return turned < 0 ? turned + 2 * Math.PI : turned
  }
  const wayBack = angle(before)
  const point = angle(toward)
  if (point === 0 || point === wayBack) {
    return 0
  }
  return point < wayBack ? 1 : -1
}

/**
 * How many times two drawn lines cross: pass from one side of each other to
 * the other.
 *
 * A crossing is never at either line's end. Two connections out of one
 * output, or into one input, share an anchor, and a connection ending on
 * another is a T-junction; neither is a reader losing track of which line is
 * which. Two lines that touch and part on the side they came from do not
 * cross either.
 *
 * Two parts. Where two straight pieces cut through each other away from
 * either's ends, that is a crossing. Where a sampled point of one line lies
 * on the other, no two pieces cut through each other there — an end of one
 * piece touches the other — so whether the lines cross there is read off
 * which sides of the other line the first one arrives from and leaves to.
 * Two mirrored connections are sampled at the same steps along their curves
 * and can cross exactly at a sampled point of both, so the second part is
 * not a nicety. Two lines running together over a stretch
 * count nowhere, which no two connections the canvas draws do.
 */
export function crossings(a: Line, b: Line): number {
  let count = 0
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      const [p, q, r, s] = [a[i]!, a[i + 1]!, b[j]!, b[j + 1]!]
      const ends = [orientation(r, s, p), orientation(r, s, q), orientation(p, q, r), orientation(p, q, s)]
      if (ends.every(end => end !== 0) && Math.sign(ends[0]!) !== Math.sign(ends[1]!) && Math.sign(ends[2]!) !== Math.sign(ends[3]!)) {
        count++
      }
    }
  }

  const touching = new Map<string, Point>()
  for (const [line, other] of [[a, b], [b, a]] as const) {
    for (const point of line) {
      if (pieceHolding(other, point) !== -1) {
        touching.set(`${point.x},${point.y}`, point)
      }
    }
  }
  for (const at of touching.values()) {
    const alongA = around(a, at)
    const alongB = around(b, at)
    if (!alongA || !alongB) {
      continue
    }
    const arrives = sideOf(alongB[0], at, alongB[1], alongA[0])
    const leaves = sideOf(alongB[0], at, alongB[1], alongA[1])
    if (arrives !== 0 && leaves !== 0 && arrives !== leaves) {
      count++
    }
  }
  return count
}

/**
 * Whether a drawn line enters a step: passes through its inside, not along
 * its side or over its corner.
 *
 * Each straight piece is clipped to the step's box, and the piece left over
 * enters only if it has a length and its middle is strictly inside — a
 * piece running along the side is clipped to a length too.
 */
export function entersStep(line: Line, step: StepBox): boolean {
  const left = step.position.x
  const right = left + step.width
  const top = step.position.y
  const bottom = top + step.height
  return line.some((from, index) => {
    const to = line[index + 1]
    if (!to) {
      return false
    }
    const dx = to.x - from.x
    const dy = to.y - from.y
    let enter = 0
    let leave = 1
    for (const [toward, room] of [[-dx, from.x - left], [dx, right - from.x], [-dy, from.y - top], [dy, bottom - from.y]] as const) {
      if (toward === 0) {
        if (room < 0) {
          return false
        }
        continue
      }
      const at = room / toward
      if (toward < 0) {
        enter = Math.max(enter, at)
      }
      else {
        leave = Math.min(leave, at)
      }
    }
    if (enter >= leave) {
      return false
    }
    const middle = (enter + leave) / 2
    const x = from.x + middle * dx
    const y = from.y + middle * dy
    return left < x && x < right && top < y && y < bottom
  })
}
