<script setup lang="ts">
import type { VueFlowStore } from '@vue-flow/core'
import { layout as dagreLayout, Graph } from '@dagrejs/dagre'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { Handle, Position, VueFlow } from '@vue-flow/core'

/**
 * The part of a step this canvas reads, as the description endpoint answers
 * it. Declared here rather than imported so the prototype stays a
 * playground-only file: the fields are a subset of `DescribedStep`, and
 * `input_connections` is the whole reason a workflow can be drawn at all.
 *
 * Keyed by the name of the input a connection feeds, with a value that is
 * one connection **or an array of them** — which is why this reads the
 * stored definition's spelling and not the live API's `input_steps` (#88):
 * Galaxy builds that one by assigning into a dict in a loop, so an input fed
 * by two upstream outputs silently keeps only the last of them.
 */
export interface GraphStep {
  id: number
  type: string
  tool_id: string | null
  tool_version: string | null
  annotation: string | null
  input_connections: Record<string, Connection | Connection[]>
}

/** One incoming edge: the upstream step's index, and the output feeding this input. */
interface Connection { id: number, output_name: string }

const props = withDefaults(
  defineProps<{
    /** Steps keyed by step index, exactly as the proxy answers them. */
    steps: Record<string, GraphStep>
    /** The step the panel is showing, drawn as the selected node. */
    selected?: string | undefined
    /** Steps the last submission refused, drawn with an error ring. */
    invalid?: string[]
    /**
     * What to call a step, by step id. An input step's name is the label the
     * workflow gives it (`workflow.inputs`), which the step itself does not
     * carry, so it is handed in rather than guessed at.
     */
    labels?: Record<string, string>
    direction?: 'LR' | 'TB'
  }>(),
  { selected: undefined, invalid: () => [], labels: () => ({}), direction: 'LR' },
)

const emit = defineEmits<{ select: [stepId: string] }>()

// Dagre lays out boxes, so it has to be told how big they are before they
// exist. These are the sizes the node template below is clamped to; a node
// that grew past them would overlap its neighbour rather than push it away.
const NODE_WIDTH = 260
const NODE_HEIGHT = 92

function shortToolName(toolId: string | null) {
  if (!toolId) {
    return null
  }
  // A toolshed id carries owner/name/version in its tail; a built-in id is
  // already short enough to show as it is.
  const parts = toolId.split('/')
  return parts.length >= 2 ? parts[parts.length - 2] : toolId
}

/**
 * Nodes and edges for the canvas, laid out by dagre.
 *
 * Galaxy's API describes steps without coordinates — the positions its editor
 * shows live in the `.ga` export, not here — so every position on this canvas
 * is computed. `source_step` is the step's index, which is also the key it is
 * listed under, so an edge is a key lookup and nothing more.
 */
const graph = computed(() => {
  const entries = Object.entries(props.steps)

  const nodes = entries.map(([stepId, step]) => ({
    id: stepId,
    type: 'step',
    position: { x: 0, y: 0 },
    sourcePosition: props.direction === 'LR' ? Position.Right : Position.Bottom,
    targetPosition: props.direction === 'LR' ? Position.Left : Position.Top,
    data: {
      stepId,
      type: step.type,
      label: props.labels[stepId],
      annotation: step.annotation,
      toolName: shortToolName(step.tool_id),
      toolVersion: step.tool_version,
    },
  }))

  const edges = entries.flatMap(([stepId, step]) =>
    Object.entries(step.input_connections ?? {}).flatMap(([inputName, value]) =>
      // One input may be fed by several outputs, so the id carries the
      // output's name too: `{id, output_name}` and `[{…}, {…}]` are both
      // shapes the export writes, and two edges can join the same pair of
      // steps through one input.
      (Array.isArray(value) ? value : [value]).map(connection => ({
        id: `${connection.id}:${connection.output_name}->${stepId}:${inputName}`,
        source: String(connection.id),
        target: stepId,
        label: inputName,
        style: { strokeWidth: 1.5 },
      })),
    ),
  )

  const g = new Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: props.direction, nodesep: 32, ranksep: 90, marginx: 16, marginy: 16 })
  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }
  dagreLayout(g)

  return {
    // dagre positions a node by its centre, Vue Flow by its top-left corner.
    nodes: nodes.map((node) => {
      const { x, y } = g.node(node.id)
      return { ...node, position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 } }
    }),
    edges,
  }
})

/**
 * Where the handles sit, which is what makes the edges leave the right edge
 * of a node in `LR` and its bottom edge in `TB`.
 */
const sourcePos = computed(() => (props.direction === 'LR' ? Position.Right : Position.Bottom))
const targetPos = computed(() => (props.direction === 'LR' ? Position.Left : Position.Top))

const flow = ref<VueFlowStore | undefined>(undefined)

function onPaneReady(instance: VueFlowStore) {
  flow.value = instance
}

/**
 * Bring named steps into view. A canvas can hold an error off-screen, which
 * a form never could, so a refused submission has to be able to say where it
 * happened rather than leave the reader to find it.
 */
function focus(stepIds: string[]) {
  if (stepIds.length > 0) {
    flow.value?.fitView({ nodes: stepIds, padding: 0.4, duration: 400, maxZoom: 1.2 })
  }
}

function fit() {
  flow.value?.fitView({ padding: 0.15, duration: 300 })
}

defineExpose({ focus, fit })

// Re-laying out swaps every position at once, so the view is fitted again
// rather than left pointing at where the graph used to be.
watch(() => props.direction, () => nextTick(fit))
</script>

<template>
  <VueFlow
    :nodes="graph.nodes"
    :edges="graph.edges"
    :min-zoom="0.2"
    :max-zoom="2"
    :nodes-draggable="false"
    :nodes-connectable="false"
    :elements-selectable="true"
    :only-render-visible-elements="false"
    :delete-key-code="null"
    class="size-full"
    @pane-ready="onPaneReady"
    @nodes-initialized="fit"
    @node-click="({ node }) => emit('select', node.id)"
  >
    <Background :gap="16" pattern-color="var(--ui-border)" />
    <Controls :show-interactive="false" />

    <template #node-step="{ id, data }">
      <div
        class="rounded-[calc(var(--ui-radius)*2)] ring bg-default px-3 py-2 text-left transition-shadow"
        :class="[
          invalid.includes(id) ? 'ring-2 ring-error' : selected === id ? 'ring-2 ring-primary' : 'ring-default',
        ]"
        :style="{ width: `${NODE_WIDTH}px`, height: `${NODE_HEIGHT}px` }"
        :data-testid="`workflow-node-${id}`"
      >
        <Handle v-if="data.type !== 'data_input' && data.type !== 'parameter_input'" type="target" :position="targetPos" />
        <Handle type="source" :position="sourcePos" />

        <div class="flex items-center justify-between gap-2">
          <UBadge
            size="xs"
            variant="subtle"
            :color="data.type === 'tool' ? 'primary' : 'neutral'"
            :icon="data.type === 'tool' ? 'i-lucide:wrench' : 'i-material-symbols:dataset'"
          >
            {{ data.type }}
          </UBadge>
          <span class="text-[10px] opacity-50">#{{ id }}</span>
        </div>

        <div class="mt-1 font-semibold text-sm text-info truncate">
          {{ data.toolName ?? data.label ?? data.annotation ?? `step ${id}` }}
        </div>
        <div class="text-xs opacity-60 truncate">
          <template v-if="data.toolVersion">
            v{{ data.toolVersion }}
          </template>
          <template v-else>
            {{ data.annotation || '—' }}
          </template>
        </div>
      </div>
    </template>
  </VueFlow>
</template>

<style scoped>
/* The handles are only there to anchor the edges; this canvas does not
   connect anything, so they are kept out of the way rather than shown. */
:deep(.vue-flow__handle) {
  opacity: 0;
}
</style>
