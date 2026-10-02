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
 * The line is what Vue Flow's default edge drew: its bezier between the two
 * anchors it measured, through its own `BaseEdge`. So the line is unchanged,
 * and a running step's connections still flow, since Vue Flow's `animated`
 * style is on the edge it wraps this in.
 *
 * What differs is when the input name is drawn, and in which layer. Vue
 * Flow's edge drew it all the time, as SVG text at the same midpoint, on top
 * of the lines around it, and a pipe-flattened Galaxy path runs wider than a
 * step. Here it is drawn only while the connection is hovered, focused or
 * selected, through Vue Flow's HTML label layer. The step details panel
 * names every connection feeding the selected step.
 *
 * The name comes off the edge `workflowGraph` built rather than being worked
 * out here, and so will the route of #136, which is the seam it extends.
 */

const props = defineProps<EdgeProps<WorkflowGraphEdgeData>>()

const line = computed(() => {
  const [path, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    curvature: props.curvature,
  })
  return { path, labelX, labelY }
})

/**
 * The `<g>` Vue Flow wraps this edge in, which is what a reader hovers and
 * focuses: its hit area is the wide transparent stroke `BaseEdge` draws
 * alongside the line, and the `tabindex` set below is on it.
 */
const { edgeEl } = useEdge(props.id)
const hovered = useElementHover(edgeEl)
const { focused } = useFocus(edgeEl)

const nameShown = computed(() => hovered.value || focused.value || props.selected === true)

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
 * deselects it and leaves it. The two that select are spent on it, or Space
 * would also scroll the panel the canvas sits in.
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
    event.preventDefault()
    addSelectedEdges([edge])
  }
})
</script>

<template>
  <BaseEdge
    :id="id"
    :path="line.path"
    :marker-start="markerStart"
    :marker-end="markerEnd"
    :interaction-width="interactionWidth"
    :style="style"
  />
  <EdgeLabelRenderer v-if="nameShown">
    <!--
      Centred on the midpoint, and nothing in it takes the pointer: the name
      appears under the pointer, and a name that took it would hide itself
      the moment it appeared.

      Above the steps, which Vue Flow paints over its label layer, and which
      a long name centred between two ranks runs into at both ends. 1001
      clears a selected step too, which Vue Flow lifts to 1000.
    -->
    <div
      class="absolute z-[1001] pointer-events-none"
      :style="{ transform: `translate(-50%, -50%) translate(${line.labelX}px, ${line.labelY}px)` }"
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
