<script setup lang="ts">
import type { DescribedStep } from 'nuxt-galaxy'
import type { StepMark } from '../../../utils/stepMarks'
import type { GraphDirection } from '../../../utils/workflowGraph'
import type { GraphSelection } from './Graph.vue'
import { computed, ref, useTemplateRef, watch } from '#imports'
import { useDefinedBreakpoints } from '../../../composables/useDefinedBreakpoints'

/**
 * The canvas and the panel beside it (#89).
 *
 * One component for the pair because the pair is the arrangement, and it is
 * the arrangement the design settled on: a panel *beside* the canvas rather
 * than forms inside the nodes, becoming a slideover below the small-screen
 * breakpoint where there is no room for two columns (Q9).
 *
 * It takes no mode. Whichever screen mounts it supplies the steps, and #90
 * and #91 differ only in what they add to the panel through `#detail` and in
 * which per-step marks they hand the canvas.
 */

const props = withDefaults(defineProps<{
  /** The revision's steps, keyed by `order_index`, as the description endpoint answers them. */
  steps: Record<string, DescribedStep>
  /**
   * What each step of the workflow has come to, keyed as `steps` is (#90). Passed
   * straight to the canvas; omitted by a screen that is not following an
   * invocation.
   */
  marks?: Record<string, StepMark>
}>(), { marks: () => ({}) })

const { isSmallDesktopOrMobile } = useDefinedBreakpoints()

const direction = ref<GraphDirection>('LR')
const selection = ref<GraphSelection | undefined>(undefined)

const graph = useTemplateRef<{
  fit: () => void
  clearSelection: () => void
  openSubworkflow: (stepId: string) => void
} | null>('graph')

const stepCount = computed(() => Object.keys(props.steps).length)

/**
 * Whether the slideover is open.
 *
 * Driven by there being a selection rather than kept as a second flag: a node
 * press has to open the panel, and two pieces of state saying whether a step
 * is being looked at would disagree the first time one of them was set
 * elsewhere. Closing it clears the selection, so the node stops being drawn
 * as selected at the same moment its panel goes away.
 */
const detailOpen = computed({
  get: () => selection.value !== undefined,
  set: (open: boolean) => {
    if (!open) {
      graph.value?.clearSelection()
    }
  },
})

function openSubworkflow(stepId: string) {
  graph.value?.openSubworkflow(stepId)
}

// A canvas that was laid out while it had no room — inside a slideover that
// was closed, or before the column beside it appeared — is fitted to whatever
// size it has now.
watch(isSmallDesktopOrMobile, () => graph.value?.fit())
</script>

<template>
  <div class="flex flex-col gap-3" data-testid="workflow-graph-view">
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm text-dimmed">
        {{ stepCount }} step{{ stepCount === 1 ? '' : 's' }}
      </p>
      <div class="flex items-center gap-1">
        <!--
          Icon and label only. It read `LR` / `TB` on screen, which is the
          layout library's vocabulary and not a word a reader has any reason
          to know.
        -->
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          :icon="direction === 'LR' ? 'i-lucide:move-horizontal' : 'i-lucide:move-vertical'"
          :aria-label="direction === 'LR' ? 'Lay the graph out downwards' : 'Lay the graph out left to right'"
          data-testid="graph-direction"
          @click="direction = direction === 'LR' ? 'TB' : 'LR'"
        />
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide:maximize"
          aria-label="Fit the whole graph in view"
          data-testid="graph-fit"
          @click="graph?.fit()"
        />
      </div>
    </div>

    <!-- A graph needs room, and this is how much of the viewport it is given. -->
    <div class="flex gap-4 min-h-0 h-[60vh]">
      <!--
        A border rather than a ring: the canvas clips what overflows it, and a
        ring is a shadow drawn outside the box, so its edges are cut off and
        only the corners survive.
      -->
      <div class="flex-1 min-w-0 border border-default rounded-[calc(var(--ui-radius)*2)] overflow-hidden">
        <!--
          Client-only because Vue Flow measures the DOM to lay a node out, so
          there is nothing for it to render on the server.
        -->
        <ClientOnly>
          <GalaxyWorkflowGraph
            ref="graph"
            :steps="steps"
            :marks="marks"
            :direction="direction"
            @select="next => selection = next"
          />
          <template #fallback>
            <div class="size-full grid place-items-center text-sm text-dimmed">
              Loading the graph…
            </div>
          </template>
        </ClientOnly>
      </div>

      <!-- beside the canvas where there is room for two columns -->
      <div
        v-if="!isSmallDesktopOrMobile"
        class="w-80 shrink-0 overflow-y-auto pe-1"
        data-testid="graph-detail-panel"
      >
        <slot name="detail" :selection="selection" :open-subworkflow="openSubworkflow">
          <GalaxyWorkflowGraphStepDetails :selection="selection" @open="openSubworkflow" />
        </slot>
      </div>
    </div>

    <!--
      And a slideover below it (Q9). Rendered only on that side of the
      breakpoint rather than always: two copies of the panel would mean two
      copies of whatever a screen slots into it, and #90 slots a live job
      block in here.
    -->
    <USlideover
      v-if="isSmallDesktopOrMobile"
      v-model:open="detailOpen"
      title="Step"
      data-testid="graph-detail-slideover"
    >
      <template #body>
        <slot name="detail" :selection="selection" :open-subworkflow="openSubworkflow">
          <GalaxyWorkflowGraphStepDetails :selection="selection" @open="openSubworkflow" />
        </slot>
      </template>
    </USlideover>
  </div>
</template>
