<script setup lang="ts">
import type { EdgeProps } from '@vue-flow/core'
import type { WorkflowGraphEdgeData } from '../../../utils/workflowGraph'
import { computed, watchEffect } from '#imports'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useEdge, useVueFlow } from '@vue-flow/core'
import { useElementHover, useEventListener, useFocus } from '@vueuse/core'

/**
 * One connection on the workflow graph, drawn by the canvas rather than by
 * Vue Flow (#135).
 *
 * The line is Vue Flow's own bezier between the two anchors, drawn through
 * Vue Flow's own `BaseEdge`, which is exactly what its default edge draws —
 * so the line is unchanged and a running step's connections still flow,
 * since Vue Flow's `animated` style is on the edge it wraps this in.
 *
 * What differs is the name. Vue Flow's edge drew the input name all the
 * time, wherever it fell, and a pipe-flattened Galaxy path runs wider than a
 * step. Here it is drawn only while the connection is hovered, focused or
 * selected, at the line's midpoint, through Vue Flow's HTML label layer. The
 * step details panel lists every connection by name for a reader who wants
 * them all at once.
 *
 * Everything drawn comes off the edge `workflowGraph` built; nothing is
 * worked out here. That is the seam the routing of #136 extends.
 */

const props = defineProps<EdgeProps<WorkflowGraphEdgeData>>()

const bezier = computed(() => getBezierPath({
  sourceX: props.sourceX,
  sourceY: props.sourceY,
  sourcePosition: props.sourcePosition,
  targetX: props.targetX,
  targetY: props.targetY,
  targetPosition: props.targetPosition,
  curvature: props.curvature,
}))

/**
 * The `<g>` Vue Flow wraps this edge in, which is what a reader hovers and
 * focuses: it carries the edge's `tabindex`, and its hit area is the wide
 * transparent stroke `BaseEdge` draws alongside the line.
 */
const { edgeEl } = useEdge(props.id)
const hovered = useElementHover(edgeEl)
const { focused } = useFocus(edgeEl)

const named = computed(() => hovered.value || focused.value || props.selected === true)

/**
 * Reaching a connection by keyboard, which Vue Flow 1.48.2 means to offer
 * and does not.
 *
 * Its edge wrapper sets `tabIndex` on an SVG `<g>`, and Vue sets that as an
 * attribute. SVG attribute names are case-sensitive, so `tabIndex` is not
 * `tabindex` and the edge is never focusable (measured in Chromium: its
 * `tabIndex` reads -1 and Tab passes it by). Its key handler is bound as
 * `onKeyDown`, which Vue listens for as a `key-down` event no browser
 * sends, so Enter never selected an edge either. Its node wrapper binds
 * `onKeydown` and works.
 *
 * So the edge is made focusable here, and the keys its wrapper meant to
 * handle are handled: Enter or Space selects the connection, Escape
 * deselects it and leaves it.
 */
watchEffect(() => edgeEl.value?.setAttribute('tabindex', '0'))

const { addSelectedEdges, findEdge, removeSelectedEdges } = useVueFlow()

useEventListener(edgeEl, 'keydown', (event: KeyboardEvent) => {
  const edge = findEdge(props.id)
  if (edge === undefined) {
    return
  }
  if (event.key === 'Escape') {
    edgeEl.value?.blur()
    removeSelectedEdges([edge])
  }
  else if (event.key === 'Enter' || event.key === ' ') {
    addSelectedEdges([edge])
  }
})
</script>

<template>
  <BaseEdge
    :id="id"
    :path="bezier[0]"
    :marker-start="markerStart"
    :marker-end="markerEnd"
    :interaction-width="interactionWidth"
    :style="style"
  />
  <EdgeLabelRenderer v-if="named">
    <!--
      Centred on the midpoint, and nothing in it takes the pointer: the
      label appears under the pointer, and a label that took it would hide
      itself the moment it appeared.
    -->
    <div
      class="absolute pointer-events-none"
      :style="{ transform: `translate(-50%, -50%) translate(${bezier[1]}px, ${bezier[2]}px)` }"
    >
      <UBadge
        size="xs"
        variant="subtle"
        color="neutral"
        data-testid="connection-name"
        :data-connection="id"
      >
        {{ data.inputName }}
      </UBadge>
    </div>
  </EdgeLabelRenderer>
</template>
