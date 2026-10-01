<script setup lang="ts">
import type { VueFlowStore } from '@vue-flow/core'
import type { DescribedStep } from 'nuxt-galaxy'
import type { StepMark } from '../../../utils/stepMarks'
import type { GraphDirection, WorkflowGraphNodeData } from '../../../utils/workflowGraph'
import { computed, nextTick, ref, useId, watch } from '#imports'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { Handle, Panel, useVueFlow, VueFlow } from '@vue-flow/core'
import { stepKind } from '../../../utils/stepKind'
import { stepMarkSummary, UNMARKED_STEP } from '../../../utils/stepMarks'
import { stepStateAccent, stepStateLook } from '../../../utils/stepStateLook'
import { anchorAlong, animatedEdges, handleSides, stepsAtPath, subworkflowTrail, workflowGraph } from '../../../utils/workflowGraph'

/**
 * A workflow revision drawn as a graph (#89).
 *
 * **One canvas, and it takes no mode** (Q2'). It knows nothing about whether
 * a workflow is being followed or started: what differs between those two is
 * only which per-step marks are supplied (#90), and a canvas handed none
 * draws exactly what #89 drew. What it does know is the shape — one node per
 * step, one edge per connection,
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
  /**
   * What each step of the workflow has come to, keyed as `steps` is (#90).
   *
   * Of the **workflow itself**, never of a subworkflow: see `markedSteps`.
   * Omitted by whichever screen is not following an invocation, and then no
   * node carries a run state at all.
   */
  marks?: Record<string, StepMark>
}>(), { direction: 'LR', marks: () => ({}) })

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

/**
 * Straight from the store rather than through `flow`, which waits on
 * `pane-ready`: fitting needs a viewport with a size, measuring a node does
 * not. `<VueFlow :id>` finds this same store by its id.
 */
const { updateNodeInternals } = useVueFlow(flowId)

/** The subworkflows drilled into, so a reader can get back out again. */
const trail = computed(() => subworkflowTrail(props.steps, path.value))

/**
 * The path actually drawn, which is the trail's and not `path`'s.
 *
 * `subworkflowTrail` stops where a path stops resolving, so this is the
 * deepest level still drawable. Drawing at the raw path instead left a reader
 * on a blank canvas **with no breadcrumb to leave by**: `stepsAtPath` answered
 * nothing, and the trail — being empty — hid the way out. Reachable whenever
 * the description is refetched and the revision no longer declares the step
 * that was drilled into.
 */
const drawnPath = computed(() => trail.value.map(crumb => crumb.stepId))

/** The steps of the level being drawn, or the workflow itself at the root. */
const levelSteps = computed(() => stepsAtPath(props.steps, drawnPath.value) ?? {})

/**
 * The marks that apply to the level being drawn, which is none below the
 * root.
 *
 * A nested step's `order_index` collides with an outer step's — they are
 * both 0, 1, 2 — and a job row's `step_id` is the **outer** one's: #119
 * records a subworkflow's jobs against the step that embeds them, not
 * against the nested step that ran them. Handed straight down, the marks
 * would put real states on the wrong steps, which is worse than putting
 * none on any. Marking the nested steps themselves would need the row to
 * carry a step `path` rather than an index (#124).
 */
const markedSteps = computed(() => (drawnPath.value.length === 0 ? props.marks : {}))

/**
 * The shape, which depends on the steps and the direction and on nothing
 * else — so the array handed to Vue Flow is the *same* one however the jobs
 * move. Vue Flow re-parses a changed `nodes` array and
 * `Object.assign(existingNode, node)` writes the laid-out position back over
 * a dragged one (`vue-flow-core.mjs:3573`), so recomputing this when a mark
 * changes would undo a reader's drag on every realtime refetch (Q6).
 */
const graph = computed(() => workflowGraph(levelSteps.value, props.direction))

/** The edges, which do move with the jobs — an edge has no position to lose. */
const edges = computed(() => animatedEdges(graph.value.edges, markedSteps.value))

/**
 * What to draw on each node beyond its shape, resolved once per render.
 *
 * A record rather than six lookups per node in the template: the state, its
 * drawing, its colour and its badge were each looked up separately, most of
 * them behind a `!`, and six lookups of one thing are six chances to look up
 * different things.
 */
const nodeStates = computed(() => {
  const marks = markedSteps.value
  return Object.fromEntries(graph.value.nodes.map((node) => {
    const mark = marks[node.id] ?? UNMARKED_STEP
    return [node.id, {
      state: mark.state,
      look: stepStateLook(mark.state),
      accent: stepStateAccent(mark.state) ?? 'transparent',
      summary: stepMarkSummary(mark),
    }]
  }))
})

/**
 * Where the handles sit, which is what actually routes an edge: Vue Flow
 * measures the handle and falls back to bottom-and-top when it cannot, so a
 * handle on the wrong side is an edge drawn round the outside of its node.
 *
 * Through `handleSides` rather than a ternary of its own, so the sides the
 * nodes declare and the sides the handles are drawn on are one decision.
 */
const sides = computed(() => handleSides(props.direction))

/**
 * Where one of several anchors sits along the side of a node.
 *
 * Vue Flow stacks every handle of a side at the same point unless it is told
 * otherwise, and stacked anchors are what made two edges look like one.
 */
function anchorOffset(index: number, count: number): Record<string, string> {
  const along = `${anchorAlong(index, count) * 100}%`
  return props.direction === 'LR' ? { top: along } : { left: along }
}

/**
 * The anchors to draw on one side of a node, always at least one.
 *
 * A node with no handle at all is one Vue Flow can route no edge to, so a
 * step nothing feeds and nothing reads still gets an unnamed anchor: a
 * single-step workflow would otherwise render handle-less and then refuse an
 * edge the moment something fed it.
 *
 * Out of the template because the two sides were an unreadable nested
 * ternary in a `v-for` expression, and because a typed array is what lets
 * `anchorOffset` be handed a number rather than Vue's `string | number`.
 */
function anchorsOn(data: WorkflowGraphNodeData, side: 'source' | 'target'): string[] {
  if (side === 'target' && !data.acceptsInput) {
    return []
  }
  const named = side === 'source' ? data.sourceHandles : data.targetHandles
  return named.length > 0 ? named : ['']
}

/**
 * What a reader is told about a connection that could not be drawn.
 *
 * A function rather than an expression in the template: stated inline, the
 * singular/plural rule appeared four times in one attribute and could not be
 * read at all.
 */
function describeDangling(dangling: readonly string[]): { title: string, description: string } {
  const several = dangling.length > 1
  return {
    title: `${dangling.length} connection${several ? 's' : ''} could not be drawn`,
    description: `${dangling.join(', ')} — ${several ? 'these connections name steps' : 'this connection names a step'} `
      + `this workflow does not declare, so the graph above is missing ${several ? 'them' : 'it'}. `
      + 'Republishing this version is what mends it.',
  }
}

const flow = ref<VueFlowStore | undefined>(undefined)

function onPaneReady(instance: VueFlowStore) {
  flow.value = instance
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
  emit('select', { stepId, step, path: [...drawnPath.value], level: levelSteps.value })
}

/**
 * Open a subworkflow node: draw that subworkflow's own graph.
 *
 * The selection goes with the level, because the step that was selected is
 * not on the canvas any more.
 */
function open(stepId: string) {
  // The step has to exist *and* embed a workflow. Testing only for `null`
  // let an unknown id through — `undefined` is not `null` — and pushed it
  // onto the path, which drew nothing and hid the breadcrumb with it.
  if (levelSteps.value[stepId]?.subworkflow == null) {
    return
  }
  path.value = [...drawnPath.value, stepId]
  select(undefined)
}

/** Back out to a level already on the trail, or to the workflow itself. */
function goTo(to: readonly string[]) {
  path.value = [...to]
  select(undefined)
}

defineExpose({
  fit,
  clearSelection: () => select(undefined),
  /** Draw a subworkflow's own graph, as pressing the node's own control does. */
  openSubworkflow: open,
})

/**
 * A different revision is a different graph, so nothing about where the
 * reader had got to in the last one survives.
 *
 * Keyed on the steps' **uuids**, not on the object and not on their ids. Not
 * the object, because the description is refetched whenever the Retry beside
 * an unavailable tool is pressed and a new object describing the same
 * revision must not throw away the subworkflow a reader is looking at. Not
 * the ids either, which was the first attempt: those are `order_index`es, so
 * any two workflows of the same length have the same ones — and since the
 * analysis page mounts this panel without a `:key`, routing from one analysis
 * to another reused the component and kept the first one's drill-down.
 */
watch(
  () => Object.values(props.steps).map(step => step.uuid).join(','),
  () => {
    path.value = []
    select(undefined)
  },
)

// Re-laying out moves every node at once, so the view is fitted again rather
// than left pointing at where the graph used to be.
watch([() => props.direction, drawnPath], () => nextTick(fit))

/**
 * A new graph has Vue Flow measure every anchor again (#122).
 *
 * A level's nodes are keyed by order index, so drilling in, backing out or a
 * different revision redraws a node as another step: its anchors at other
 * offsets, and often at another height. Vue Flow keeps the offsets it
 * measured and routes each edge to them. Its ResizeObserver re-measures a
 * node that changed size, but never anchors that moved inside one that did
 * not.
 *
 * `flush: 'post'`, so it runs once the new level is rendered and before the
 * fit above, which waits for the tick after: a level framed before it is
 * measured is framed by the sizes of the one before it.
 */
watch(graph, () => updateNodeInternals(), { flush: 'post' })
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
    :edges="edges"
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
        v-bind="describeDangling(graph.dangling)"
      />
    </Panel>

    <template #node-step="{ id, data }">
      <!--
        `border-s-4` is always drawn and the colour is what changes, so a
        marked node is not a different width from an unmarked one — a graph
        whose nodes reflow the moment an invocation starts is a graph that
        cannot be watched. `transparent` is the unmarked colour.
      -->
      <div
        class="size-full rounded-[calc(var(--ui-radius)*2)] ring bg-default px-3 py-2 text-left border-s-4"
        :class="selectedStepId === id ? 'ring-2 ring-primary' : 'ring-default'"
        :style="{ borderInlineStartColor: nodeStates[id]?.accent }"
        :data-testid="`workflow-node-${id}`"
        :data-state="nodeStates[id]?.state"
      >
        <!--
          One anchor per output, and one per input something feeds, spaced
          along the node's edge. A single pair per node drew the two edges of
          a fan-in as one line with both labels stacked on it — present in
          the DOM, indistinguishable on screen, which is the failure a graph
          cannot signal.

          A step with no anchors still gets one, unnamed: a node with no
          handle at all is one Vue Flow can route no edge to, and a workflow
          of one step would otherwise render handle-less and then refuse an
          edge the moment something fed it.
        -->
        <Handle
          v-for="(inputName, index) in anchorsOn(data, 'target')"
          :id="inputName || undefined"
          :key="`target-${inputName}`"
          type="target"
          :position="sides.target"
          :style="anchorOffset(index, anchorsOn(data, 'target').length)"
        />
        <Handle
          v-for="(outputName, index) in anchorsOn(data, 'source')"
          :id="outputName || undefined"
          :key="`source-${outputName}`"
          type="source"
          :position="sides.source"
          :style="anchorOffset(index, anchorsOn(data, 'source').length)"
        />

        <div class="flex items-center justify-between gap-2">
          <!--
            The glossary's word for what kind of step this is, never Galaxy's
            identifier: a badge reading `data_input` puts an API field name in
            front of a reader. Colour and icon come from the same map, which
            is also what stops them being two ternary cascades over the same
            booleans.
          -->
          <UBadge
            size="xs"
            variant="subtle"
            :color="stepKind(data.step.type).color"
            :icon="stepKind(data.step.type).icon"
          >
            {{ stepKind(data.step.type).word }}
          </UBadge>
          <div class="flex items-center gap-1">
            <!--
              What the step is doing, as an icon with the word on it rather
              than a second badge: the header already carries the kind badge
              and there is no room for two, and the accent down the side is
              what carries the colour at a glance. `aria-label` and `title`
              are the word itself, so the phase is never colour alone.
            -->
            <UIcon
              v-if="nodeStates[id]?.look"
              :name="nodeStates[id]!.look!.icon"
              class="size-4"
              :style="{ color: nodeStates[id]!.accent }"
              role="img"
              :aria-label="nodeStates[id]!.look!.word"
              :title="nodeStates[id]!.look!.word"
              :data-testid="`node-mark-${id}`"
            />
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
        <div class="flex items-center justify-between gap-1">
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
          <!--
            A mapped step is one step and many jobs, so no single state is
            true of it and the counts are what it is drawn with (Q18). Only
            when there is more than one job: "1/1 ok" beside a node already
            coloured Done is noise.
          -->
          <UBadge
            v-if="nodeStates[id]?.summary"
            size="xs"
            variant="soft"
            class="shrink-0"
            :color="nodeStates[id]!.look?.color ?? 'neutral'"
            :data-testid="`node-count-${id}`"
          >
            {{ nodeStates[id]!.summary }}
          </UBadge>
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
