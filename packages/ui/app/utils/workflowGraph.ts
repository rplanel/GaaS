/**
 * A workflow revision as a graph: the nodes, the edges and the layout the
 * canvas draws (#89, Q6).
 *
 * Pure, and outside the component on purpose. What has to be right here is
 * that **every** connection becomes an edge — a graph that silently omits one
 * is worse than no graph, which is the whole argument for reading the stored
 * definition rather than the live payload (Q12) — and that is a claim about a
 * function, testable without a canvas, a viewport or a browser.
 *
 * Nothing here knows whether the graph is being followed or invoked (Q2'):
 * what differs between those two is only which per-step marks are supplied,
 * and marks are #90's.
 */

import type { Edge, LayoutOptions } from '@dagrejs/dagre'
import type { XYPosition } from '@vue-flow/core'
import type { DescribedStep } from 'nuxt-galaxy'
import type { StepMark } from './stepMarks'
import { inputStepLabel, isInputStep } from '#imports'
import { layout as dagreLayout, Graph } from '@dagrejs/dagre'
import { getBezierPath, Position } from '@vue-flow/core'

/** Left to right by default, top to bottom on request (Q6). */
export type GraphDirection = 'LR' | 'TB'

/**
 * Which side of a node an edge leaves and arrives on, for one direction —
 * and so which of the node's dimensions its anchors are spread `along`: the
 * height when they sit on the left and right, the width when they sit on the
 * top and bottom.
 *
 * One function so the node's properties, the handles placed inside it, where
 * along its side each one sits and how tall a step is sized (#122) are the
 * same decision rather than ternaries that can drift.
 */
export function handleSides(direction: GraphDirection): { source: Position, target: Position, along: 'height' | 'width' } {
  return direction === 'LR'
    ? { source: Position.Right, target: Position.Left, along: 'height' }
    : { source: Position.Bottom, target: Position.Top, along: 'width' }
}

/**
 * The width every step is drawn at, and the least height.
 *
 * Dagre positions boxes, so it has to be told how big they are before they
 * exist. A node that grew past what dagre was told would overlap its
 * neighbour rather than push it away, so each node carries its own size and
 * Vue Flow draws it at exactly that (see `stepHeight`). Not exported for the
 * same reason: a step's size is read off its node, never off these.
 */
const NODE_WIDTH = 260
const NODE_MIN_HEIGHT = 96

/** How far apart two anchors on one side of a step are kept, at the least. */
const ANCHOR_MIN_SPACING = 20

/**
 * How far along its side the *n*th of *m* anchors sits, from 0 to 1.
 *
 * Spread evenly, at `(n + 1) / (m + 1)` of the way along, which keeps a
 * single anchor centred. Here rather than in the template because
 * `stepHeight` sizes a step for exactly this spread — one gap more than
 * there are anchors — and a spread changed in one place only would crowd
 * the anchors again.
 */
export function anchorAlong(index: number, count: number): number {
  return (index + 1) / (count + 1)
}

/** What the node template renders, derived once here rather than in the template. */
export interface WorkflowGraphNodeData {
  /** The step's key at this level: its `order_index`, and a job row's `step_id` (#90). */
  readonly stepId: string
  readonly step: DescribedStep
  /** What to draw on the node. */
  readonly label: string
  /** The tool's short name and the version the revision pins, for a tool step. */
  readonly toolName: string | null
  readonly toolVersion: string | null
  readonly annotation: string | null
  /** Whether opening this node draws a workflow of its own (Q19). */
  readonly isSubworkflow: boolean
  /** Whether the step can be fed at all, which decides if it is given any target handle. */
  readonly acceptsInput: boolean
  /**
   * One anchor per output an edge leaves from, and one per input an edge
   * arrives at, in a stable order.
   *
   * **One anchor per node is not enough, and that is the whole of AC2.** Two
   * edges from one step into one input of another — `fan-in` step 19, fed by
   * step 14's `proviruses` and `viruses` — leave and arrive at the same point
   * if the node has a single handle: two edges in the DOM, one line on
   * screen, with the two labels stacked on top of each other. A reader cannot
   * tell that from a single connection, which is the failure reading the
   * stored definition exists to avoid.
   */
  readonly sourceHandles: string[]
  readonly targetHandles: string[]
}

export interface WorkflowGraphNode {
  readonly id: string
  readonly type: 'step'
  readonly position: { readonly x: number, readonly y: number }
  /**
   * Which side an edge leaves and arrives on — Vue Flow's own node
   * properties, and the one place this graph decides the answer.
   *
   * What actually routes an edge is the *handle's* measured position, not
   * these: `EdgeWrapper` reads `handleBounds`, and falls back to
   * bottom-and-top when a node has not been measured. So the canvas places
   * its handles from these fields rather than recomputing the direction, and
   * the two cannot disagree.
   */
  readonly sourcePosition: Position
  readonly targetPosition: Position
  /**
   * The size the step is drawn at, and the size dagre lays it out as — one
   * number for both, because Vue Flow applies a node's own `width` and
   * `height` as its style (#122).
   */
  readonly width: number
  readonly height: number
  readonly data: WorkflowGraphNodeData
}

/** What the canvas's own edge draws a connection with, beyond its two ends (#135). */
export interface WorkflowGraphEdgeData {
  /**
   * The name of the input this connection feeds, shown only while a reader
   * is on the connection.
   *
   * The same string as `targetHandle` today, and kept apart from it: that is
   * the anchor the edge arrives at, this is what a reader is shown, and #137
   * means to show the input's label instead.
   */
  readonly inputName: string
  /**
   * The way dagre laid this connection round the steps between its two
   * ends, or `null` where it has no usable route of its own and is drawn as
   * the bezier between its anchors (#136).
   */
  readonly route: ConnectionRoute | null
}

/**
 * Where dagre routed one connection that spans more than one rank (#136).
 *
 * Dagre routes every connection, through one point on each rank it crosses
 * and one between each two, and the canvas used to throw all of it away and
 * draw the bezier straight across whatever stood in between. A route is only
 * true of the layout it came from, so it carries where its two steps stood:
 * a reader who drags either of them away has left the route behind.
 */
export interface ConnectionRoute {
  /**
   * Dagre's points between the connection's two ends.
   *
   * Without its first and last, which dagre puts where the line meets the
   * step's border on its way to the centre: the anchors the connection
   * really leaves and arrives at stand in for them.
   */
  readonly through: readonly XYPosition[]
  /** Where the source step and the target step stood, by their top-left corners, when it was routed. */
  readonly sourceAt: XYPosition
  readonly targetAt: XYPosition
}

export interface WorkflowGraphEdge {
  readonly id: string
  /**
   * Drawn by the canvas's own edge, `GraphConnection`, never by Vue Flow's,
   * which draws an edge's `label` all the time (#135). So the edge carries no
   * `label`, and its input name travels in `data` for that edge to show only
   * while a reader is on the connection.
   */
  readonly type: 'connection'
  readonly source: string
  readonly target: string
  /** The output it leaves from and the input it arrives at, by name — the anchors on each node. */
  readonly sourceHandle: string
  readonly targetHandle: string
  readonly data: WorkflowGraphEdgeData
  /**
   * Whether the edge is drawn as flowing, which is Vue Flow's own
   * `animated`. Always `false` here; `animatedEdges` is what sets it.
   */
  readonly animated: boolean
}

export interface WorkflowGraph {
  // Not `readonly` arrays: Vue Flow's `:nodes` and `:edges` are typed
  // mutable, and a readonly array is not assignable to one.
  readonly nodes: WorkflowGraphNode[]
  readonly edges: WorkflowGraphEdge[]
  /**
   * Connections naming a step this level does not hold.
   *
   * Vue Flow drops an edge whose `source` matches no node, and says nothing.
   * A definition Galaxy exported cannot contain one — `input_connections[].id`
   * is an upstream step's `order_index`, which is the key `steps` is under —
   * so reaching this means the definition disagrees with itself, and the one
   * thing that must not happen is drawing the remaining edges as if they were
   * all of them. Named so the canvas can say so.
   */
  readonly dangling: string[]
}

/**
 * What to draw on a step's node.
 *
 * The author's own label first, as Galaxy's editor shows it, then whatever
 * the step is: the tool it runs, the workflow it embeds, or Galaxy's own
 * naming of an input step — which comes from `shared/stepLabel` so that the
 * node and the datamap cannot disagree about what one input is called.
 *
 * `step.label ||` rather than `??` throughout: Galaxy writes the empty string
 * for a step nobody named as readily as it writes nothing.
 */
export function stepNodeLabel(step: DescribedStep): string {
  if (step.label) {
    return step.label
  }
  if (isInputStep(step)) {
    return inputStepLabel(step)
  }
  if (step.type === 'tool' && step.tool_id) {
    return toolDisplayName(step.tool_id)
  }
  if (step.subworkflow?.name) {
    return step.subworkflow.name
  }
  return `Step ${step.id}`
}

/** One edge feeding a step: which input, from which step's which output. */
export interface StepConnection {
  /** The name of the input this connection feeds. */
  readonly inputName: string
  /** The upstream step's key, which is its `order_index`. */
  readonly from: string
  readonly outputName: string
}

/**
 * The identity of the edge one connection draws into one step.
 *
 * The output's name is in it, not only the two steps and the input: one
 * upstream step can feed one input from two of its outputs — `fan-in` step 19
 * does — and without it the two collide and Vue Flow draws one of them. One
 * function because the panel keys its list of the same edges by it, and
 * dagre the graph it lays them out from (#121).
 */
export function edgeId(connection: StepConnection, intoStepId: string): string {
  return `${connection.from}:${connection.outputName}->${intoStepId}:${connection.inputName}`
}

/**
 * Every incoming connection of a step, whichever of the two shapes the export
 * wrote.
 *
 * Exported because the panel lists the same edges the canvas draws, and
 * walked twice the two could disagree about how many there are — which is the
 * one thing a graph must not be wrong about.
 */
export function connectionsOf(step: DescribedStep): StepConnection[] {
  return Object.entries(step.input_connections ?? {}).flatMap(([inputName, value]) =>
    // One input may be fed by several outputs. A singleton list is collapsed
    // to a bare object on the way out of Galaxy — a back-compat hack its own
    // comment says must never be removed — so both shapes arrive and both
    // have to be read (#82).
    (Array.isArray(value) ? value : [value]).map(connection => ({
      inputName,
      from: String(connection.id),
      outputName: connection.output_name,
    })),
  )
}

/**
 * The graph of one level of one revision, laid out.
 *
 * Nodes are keyed by the **record key** rather than by `step.id`, because
 * that is the key a connection names, a job row carries and the graph's
 * consumers look a mark up by. The two are the same integer in anything
 * Galaxy exported; keeping to one of them means a definition where they are
 * not cannot half-draw.
 *
 * **Takes no marks, and that is deliberate.** The layout is a function of
 * the steps and the direction and of nothing else, so a canvas following an
 * invocation hands Vue Flow the *same* nodes however the jobs move. Vue Flow
 * re-parses whenever the array changes and
 * `Object.assign(existingNode, node)` writes the laid-out position back
 * (`vue-flow-core.mjs:3573`) — so a mark carried inside the node data would
 * snap every dragged node home on each refetch, which is Q6's "dragging is
 * allowed" undone on the one screen that refetches. What each step is doing
 * reaches the node template directly, and reaches the edges through
 * `animatedEdges`.
 */
export function workflowGraph(
  steps: Record<string, DescribedStep>,
  direction: GraphDirection = 'LR',
): WorkflowGraph {
  const entries = Object.entries(steps)
  const known = new Set(entries.map(([stepId]) => stepId))
  const anchors = anchorsOf(entries)

  const sides = handleSides(direction)
  const nodes = entries.map(([stepId, step]) => ({
    id: stepId,
    type: 'step' as const,
    sourcePosition: sides.source,
    targetPosition: sides.target,
    width: NODE_WIDTH,
    height: stepHeight(anchors[stepId], sides.along),
    data: {
      stepId,
      step,
      label: stepNodeLabel(step),
      toolName: step.tool_id === null ? null : toolDisplayName(step.tool_id),
      toolVersion: step.tool_version,
      annotation: step.annotation,
      isSubworkflow: step.subworkflow !== null,
      // An input step is where a workflow starts, so it can never be fed and
      // is drawn without a target handle. Decided by type rather than by
      // whether this particular step happens to have a connection: a tool
      // step with nothing feeding it is a step waiting for an edge (#97), not
      // a step that takes none.
      acceptsInput: !isInputStep(step),
      sourceHandles: anchors[stepId]?.source ?? [],
      targetHandles: anchors[stepId]?.target ?? [],
    },
  }))

  const dangling: string[] = []
  const unrouted = entries.flatMap(([stepId, step]) =>
    connectionsOf(step).flatMap((connection) => {
      if (!known.has(connection.from)) {
        dangling.push(`${connection.from} → ${stepId}.${connection.inputName}`)
        return []
      }
      return [{
        id: edgeId(connection, stepId),
        type: 'connection' as const,
        source: connection.from,
        target: stepId,
        // Named anchors, so two edges between one pair of steps through one
        // input leave from the two different outputs they really come from
        // rather than from one point on top of each other.
        sourceHandle: connection.outputName,
        targetHandle: connection.inputName,
        data: { inputName: connection.inputName, route: null },
        animated: false,
      }]
    }),
  )

  const layout = layOut(nodes, unrouted, direction)
  const edges = unrouted.map((edge) => {
    const route = layout.routes.get(edge.id)
    return route === undefined ? edge : { ...edge, data: { ...edge.data, route } }
  })
  return { nodes: layout.nodes, edges, dangling }
}

/**
 * The same edges, with the ones leaving a running step drawn as flowing.
 *
 * Read off the **source** step's mark: an edge *into* a running step is
 * carrying nothing yet, so animating that one would say the opposite of what
 * is happening.
 *
 * Separate from `workflowGraph` because the two are recomputed on different
 * clocks. An edge has no position for Vue Flow to overwrite, so rebuilding
 * the edge array as the jobs move costs nothing — rebuilding the node array
 * would cost a reader their drag (see `workflowGraph`).
 */
export function animatedEdges(
  edges: readonly WorkflowGraphEdge[],
  marks: Record<string, StepMark>,
): WorkflowGraphEdge[] {
  return edges.map(edge => ({ ...edge, animated: marks[edge.source]?.isRunning ?? false }))
}

/** What `connectionPath` draws one connection from: its two anchors as Vue Flow measured them, and its route. */
export interface ConnectionPathParams {
  readonly sourceX: number
  readonly sourceY: number
  readonly sourcePosition: Position
  readonly targetX: number
  readonly targetY: number
  readonly targetPosition: Position
  /** Vue Flow's own, for every bezier drawn: 0.25 where it is not given. */
  readonly curvature?: number
  readonly route: ConnectionRoute | null
  /** Where the source step and the target step stand now, which is where a reader dragged them to. */
  readonly sourceStepAt: XYPosition
  readonly targetStepAt: XYPosition
}

/**
 * The line the canvas draws for one connection, as an SVG path, and the
 * point its name is shown at (#136).
 *
 * One function, and the only one: the canvas's own edge draws every
 * connection with it, and the count of crossings and of connections run
 * through a step (#134) measures what it draws, so the count is of the line
 * a reader sees.
 *
 * **A connection with no usable route draws the live bezier between its
 * anchors**, as Vue Flow's default edge always did: a connection between
 * adjacent ranks, where nothing can stand in between; a connection on a
 * level laid out from one edge per pair of steps, whose routes are shared by
 * every connection of a pair; and a connection whose source or target step
 * a reader has dragged off where the route was laid out.
 *
 * **A routed one is a chain of Vue Flow's beziers**, from its source anchor
 * through each point of its route to its target anchor. Each piece leaves
 * and arrives along the way the ranks run, as the bezier between two anchors
 * does, so the chain bends between ranks and runs straight through them.
 */
export function connectionPath(params: ConnectionPathParams): [path: string, labelX: number, labelY: number] {
  const { route, sourceStepAt, targetStepAt, ...ends } = params
  const followed = route !== null && samePosition(route.sourceAt, sourceStepAt) && samePosition(route.targetAt, targetStepAt)
  if (!followed) {
    const [path, labelX, labelY] = getBezierPath(ends)
    return [path, labelX, labelY]
  }

  const points = [{ x: ends.sourceX, y: ends.sourceY }, ...route.through, { x: ends.targetX, y: ends.targetY }]
  const pieces = points.slice(1).map((to, index) => getBezierPath({
    ...ends,
    sourceX: points[index]!.x,
    sourceY: points[index]!.y,
    targetX: to.x,
    targetY: to.y,
  }))
  // One `M` and the cubics after it, so the chain is one line: a path
  // restarted at each point would restart a flowing connection's dashes.
  const path = pieces.map(([piece], index) => (index === 0 ? piece : piece.replace(/^M\S+ /, ''))).join(' ')

  // Halfway along: at the point between the two middle pieces, or inside
  // the middle one, where Vue Flow names a piece.
  const middle = pieces.length / 2
  if (Number.isInteger(middle)) {
    const { x, y } = points[middle]!
    return [path, x, y]
  }
  const [, labelX, labelY] = pieces[Math.floor(middle)]!
  return [path, labelX, labelY]
}

function samePosition(a: XYPosition, b: XYPosition): boolean {
  return a.x === b.x && a.y === b.y
}

/**
 * Which outputs and inputs of each step an edge can meet, by step key.
 *
 * The outputs are the step's own declared list **union every output name a
 * downstream connection reads from it**, and the union is not belt and
 * braces. Galaxy writes `outputs: []` on a subworkflow step whatever the
 * workflow inside it produces, naming the real ones in `workflow_outputs`
 * instead, so a subworkflow feeding a downstream step declares no output for
 * the edge to leave from. Read only from the connections and an output
 * nothing consumes would have no anchor, which is harmless now and would
 * matter the moment an output handle is shown.
 *
 * The inputs are the names something actually feeds. An input with no
 * connection gets no anchor: there is no edge to meet it, and #97's mark is
 * how a reader is told about one that should have had one.
 *
 * Sorted, so the anchors keep their places between renders rather than
 * reordering with whatever order the export happened to list them in.
 */
function anchorsOf(entries: [string, DescribedStep][]): Record<string, { source: string[], target: string[] }> {
  const anchors: Record<string, { source: Set<string>, target: Set<string> }> = {}
  const of = (stepId: string) => {
    anchors[stepId] ??= { source: new Set(), target: new Set() }
    return anchors[stepId]
  }

  for (const [stepId, step] of entries) {
    const own = of(stepId)
    for (const output of step.outputs) {
      own.source.add(output.name)
    }
    for (const connection of connectionsOf(step)) {
      own.target.add(connection.inputName)
      of(connection.from).source.add(connection.outputName)
    }
  }

  return Object.fromEntries(
    Object.entries(anchors).map(([stepId, { source, target }]) => [
      stepId,
      { source: [...source].sort(), target: [...target].sort() },
    ]),
  )
}

/**
 * How tall a step is drawn: as tall as its anchors need, and never shorter
 * than a step always was (#122).
 *
 * The anchors are spread evenly down a side, so at one fixed height the
 * more a step had the closer they sat — ccqtl-today's step 2 put ten 8.7 px
 * apart, 6 px handles with 2.7 px between them, and ten edges left it as one
 * smear. Galaxy's editor sizes a step by how many inputs and outputs it has
 * for the same reason. The fuller side decides, with one gap more than it
 * has anchors.
 *
 * Only where the anchors run along the height, which is left to right. Top
 * to bottom they run along the width, which stays fixed so that a rank of
 * steps lines up, and a taller step would spread nothing.
 */
function stepHeight(anchors: { source: string[], target: string[] } | undefined, along: 'height' | 'width'): number {
  if (along === 'width') {
    return NODE_MIN_HEIGHT
  }
  const anchorsOnFullerSide = Math.max(anchors?.source.length ?? 0, anchors?.target.length ?? 0)
  return Math.max(NODE_MIN_HEIGHT, ANCHOR_MIN_SPACING * (anchorsOnFullerSide + 1))
}

/**
 * The graph dagre lays one level out from: every step, at the size the
 * template draws it, and every connection as an edge of its own.
 *
 * A multigraph, with each edge named by `edgeId`. graphlib keys an edge of a
 * plain graph by its two steps alone, so a second connection between the
 * same pair overwrites the first — `ccqtl-today` joins ten pairs of steps
 * with twenty connections and was laid out from ten (#121). The name is the
 * one Vue Flow keys the same edge by, and for the same reason.
 *
 * No edge is given a label size, either way it is keyed. Nothing names a
 * connection at rest, so the layout has no label to keep clear, and one
 * sized here would push the ranks apart for a name drawn only on hover
 * (#135).
 *
 * Keyed by `'pair'`, one edge per pair of steps instead, weighted by the
 * connections it stands for: what `layOut` falls back to on a level dagre
 * cannot lay out the first way. The weights keep every connection in the
 * ranking — dagre's ranker sums parallel edges into exactly this — but not
 * the room each would have been given: in dagre's own order, every
 * recording laid out exactly as the unweighted graph before #121 did. The
 * weights also count in `anchorOrder`, which orders this graph's ranks as
 * it does the other's, and this is the only graph whose weights are not
 * all 1.
 */
export function dagreGraph(
  nodes: readonly Pick<WorkflowGraphNode, 'id' | 'width' | 'height'>[],
  edges: readonly WorkflowGraphEdge[],
  direction: GraphDirection,
  keying: 'connection' | 'pair' = 'connection',
): Graph {
  const graph = new Graph({ multigraph: keying === 'connection' })
  graph.setGraph({ rankdir: direction, nodesep: 32, ranksep: 90, marginx: 16, marginy: 16 })
  for (const node of nodes) {
    graph.setNode(node.id, { width: node.width, height: node.height })
  }
  for (const edge of edges) {
    if (keying === 'connection') {
      graph.setEdge(edge.source, edge.target, {}, edge.id)
    }
    else {
      const weight = (graph.edge(edge.source, edge.target)?.weight ?? 0) + 1
      graph.setEdge(edge.source, edge.target, { weight })
    }
  }
  return graph
}

/**
 * Where each node sits, computed rather than stored (Q6).
 *
 * The export does carry the coordinates Galaxy's editor last used, in
 * `position`, and they are deliberately not read: a graph laid out by
 * whatever the author dragged things to in another application is not
 * readable here, and the ticket asks for left-to-right by default.
 *
 * From one edge per connection wherever dagre can place that, and from one
 * per pair of steps on a level where it cannot (see `tryLayOut`): a layout
 * that gives the connections between two steps no room of their own still
 * draws every one of them, and a layout that throws draws nothing.
 *
 * With the route of each connection that has one of its own (#136), by its
 * id. None from the layout per pair, where every connection between two
 * steps shares one route, and through one point would pinch them all.
 */
function layOut(
  nodes: Omit<WorkflowGraphNode, 'position'>[],
  edges: WorkflowGraphEdge[],
  direction: GraphDirection,
): { nodes: WorkflowGraphNode[], routes: Map<string, ConnectionRoute> } {
  const options = { customOrder: anchorOrder(nodes, edges) }
  const perConnection = tryLayOut(dagreGraph(nodes, edges, direction), options)
  const graph = perConnection ?? dagreLayout(dagreGraph(nodes, edges, direction, 'pair'), options)

  const laidOut = nodes.map((node) => {
    const { x, y } = graph.node(node.id)
    // Dagre positions a node by its centre, Vue Flow by its top-left corner.
    return { ...node, position: { x: x - node.width / 2, y: y - node.height / 2 } }
  })
  if (perConnection === undefined) {
    return { nodes: laidOut, routes: new Map() }
  }

  const at = new Map(laidOut.map(node => [node.id, node.position]))
  const routes = new Map(edges.flatMap((edge) => {
    const through = routeThrough(perConnection.edge(edge.source, edge.target, edge.id)?.points)
    return through === undefined
      ? []
      : [[edge.id, { through, sourceAt: { ...at.get(edge.source)! }, targetAt: { ...at.get(edge.target)! } }] as const]
  }))
  return { nodes: laidOut, routes }
}

/**
 * The points of a route between its two ends, or `undefined` where the
 * connection has no usable route of its own.
 *
 * None between adjacent ranks. To make way for edge labels, dagre puts a
 * rank of its own halfway between every two (it halves `ranksep` and doubles
 * every edge's `minlen`), so between its ends a route has one point on every
 * rank it crosses and one halfway between each two: between adjacent ranks
 * that is the single point halfway, round nothing.
 *
 * None either where any point is not finite. Dagre has been seen to return
 * a `NaN` inside a route while placing every step (see `tryLayOut`), and the
 * layout is kept, so only that connection is drawn as the bezier between
 * its anchors rather than as a path that draws nothing.
 */
function routeThrough(points: readonly XYPosition[] | undefined): XYPosition[] | undefined {
  const through = (points ?? []).slice(1, -1)
  if (through.length < 2 || !through.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))) {
    return undefined
  }
  return through.map(({ x, y }) => ({ x, y }))
}

/**
 * The graph laid out, or `undefined` where dagre could not place every step.
 *
 * Not hypothetical, and not ours. While dagre 3.1 orders a rank
 * (`sortSubgraph`), it pairs the dummy nodes of parallel edges up in a
 * record keyed by one of the two, so a third parallel edge overwrites the
 * second's entry and that dummy drops out of the sort. It keeps the order it
 * had before, which another node of its rank may now hold as well, and the
 * layering dagre positions from keeps one node per order: whichever loses
 * the slot is never placed, and where it is an edge's end dagre throws "Not
 * possible to find intersection inside of the rectangle".
 * `conditional-repeat-runtime` is enough to set it off — step 1 feeds step 2
 * three times and step 3 twice, and both feed step 4.
 *
 * `anchorOrder` numbers each rank afresh before dagre places anything, and
 * that alone stops the throw: over 40 000 random layouts in #123's design
 * spike it threw on none, against 71% for dagre's own order. So this is a
 * safety net now, reached by no recorded level, and whether to remove it is
 * #133's to decide.
 *
 * Where the node left unplaced is not an edge's end, dagre returns normally
 * with a `NaN` inside that edge's route, and that layout is kept: every step
 * is placed, and only that connection is drawn without its route (see
 * `routeThrough`). The steps are checked all the same, because a step at
 * `NaN` is one Vue Flow would silently leave out — though dagre has not been
 * seen to put one there without throwing.
 *
 * Any throw falls back, not only this one: the fallback puts the same steps
 * through the same dagre, so a failure it shares still throws. A dagre that
 * stops losing the dummy needs nothing changed here; the fallback just stops
 * running.
 */
function tryLayOut(graph: Graph, options: LayoutOptions): Graph | undefined {
  try {
    dagreLayout(graph, options)
  }
  catch {
    return undefined
  }
  const placed = graph.nodes().every((id) => {
    const { x, y } = graph.node(id)
    return Number.isFinite(x) && Number.isFinite(y)
  })
  return placed ? graph : undefined
}

/** How many times `anchorOrder` sweeps the ranks, alternately down and up: #123's design spike's eight. */
const ORDER_SWEEPS = 8

type CustomOrder = NonNullable<LayoutOptions['customOrder']>

/**
 * The order dagre lays each rank out in, counting each connection at its
 * anchor rather than at its step's centre (#136).
 *
 * Dagre orders a rank by where the steps it joins stand, as if every
 * connection left and arrived at a step's middle. A step's anchors are
 * spread down its side in the order of their names, so two connections
 * whose steps are in the right order can still leave in the wrong one and
 * cross just outside the step. Drawn through dagre's routes, those legs
 * fanned across each other: #123's design spike counted 245 crossings over
 * the recorded levels, against 154 drawn straight, and 66 ordered by
 * anchor.
 *
 * Dagre's own order comes first, and then every rank is numbered 0 to n − 1
 * in that order, which dagre 3.1.1 does not guarantee and which is what
 * stops it throwing (see `tryLayOut`). Then the ranks are swept, down and
 * up in turn: each step or dummy is placed at the mean of where the
 * connections meeting it come from, each counted at its anchor, as an
 * offset of up to half a place either side of its step. Whichever ordering
 * crosses fewest connections counted that way is kept, dagre's included.
 *
 * **This reads labels private to dagre's layout graph**: each node's `rank`
 * and `order`, and a dummy's `dummy` and `edgeObj`, which is how a dummy is
 * traced back to its connection — under one edge per connection the edge's
 * name is the connection's id. A dagre bump can break any of it, which is
 * one of the reasons ADR 0005 gives for reopening ELK. On the layout per
 * pair, whose edges name no connection, a pair's connections are counted at
 * the middle of their anchors.
 */
function anchorOrder(nodes: readonly Pick<WorkflowGraphNode, 'id' | 'data'>[], edges: readonly WorkflowGraphEdge[]): CustomOrder {
  const data = new Map(nodes.map(node => [node.id, node.data]))
  /** How far from the middle of its step's side each end of a connection is, from −0.5 to 0.5. */
  const offsets = new Map(edges.map((edge) => {
    const source = data.get(edge.source)!
    const target = data.get(edge.target)!
    return [edge.id, {
      source: anchorAlong(source.sourceHandles.indexOf(edge.sourceHandle), source.sourceHandles.length) - 0.5,
      target: anchorAlong(target.targetHandles.indexOf(edge.targetHandle), target.targetHandles.length) - 0.5,
    }]
  }))
  const pairOf = (source: string, target: string): string => `${source}\0${target}`
  const pairs = new Map<string, { source: number, target: number, count: number }>()
  for (const edge of edges) {
    const pair = pairs.get(pairOf(edge.source, edge.target)) ?? { source: 0, target: 0, count: 0 }
    const offset = offsets.get(edge.id)!
    pairs.set(pairOf(edge.source, edge.target), { source: pair.source + offset.source, target: pair.target + offset.target, count: pair.count + 1 })
  }
  const offsetsOf = ({ v, w, name }: Edge): { source: number, target: number } => {
    const own = name === undefined ? undefined : offsets.get(name)
    if (own !== undefined) {
      return own
    }
    const pair = pairs.get(pairOf(v, w))
    return pair === undefined ? { source: 0, target: 0 } : { source: pair.source / pair.count, target: pair.target / pair.count }
  }

  return (graph, order) => {
    order(graph)

    // Each piece of a connection between two neighbouring ranks, with where
    // it meets each of the two as an offset off that one's place. A dummy is
    // a point on the connection's way and has no anchor to be off.
    const pieces = graph.edges().map((piece) => {
      const from = graph.node(piece.v)
      const to = graph.node(piece.w)
      const connection = to.edgeObj ?? from.edgeObj
      const offset = connection === undefined ? { source: 0, target: 0 } : offsetsOf(connection)
      return {
        v: piece.v,
        w: piece.w,
        offV: from.dummy ? 0 : offset.source,
        offW: to.dummy ? 0 : offset.target,
        weight: graph.edge(piece).weight ?? 1,
      }
    })
    const into = grouped(pieces, piece => piece.w)
    const outOf = grouped(pieces, piece => piece.v)

    const byRank = grouped(graph.nodes(), v => graph.node(v).rank!)
    const ranks = [...byRank.keys()].sort((a, b) => a - b).map(rank =>
      byRank.get(rank)!.sort((a, b) => graph.node(a).order! - graph.node(b).order!))
    const place = new Map(ranks.flatMap(rank => rank.map((v, index) => [v, index] as const)))

    const crossed = (): number => {
      let count = 0
      for (const between of grouped(pieces, piece => graph.node(piece.v).rank!).values()) {
        const spans = between.map(piece => ({ from: place.get(piece.v)! + piece.offV, to: place.get(piece.w)! + piece.offW, weight: piece.weight }))
        spans.forEach((one, index) => {
          for (const other of spans.slice(index + 1)) {
            if ((one.from - other.from) * (one.to - other.to) < 0) {
              count += one.weight * other.weight
            }
          }
        })
      }
      return count
    }

    let best = new Map(place)
    let fewest = crossed()
    for (let sweep = 0; sweep < ORDER_SWEEPS; sweep++) {
      const down = sweep % 2 === 0
      for (const rank of down ? ranks.slice(1) : [...ranks].reverse().slice(1)) {
        const centres = rank.map((v) => {
          const meeting = (down ? into.get(v) : outOf.get(v)) ?? []
          if (meeting.length === 0) {
            return { v, centre: place.get(v)! }
          }
          const sum = meeting.reduce((total, piece) => total + piece.weight * (down
            ? place.get(piece.v)! + piece.offV - piece.offW
            : place.get(piece.w)! + piece.offW - piece.offV), 0)
          return { v, centre: sum / meeting.reduce((total, piece) => total + piece.weight, 0) }
        })
        centres.sort((a, b) => a.centre - b.centre || place.get(a.v)! - place.get(b.v)!)
        centres.forEach(({ v }, index) => place.set(v, index))
        rank.splice(0, rank.length, ...centres.map(({ v }) => v))
      }
      const count = crossed()
      if (count < fewest) {
        fewest = count
        best = new Map(place)
      }
    }
    for (const [v, index] of best) {
      graph.node(v).order = index
    }
  }
}

/** `items` by `key`, each group in the order its items came. */
function grouped<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const group = groups.get(key(item))
    if (group === undefined) {
      groups.set(key(item), [item])
    }
    else {
      group.push(item)
    }
  }
  return groups
}

/**
 * The steps at one level of a drill-down, or `undefined` for a path that
 * names no subworkflow.
 *
 * `path` is the subworkflow step ids walked into, outermost first. An empty
 * path is the workflow itself, which is the only level whose step ids join to
 * anything outside the definition — our job rows key by the *outer* step's
 * order index, so a nested step has no row of its own (#90).
 */
export function stepsAtPath(
  steps: Record<string, DescribedStep>,
  path: readonly string[],
): Record<string, DescribedStep> | undefined {
  let level: Record<string, DescribedStep> | undefined = steps
  for (const stepId of path) {
    // Annotated because `DescribedStep` holds its own steps: left to
    // inference the walk refers to itself and reads as `any`.
    const nested: Record<string, DescribedStep> | undefined = level?.[stepId]?.subworkflow?.steps
    if (nested === undefined) {
      return undefined
    }
    level = nested
  }
  return level
}

/** One crumb of the trail into a subworkflow: the step walked into, and what it is called. */
export interface SubworkflowCrumb {
  readonly stepId: string
  readonly label: string
  /** The path that leads back to this level, for the crumb to navigate to. */
  readonly path: readonly string[]
}

/**
 * The trail of subworkflows a path has been walked into, so a reader can get
 * back out.
 *
 * A path that no longer resolves — the description was refetched and the
 * revision it describes declares different steps — stops the trail where it
 * stops resolving, which is also the deepest level still drawable.
 */
export function subworkflowTrail(
  steps: Record<string, DescribedStep>,
  path: readonly string[],
): SubworkflowCrumb[] {
  const crumbs: SubworkflowCrumb[] = []
  let level: Record<string, DescribedStep> | undefined = steps
  const walked: string[] = []
  for (const stepId of path) {
    const step: DescribedStep | undefined = level?.[stepId]
    if (step?.subworkflow === undefined || step.subworkflow === null) {
      break
    }
    walked.push(stepId)
    crumbs.push({ stepId, label: stepNodeLabel(step), path: [...walked] })
    level = step.subworkflow.steps
  }
  return crumbs
}
