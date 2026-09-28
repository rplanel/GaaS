<script setup lang="ts">
import type { VueFlowStore } from '@vue-flow/core'
import type { DescribedStep } from 'nuxt-galaxy'
import type { GraphDirection } from '../../../utils/workflowGraph'
import { computed, nextTick, ref, useId, watch } from '#imports'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { Handle, Panel, VueFlow } from '@vue-flow/core'
import { handleSides, NODE_HEIGHT, NODE_WIDTH, stepsAtPath, subworkflowTrail, workflowGraph } from '../../../utils/workflowGraph'

/**
 * A workflow revision drawn as a graph (#89).
 *
 * **One canvas, and it takes no mode** (Q2'). It knows nothing about whether
 * a workflow is being followed or started: what differs between those two is
 * only which per-step marks are supplied, and the marks are #90's. What it
 * does know is the shape — one node per step, one edge per connection,
 * including an input fed by several upstream outputs, which is the failure a
 * graph cannot signal and the reason the stored definition is the source
 * (Q12).
 *
 * Nothing here talks to a server. The steps are handed in, as
 * `useGalaxyWorkflowDescription` answers them, so the canvas is the same
 * component whichever screen supplies them.
 */

export interface GraphSelection {
  /** The step's key at the level it was selected on: its `order_index`. */
  stepId: string
  step: DescribedStep
  /**
   * The subworkflow steps drilled into, outermost first; empty for a step of
   * the workflow itself.
   *
   * Only an empty path names a step anything outside the definition can be
   * joined to: a job row's `step_id` is the *outer* step's order index, so a
   * nested step has no row of its own and nothing to mark (#90).
   */
  path: string[]
  /**
   * Every step of the level this one was selected on, so that whatever
   * renders the selection can name the steps feeding it without knowing how
   * deep the canvas has been drilled.
   */
  level: Record<string, DescribedStep>
}

const props = withDefaults(defineProps<{
  /** The revision's steps, keyed by `order_index`, as the description endpoint answers them. */
  steps: Record<string, DescribedStep>
  direction?: GraphDirection
}>(), { direction: 'LR' })

const emit = defineEmits<{
  select: [selection: GraphSelection | undefined]
}>()

/**
 * Which subworkflow the canvas is inside, outermost first.
 *
 * Owned here rather than by the screen around it: a subworkflow step is one
 * node that links out to that subworkflow's own graph (Q19), and the graph it
 * links to is drawn by this same component from the definition it already
 * holds. There is nothing to fetch and nowhere else to navigate to — the
 * nested export carries a name and a uuid but no stored workflow id, so it
 * cannot be looked up on Galaxy at all.
 */
const path = ref<string[]>([])
const selectedStepId = ref<string | undefined>(undefined)

/**
 * A distinct Vue Flow store per instance.
 *
 * `useVueFlow` keys its store by id and shares it between instances given the
 * same one, so two canvases on one page would otherwise drive each other's
 * viewport.
 */
const flowId = `workflow-graph-${useId()}`

/** The steps of the level being drawn, or the workflow itself at the root. */
const levelSteps = computed(() => stepsAtPath(props.steps, path.value) ?? {})

const graph = computed(() => workflowGraph(levelSteps.value, props.direction))

/** The subworkflows drilled into, so a reader can get back out again. */
const trail = computed(() => subworkflowTrail(props.steps, path.value))

/**
 * Where the handles sit, which is what actually routes an edge: Vue Flow
 * measures the handle and falls back to bottom-and-top when it cannot, so a
 * handle on the wrong side is an edge drawn round the outside of its node.
 *
 * Through `handleSides` rather than a ternary of its own, so the sides the
 * nodes declare and the sides the handles are drawn on are one decision.
 */
const sides = computed(() => handleSides(props.direction))

const flow = ref<VueFlowStore | undefined>(undefined)

function onPaneReady(instance: VueFlowStore) {
  flow.value = instance
}

/**
 * Bring named steps into view.
 *
 * A canvas can hold a node off-screen, or at a zoom nobody can read, which a
 * form never could — so anything that needs to point at a step has to be able
 * to move the view onto it rather than leave the reader to find it. #91 marks
 * the steps that would refuse a submission and needs exactly this.
 */
function focus(stepIds: string[]) {
  if (stepIds.length > 0) {
    flow.value?.fitView({ nodes: stepIds, padding: 0.4, duration: 400, maxZoom: 1.2 })
  }
}

function fit() {
  flow.value?.fitView({ padding: 0.15, duration: 300 })
}

function select(stepId: string | undefined) {
  selectedStepId.value = stepId
  const step = stepId === undefined ? undefined : levelSteps.value[stepId]
  if (stepId === undefined || step === undefined) {
    emit('select', undefined)
    return
  }
  emit('select', { stepId, step, path: [...path.value], level: levelSteps.value })
}

/**
 * Open a subworkflow node: draw that subworkflow's own graph.
 *
 * The selection goes with the level, because the step that was selected is
 * not on the canvas any more.
 */
function open(stepId: string) {
  if (levelSteps.value[stepId]?.subworkflow === null) {
    return
  }
  path.value = [...path.value, stepId]
  select(undefined)
}

/** Back out to a level already on the trail, or to the workflow itself. */
function goTo(to: readonly string[]) {
  path.value = [...to]
  select(undefined)
}

defineExpose({
  focus,
  fit,
  clearSelection: () => select(undefined),
  /** Draw a subworkflow's own graph, as pressing the node's own control does. */
  openSubworkflow: open,
})

/**
 * A different workflow is a different graph, so nothing about where the
 * reader had got to in the last one survives.
 *
 * Keyed on the step *ids*, not on the object: the description is refetched
 * whenever the Retry beside an unavailable tool is pressed, and a new object
 * describing the same revision must not throw away the subworkflow a reader
 * is looking at.
 */
watch(
  () => Object.keys(props.steps).join(','),
  () => {
    path.value = []
    select(undefined)
  },
)

// Re-laying out moves every node at once, so the view is fitted again rather
// than left pointing at where the graph used to be.
watch([() => props.direction, path], () => nextTick(fit))
</script>

<template>
  <!--
    `nodes-draggable` is on and no position is written anywhere (Q6): a reader
    may pull a node aside to read what it overlaps, and the next render lays
    the graph out again from the definition. Saving the positions would mean a
    stored layout of a revision that cannot change and a reader who can never
    get the computed one back.
  -->
  <VueFlow
    :id="flowId"
    :nodes="graph.nodes"
    :edges="graph.edges"
    :min-zoom="0.2"
    :max-zoom="2"
    :nodes-draggable="true"
    :nodes-connectable="false"
    :elements-selectable="true"
    :only-render-visible-elements="false"
    :delete-key-code="null"
    class="size-full"
    data-testid="workflow-graph"
    @pane-ready="onPaneReady"
    @nodes-initialized="fit"
    @node-click="({ node }) => select(node.id)"
    @pane-click="() => select(undefined)"
  >
    <Background :gap="16" pattern-color="var(--ui-border)" />
    <Controls :show-interactive="false" />

    <!--
      The trail into a subworkflow. Shown only when there is one, so the root
      graph is not permanently overlaid by a single crumb saying nothing.
    -->
    <Panel v-if="trail.length > 0" position="top-left">
      <nav class="flex items-center gap-1 text-xs" aria-label="Subworkflow trail">
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide:workflow"
          data-testid="graph-trail-root"
          @click="goTo([])"
        >
          Workflow
        </UButton>
        <template v-for="crumb in trail" :key="crumb.stepId">
          <UIcon name="i-lucide:chevron-right" class="size-3 opacity-50" />
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            :data-testid="`graph-trail-${crumb.path.join('-')}`"
            @click="goTo(crumb.path)"
          >
            {{ crumb.label }}
          </UButton>
        </template>
      </nav>
    </Panel>

    <!--
      A connection naming a step this level does not hold is drawn nowhere, so
      it is said in words. Galaxy cannot export one; reaching this means the
      stored definition disagrees with itself, and the one thing that must not
      happen is the remaining edges being read as all of them.
    -->
    <Panel v-if="graph.dangling.length > 0" position="top-right">
      <UAlert
        color="warning"
        variant="subtle"
        icon="i-lucide:unlink"
        class="max-w-xs"
        data-testid="graph-dangling"
        :title="`${graph.dangling.length} connection${graph.dangling.length > 1 ? 's' : ''} could not be drawn`"
        :description="`${graph.dangling.join(', ')} — ${graph.dangling.length > 1 ? 'these connections name steps' : 'this connection names a step'} this workflow does not declare, so the graph above is missing ${graph.dangling.length > 1 ? 'them' : 'it'}. Republishing this version is what mends it.`"
      />
    </Panel>

    <template #node-step="{ id, data }">
      <div
        class="rounded-[calc(var(--ui-radius)*2)] ring bg-default px-3 py-2 text-left"
        :class="selectedStepId === id ? 'ring-2 ring-primary' : 'ring-default'"
        :style="{ width: `${NODE_WIDTH}px`, height: `${NODE_HEIGHT}px` }"
        :data-testid="`workflow-node-${id}`"
      >
        <Handle v-if="data.acceptsInput" type="target" :position="sides.target" />
        <Handle type="source" :position="sides.source" />

        <div class="flex items-center justify-between gap-2">
          <UBadge
            size="xs"
            variant="subtle"
            :color="data.isSubworkflow ? 'info' : data.acceptsInput ? 'primary' : 'neutral'"
            :icon="data.isSubworkflow ? 'i-lucide:workflow' : data.acceptsInput ? 'i-lucide:wrench' : 'i-material-symbols:dataset'"
          >
            {{ data.step.type }}
          </UBadge>
          <div class="flex items-center gap-1">
            <!--
              What makes a subworkflow node link out. On the node rather than
              only in the detail panel, because the node is what a reader
              sees: `nodrag` so that pressing it does not start a drag, and a
              real button so it is reachable by keyboard.
            -->
            <UButton
              v-if="data.isSubworkflow"
              class="nodrag"
              size="xs"
              variant="soft"
              color="info"
              icon="i-lucide:arrow-right-to-line"
              :aria-label="`Open the subworkflow ${data.label}`"
              :data-testid="`open-subworkflow-${id}`"
              @click.stop="open(id)"
            />
            <span class="text-[10px] opacity-50">#{{ id }}</span>
          </div>
        </div>

        <div class="mt-1 font-semibold text-sm truncate" :title="data.label">
          {{ data.label }}
        </div>
        <div class="text-xs opacity-60 truncate" :title="data.toolName ?? data.annotation ?? ''">
          <template v-if="data.toolName">
            {{ data.toolName }}<template v-if="data.toolVersion">
              · {{ data.toolVersion }}
            </template>
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
/* The handles are only there to anchor the edges; this canvas connects
   nothing, so they are kept out of the way rather than shown. */
:deep(.vue-flow__handle) {
  opacity: 0;
}
</style>
