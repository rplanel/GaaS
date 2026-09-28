<script setup lang="ts">
import type { GraphSelection } from './Graph.vue'
import { computed } from '#imports'
import { stepNodeLabel, toolDisplayName } from '../../../utils/workflowGraph'

/**
 * What the panel beside the canvas says about the selected step (#89).
 *
 * The panel is where a form goes when a step is being given its parameters
 * (#91) and where its jobs go when it is being followed (#90). Neither is
 * here: this ticket draws the shape, so what the panel shows is what the
 * definition says about one step — including the edges feeding it, which is
 * the one thing a reader cannot get off a node.
 *
 * It sits *beside* the canvas rather than inside a node because a prototype
 * settled it: the zoom that fits a form in a node is the zoom that makes it
 * unreadable, and a teleported dropdown renders at page scale over a node
 * drawn at canvas scale.
 */

const props = defineProps<{ selection: GraphSelection | undefined }>()

const emit = defineEmits<{ open: [stepId: string] }>()

/**
 * Every edge feeding the selected step, named by the step it comes from.
 *
 * The upstream step is named by its own label rather than by its index alone,
 * because the index is what the node shows and the label is what the reader
 * recognises. Both, in fact: `#3 Align the reads` reads as the node does.
 */
const incoming = computed(() => {
  const selection = props.selection
  if (selection === undefined) {
    return []
  }
  return Object.entries(selection.step.input_connections ?? {}).flatMap(([inputName, value]) =>
    // One or several per input, whichever shape the export wrote (#82).
    (Array.isArray(value) ? value : [value]).map((connection) => {
      const from = selection.level[String(connection.id)]
      return {
        key: `${connection.id}:${connection.output_name}->${inputName}`,
        inputName,
        fromStepId: String(connection.id),
        fromLabel: from === undefined ? null : stepNodeLabel(from),
        outputName: connection.output_name,
      }
    }),
  )
})

const toolName = computed(() => {
  const toolId = props.selection?.step.tool_id
  return toolId === undefined || toolId === null ? null : toolDisplayName(toolId)
})

const nestedStepCount = computed(() =>
  Object.keys(props.selection?.step.subworkflow?.steps ?? {}).length,
)
</script>

<template>
  <div class="flex flex-col gap-4" data-testid="graph-step-details">
    <p v-if="selection === undefined" class="text-sm text-dimmed">
      Select a step on the canvas to see what it runs and what feeds it.
    </p>

    <template v-else>
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h3 class="font-semibold truncate" :title="stepNodeLabel(selection.step)">
            {{ stepNodeLabel(selection.step) }}
          </h3>
          <p v-if="toolName" class="text-xs text-dimmed truncate">
            {{ toolName }}<template v-if="selection.step.tool_version">
              · {{ selection.step.tool_version }}
            </template>
          </p>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <UBadge size="xs" variant="subtle" color="neutral">
            {{ selection.step.type }}
          </UBadge>
          <span class="text-xs text-dimmed">#{{ selection.stepId }}</span>
        </div>
      </div>

      <!--
        A step of a subworkflow, not of the workflow itself. Said plainly
        because nothing outside the definition can be joined to it: a job row
        carries the *outer* step's index, so the jobs and the marks that come
        next (#90) belong to the node the reader drilled into, not to this one.
      -->
      <UAlert
        v-if="selection.path.length > 0"
        color="info"
        variant="subtle"
        size="sm"
        icon="i-lucide:workflow"
        data-testid="graph-step-nested"
        :description="`Inside the subworkflow at step #${selection.path.join(' › #')} of this workflow.`"
      />

      <p v-if="selection.step.annotation" class="text-sm">
        {{ selection.step.annotation }}
      </p>

      <!-- a subworkflow step: what it holds, and the way into it -->
      <div v-if="selection.step.subworkflow" class="flex items-center justify-between gap-2">
        <p class="text-sm">
          Runs a workflow of {{ nestedStepCount }} step{{ nestedStepCount === 1 ? '' : 's' }}.
        </p>
        <UButton
          size="xs"
          variant="soft"
          color="info"
          icon="i-lucide:arrow-right-to-line"
          data-testid="graph-open-subworkflow"
          @click="emit('open', selection.stepId)"
        >
          Open
        </UButton>
      </div>

      <div>
        <USeparator label="Fed by" />
        <p v-if="incoming.length === 0" class="text-sm text-dimmed pt-2">
          Nothing — this is where the workflow starts.
        </p>
        <dl v-else class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-2 text-sm">
          <template v-for="edge in incoming" :key="edge.key">
            <dt class="font-medium break-all">
              {{ edge.inputName }}
            </dt>
            <dd class="break-all text-dimmed">
              <!--
                A connection naming a step this level does not hold is drawn
                nowhere on the canvas, so it is named here too rather than
                shown as a blank.
              -->
              <template v-if="edge.fromLabel === null">
                #{{ edge.fromStepId }} (no such step) · {{ edge.outputName }}
              </template>
              <template v-else>
                #{{ edge.fromStepId }} {{ edge.fromLabel }} · {{ edge.outputName }}
              </template>
            </dd>
          </template>
        </dl>
      </div>

      <div>
        <USeparator label="Produces" />
        <!--
          Galaxy writes `outputs: []` on a subworkflow step even when
          something downstream reads from it, naming its real outputs in
          `workflow_outputs` instead — so an empty list here is not
          necessarily a step that produces nothing.
        -->
        <p v-if="selection.step.outputs.length === 0" class="text-sm text-dimmed pt-2">
          <template v-if="selection.step.subworkflow">
            The definition lists no outputs on a subworkflow step, whatever the workflow inside it produces.
          </template>
          <template v-else>
            Nothing this definition names.
          </template>
        </p>
        <ul v-else class="pt-2 text-sm flex flex-col gap-1">
          <li v-for="output in selection.step.outputs" :key="output.name" class="break-all">
            {{ output.name }}
            <span class="text-dimmed">· {{ output.type }}</span>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>
