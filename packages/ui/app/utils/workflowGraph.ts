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
import { inputStepLabel, isInputStep } from '#imports'
import { layout as dagreLayout, Graph } from '@dagrejs/dagre'
import { Position } from '@vue-flow/core'

/** Left to right by default, top to bottom on request (Q6). */
export type GraphDirection = 'LR' | 'TB'

/**
 * Which side of a node an edge leaves and arrives on, for one direction.
 *
 * One function so the node's properties and the handle placed inside it are
 * the same decision rather than two ternaries that can drift.
 */
export function handleSides(direction: GraphDirection): { source: Position, target: Position } {
  return direction === 'LR'
    ? { source: Position.Right, target: Position.Left }
    : { source: Position.Bottom, target: Position.Top }
}

/**
 * The size dagre lays a node out as, and the size the node template is
 * clamped to.
 *
 * Dagre positions boxes, so it has to be told how big they are before they
 * exist. A node that grew past these would overlap its neighbour rather than
 * push it away, so the template fixes the same numbers.
 */
export const NODE_WIDTH = 260
export const NODE_HEIGHT = 96

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
  /** Whether the step can be fed at all, which decides if it has a target handle. */
  readonly acceptsInput: boolean
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
  readonly data: WorkflowGraphNodeData
}

export interface WorkflowGraphEdge {
  readonly id: string
  readonly source: string
  readonly target: string
  /** The name of the input this connection feeds, which is what the edge is labelled with. */
  readonly label: string
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
 * What a tool is called, from the id Galaxy knows it by.
 *
 * A toolshed guid ends in `…/<name>/<version>`, so the name is its
 * second-to-last segment; a built-in id (`Cut1`, `__BUILD_LIST__`) has no
 * segments and is its own name. The *version* is never read out of the id
 * this way — only the first kind carries one — which is why every caller
 * takes it from the step's `tool_version` instead (#100).
 */
export function toolDisplayName(toolId: string): string {
  const segments = toolId.split('/')
  return (segments.length >= 2 ? segments.at(-2) : toolId) || toolId
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

/** Every incoming connection of a step, whichever of the two shapes the export wrote. */
function connectionsOf(step: DescribedStep): { inputName: string, from: string, outputName: string }[] {
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
 */
export function workflowGraph(
  steps: Record<string, DescribedStep>,
  direction: GraphDirection = 'LR',
): WorkflowGraph {
  const entries = Object.entries(steps)
  const known = new Set(entries.map(([stepId]) => stepId))

  const sides = handleSides(direction)
  const nodes = entries.map(([stepId, step]) => ({
    id: stepId,
    type: 'step' as const,
    sourcePosition: sides.source,
    targetPosition: sides.target,
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
        // The output's name is in the id because two edges can join the same
        // pair of steps through one input, from two different outputs — the
        // fan-in `subworkflow-nested`'s sibling recording pins. Without it
        // they would collide and Vue Flow would render one.
        id: `${connection.from}:${connection.outputName}->${stepId}:${connection.inputName}`,
        source: connection.from,
        target: stepId,
        label: connection.inputName,
      }]
    }),
  )

  return { nodes: layOut(nodes, edges, direction), edges, dangling }
}

/**
 * Where each node sits, computed rather than stored (Q6).
 *
 * The export does carry the coordinates Galaxy's editor last used, in
 * `position`, and they are deliberately not read: a graph laid out by
 * whatever the author dragged things to in another application is not
 * readable here, and the ticket asks for left-to-right by default.
 */
function layOut(
  nodes: Omit<WorkflowGraphNode, 'position'>[],
  edges: WorkflowGraphEdge[],
  direction: GraphDirection,
): WorkflowGraphNode[] {
  const graph = new Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: direction, nodesep: 32, ranksep: 90, marginx: 16, marginy: 16 })
  for (const node of nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target)
  }
  dagreLayout(graph)

  return nodes.map((node) => {
    const { x, y } = graph.node(node.id)
    // Dagre positions a node by its centre, Vue Flow by its top-left corner.
    return { ...node, position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 } }
  })
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
