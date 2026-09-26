<script setup lang="ts">
import type { VueFlowStore } from '@vue-flow/core'
import { layout as dagreLayout, Graph } from '@dagrejs/dagre'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { Handle, Position, VueFlow } from '@vue-flow/core'

/**
 * The part of a step this canvas reads, as the description endpoint answers
 * it. A subset of `DescribedStep`, declared here so the prototype stays a
 * playground-only file.
 *
 * `input_connections` is the stored definition's spelling, keyed by the name
 * of the input it feeds, one connection or an array of them — the live API's
 * `input_steps` cannot express an input fed by two upstream outputs (#88).
 */
export interface FormGraphStep {
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
    steps: Record<string, FormGraphStep>
    /** What to call a step, by step id — an input step's own name. */
    labels?: Record<string, string>
    /** Steps the last submission refused, drawn with an error ring. */
    invalid?: string[]
    /** Steps whose form is unfolded. A folded node is its header alone. */
    open?: string[]
    direction?: 'LR' | 'TB'
  }>(),
  { labels: () => ({}), invalid: () => [], open: () => [], direction: 'LR' },
)

const emit = defineEmits<{ toggle: [stepId: string] }>()

/**
 * Dagre is told how big a node is before the node exists, and a form's height
 * is whatever the tool declares — so the first pass guesses and the second
 * one measures.
 *
 * `BODY_MAX_HEIGHT` caps the guess and the render alike: a long tool form
 * scrolls inside its node rather than growing a node taller than the canvas.
 * A short one, like a single dataset picker, is left short instead of being
 * padded out to the cap, which is what `measured` below is for.
 */
const NODE_WIDTH = 380
const HEADER_HEIGHT = 52
const BODY_MAX_HEIGHT = 300

function shortToolName(toolId: string | null) {
  const parts = toolId?.split('/')
  return parts && parts.length >= 2 ? parts[parts.length - 2] : toolId
}

/**
 * What each node actually came to once rendered, by id. Empty until the first
 * measurement, and emptied whenever folding changes what a node contains.
 */
const measured = ref<Record<string, number>>({})

function nodeHeight(stepId: string) {
  return measured.value[stepId]
    ?? (props.open.includes(stepId) ? HEADER_HEIGHT + BODY_MAX_HEIGHT : HEADER_HEIGHT)
}

const sourcePos = computed(() => (props.direction === 'LR' ? Position.Right : Position.Bottom))
const targetPos = computed(() => (props.direction === 'LR' ? Position.Left : Position.Top))

/**
 * Nodes and edges, laid out by dagre. Recomputed when a form is unfolded,
 * because unfolding changes how tall a node is and therefore where every node
 * after it belongs — which is also what makes this layout discard a node the
 * reader has dragged by hand.
 */
const graph = computed(() => {
  const entries = Object.entries(props.steps)

  const nodes = entries.map(([stepId, step]) => ({
    id: stepId,
    type: 'step',
    position: { x: 0, y: 0 },
    sourcePosition: sourcePos.value,
    targetPosition: targetPos.value,
    data: {
      stepId,
      step,
      type: step.type,
      label: props.labels[stepId],
      annotation: step.annotation,
      toolName: shortToolName(step.tool_id),
      toolVersion: step.tool_version,
    },
  }))

  const edges = entries.flatMap(([stepId, step]) =>
    Object.entries(step.input_connections ?? {}).flatMap(([inputName, value]) =>
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
  g.setGraph({ rankdir: props.direction, nodesep: 48, ranksep: 120, marginx: 24, marginy: 24 })
  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: nodeHeight(node.id) })
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }
  dagreLayout(g)

  return {
    nodes: nodes.map((node) => {
      const { x, y } = g.node(node.id)
      return { ...node, position: { x: x - NODE_WIDTH / 2, y: y - nodeHeight(node.id) / 2 } }
    }),
    edges,
  }
})

const flow = ref<VueFlowStore | undefined>(undefined)

function onPaneReady(instance: VueFlowStore) {
  flow.value = instance
}

/**
 * Read back the heights Vue Flow measured and lay the graph out again with
 * them. Written only when a height actually changed, so the pass that follows
 * a measurement does not measure the same thing and run again.
 */
function syncMeasured() {
  const instance = flow.value
  if (!instance) {
    return
  }
  const next: Record<string, number> = {}
  // `getNodes` reaches here already unwrapped through the reactive store, so
  // it is read with `toValue` rather than `.value`.
  for (const node of toValue(instance.getNodes)) {
    const height = node.dimensions?.height
    if (height) {
      next[node.id] = height
    }
  }
  const ids = Object.keys(next)
  const changed = ids.length !== Object.keys(measured.value).length
    || ids.some(id => measured.value[id] !== next[id])
  if (changed) {
    measured.value = next
  }
}

function onNodesInitialized() {
  syncMeasured()
  nextTick(fit)
}

// Folding changes what a node holds, so the height remembered for it is no
// longer its height: dropped, guessed once, then measured again.
watch(() => props.open, () => {
  measured.value = {}
  nextTick(() => requestAnimationFrame(syncMeasured))
}, { deep: true })

/**
 * Fitted no closer than 1:1. A form is the content here, so a canvas that
 * zoomed in to fill the space would leave the fields larger than the rest of
 * the application, and one that zoomed out to fit a long workflow would leave
 * them unreadable — which is the whole argument against this variant.
 */
function fit() {
  flow.value?.fitView({ padding: 0.12, maxZoom: 1, duration: 300 })
}

/** Bring named steps into view, for a refusal the reader cannot see. */
function focus(stepIds: string[]) {
  if (stepIds.length > 0) {
    flow.value?.fitView({ nodes: stepIds, padding: 0.25, maxZoom: 1, duration: 400 })
  }
}

defineExpose({ focus, fit })

watch(() => props.direction, () => nextTick(fit))
</script>

<template>
  <VueFlow
    :nodes="graph.nodes"
    :edges="graph.edges"
    :min-zoom="0.3"
    :max-zoom="1.5"
    :nodes-connectable="false"
    :elements-selectable="true"
    :only-render-visible-elements="false"
    :delete-key-code="null"
    class="size-full"
    @pane-ready="onPaneReady"
    @nodes-initialized="onNodesInitialized"
  >
    <Background :gap="16" pattern-color="var(--ui-border)" />
    <Controls :show-interactive="false" />

    <template #node-step="{ id, data }">
      <div
        class="rounded-[calc(var(--ui-radius)*2)] border bg-default text-left overflow-hidden"
        :class="invalid.includes(id) ? 'border-error ring-1 ring-error' : 'border-default'"
        :style="{ width: `${NODE_WIDTH}px` }"
        :data-testid="`form-node-${id}`"
      >
        <Handle v-if="data.type !== 'data_input' && data.type !== 'parameter_input'" type="target" :position="targetPos" />
        <Handle type="source" :position="sourcePos" />

        <!--
          The header is the drag handle: everything below it carries `nodrag`,
          so a pointer that lands on a field belongs to the field.
        -->
        <header
          class="flex items-center gap-2 px-3 border-b border-default cursor-grab active:cursor-grabbing"
          :style="{ height: `${HEADER_HEIGHT}px` }"
        >
          <UBadge
            size="xs"
            variant="subtle"
            :color="data.type === 'tool' ? 'primary' : 'neutral'"
            :icon="data.type === 'tool' ? 'i-lucide:wrench' : 'i-material-symbols:dataset'"
          >
            {{ data.type }}
          </UBadge>

          <div class="min-w-0 grow">
            <div class="font-semibold text-sm text-info truncate">
              {{ data.toolName ?? data.label ?? data.annotation ?? `step ${id}` }}
            </div>
            <div v-if="data.toolVersion" class="text-xs opacity-60 truncate">
              v{{ data.toolVersion }}
            </div>
          </div>

          <UButton
            class="nodrag"
            size="xs"
            variant="ghost"
            color="neutral"
            :icon="open.includes(id) ? 'i-lucide:chevron-up' : 'i-lucide:chevron-down'"
            :aria-label="open.includes(id) ? 'Fold this step' : 'Unfold this step'"
            :data-testid="`form-node-toggle-${id}`"
            @click.stop="emit('toggle', id)"
          />
        </header>

        <!--
          `nodrag` keeps a pointer on a field from dragging the node; `nowheel`
          keeps the wheel inside this box instead of zooming the canvas. Both
          are Vue Flow's own class names, and without them a form on a canvas
          is unusable.
        -->
        <div
          v-if="open.includes(id)"
          class="nodrag nowheel overflow-y-auto px-3 py-3"
          :style="{ maxHeight: `${BODY_MAX_HEIGHT}px` }"
        >
          <slot name="node" :step-id="id" :step="data.step" />
        </div>
      </div>
    </template>
  </VueFlow>
</template>

<style scoped>
/* The handles only anchor the edges; nothing is connected on this canvas. */
:deep(.vue-flow__handle) {
  opacity: 0;
}
</style>
