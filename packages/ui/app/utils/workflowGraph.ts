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

import type { DescribedStep } from 'nuxt-galaxy'
import type { StepMark } from './stepMarks'
import { inputStepLabel, isInputStep } from '#imports'
import { layout as dagreLayout, Graph } from '@dagrejs/dagre'
import { Position } from '@vue-flow/core'

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
   */
  readonly inputName: string
}

export interface WorkflowGraphEdge {
  readonly id: string
  /**
   * Drawn by the canvas's own edge, never by Vue Flow's (#135).
   *
   * Vue Flow's edges draw an edge's `label` permanently, wherever they like,
   * on top of whatever is already there — and an input name is a Galaxy
   * path such as `results_0|software_cond|output_0|type|input`, wider than a
   * step. So the edge carries no `label` at all, and its name travels in
   * `data`, for the canvas's edge to show while the connection is hovered,
   * focused or selected. That edge reads what it draws from here rather
   * than working it out, which is what lets the routing of #136 extend it.
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
  const edges = entries.flatMap(([stepId, step]) =>
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
        data: { inputName: connection.inputName },
        animated: false,
      }]
    }),
  )

  return { nodes: layOut(nodes, edges, direction), edges, dangling }
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
 * the room each would have been given, so on every recording it lays out
 * exactly as the unweighted graph before #121 did.
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
 */
function layOut(
  nodes: Omit<WorkflowGraphNode, 'position'>[],
  edges: WorkflowGraphEdge[],
  direction: GraphDirection,
): WorkflowGraphNode[] {
  const graph = tryLayOut(dagreGraph(nodes, edges, direction))
    ?? dagreLayout(dagreGraph(nodes, edges, direction, 'pair'))

  return nodes.map((node) => {
    const { x, y } = graph.node(node.id)
    // Dagre positions a node by its centre, Vue Flow by its top-left corner.
    return { ...node, position: { x: x - node.width / 2, y: y - node.height / 2 } }
  })
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
 * Where the node left unplaced is not an edge's end, dagre returns normally
 * with a `NaN` inside that edge's route, and that layout is kept: every step
 * is placed, and Vue Flow routes its own edges, so no route of dagre's is
 * ever drawn. The steps are checked all the same, because a step at `NaN` is one
 * Vue Flow would silently leave out — though dagre has not been seen to put
 * one there without throwing.
 *
 * Any throw falls back, not only this one: the fallback puts the same steps
 * through the same dagre, so a failure it shares still throws. A dagre that
 * stops losing the dummy needs nothing changed here; the fallback just stops
 * running.
 */
function tryLayOut(graph: Graph): Graph | undefined {
  try {
    dagreLayout(graph)
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
