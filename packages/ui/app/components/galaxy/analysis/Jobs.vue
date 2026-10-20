<script setup lang="ts">
import type { AccordionItem } from '@nuxt/ui'
import type { EncodedGalaxyWorkflowParameter, JobRow } from 'nuxt-galaxy'
import { computed, toValue, useGalaxyDecodeParameters } from '#imports'
import { useGalaxyToolsInputComponents } from '../../../composables/galaxy/useGalaxyToolInputComponent'

/**
 * The recorded jobs of an analysis, each with what it ran, what it was sent
 * and what it wrote.
 *
 * Lifted out of `AnalysisHistoryPanel`, where it was inline, because the
 * graph's detail panel shows the jobs of the step a reader selected and must
 * show them **in this block** rather than in a second one that drifts from it
 * (#90, Q7). Which jobs are listed is the caller's decision: the panel hands
 * all of them, the graph hands one step's.
 *
 * **Keyed by the job row's own id, not by its `step_id`.** A step that maps
 * over a collection runs one job per element and every row carries the one
 * step's `order_index` (#84), so the three lookups this block used to make by
 * `step_id` collapsed thirty jobs into whichever row arrived last, and
 * rendered thirty accordion entries sharing one value. The step id is still
 * needed — it is what names the tool and the saved parameters — so it is
 * carried beside the job rather than used as the key.
 *
 * Self-contained rather than handed eight props: the revision's description
 * is one request shared through Pinia Colada (#87), so asking for it again
 * here reuses the panel's answer rather than fetching anything.
 */

const props = defineProps<{
  /** The jobs to list; `undefined` while the analysis is still being read. */
  jobs: JobRow[] | undefined
  /** The stored workflow the analysis ran, so the same description is reused. */
  workflowGalaxyId: string | undefined
  /** The revision it ran, which is what pins each step's tool version. */
  workflowRevision: number | undefined
  /** What the analysis was started with, keyed by step id then parameter name. */
  parameters: EncodedGalaxyWorkflowParameter
}>()

const {
  workflowSteps,
  stepToTool,
  toolsObj,
  toolInputParameters,
  unavailableByStep,
  isLoading: describingWorkflow,
  retry: retryDescription,
} = useGalaxyWorkflowDescription(
  () => props.workflowGalaxyId,
  () => props.workflowRevision,
)

const { decodedParameters: workflowParametersModel } = useGalaxyDecodeParameters(
  computed(() => props.parameters),
)

/**
 * Every job to list, in a stable order, with what names it.
 *
 * Ordered by the step and then by the job row's own id. `jobs(*)` carries no
 * `ORDER BY`, so the rows arrive in whatever order Postgres answered in and
 * the list would otherwise reshuffle between refetches — which, on a running
 * invocation refetched on every realtime event, is a list that moves under
 * the reader's cursor.
 *
 * A job of a step that ran several is numbered. Three entries reading
 * `seqtk_seq - 1.3` and nothing else are three rows a reader cannot tell
 * apart, and the element a job ran over is not recorded anywhere this block
 * can reach.
 */
const entries = computed(() => {
  const ordered = [...(props.jobs ?? [])].sort(
    (left, right) => left.step_id - right.step_id || left.id - right.id,
  )
  const totals = new Map<number, number>()
  for (const job of ordered) {
    totals.set(job.step_id, (totals.get(job.step_id) ?? 0) + 1)
  }

  const tools = toValue(toolsObj)
  const byStep = toValue(stepToTool)
  const seen = new Map<number, number>()
  return ordered.map((job) => {
    const stepId = String(job.step_id)
    const position = (seen.get(job.step_id) ?? 0) + 1
    seen.set(job.step_id, position)
    const total = totals.get(job.step_id) ?? 1
    // A job row carries a bare `tool_id` and no version, so it cannot name a
    // definition on its own — two steps may run the same tool at two
    // versions (#100). Its `step_id` is the step's order index, which is what
    // the revision pins a version by, so the step is the way round.
    const tool = tools[byStep[stepId] ?? '']
    return {
      job,
      stepId,
      value: String(job.id),
      label: `${tool?.name ?? 'no tool name'} - ${tool?.version ?? 'no tool version'}${total > 1 ? ` · ${position} of ${total}` : ''}`,
      icon: 'i-mdi:tools',
    }
  })
})

/**
 * The three sections every job has. One array rather than one per job: they
 * were identical, and building a record of copies only invited them to stop
 * being.
 */
const DETAILS: AccordionItem[] = [
  { label: 'Parameters', slot: 'parameters', icon: 'i-lucide:settings-2' },
  { label: 'Stdout', slot: 'stdout', icon: 'i-material-symbols:output' },
  { label: 'Stderr', slot: 'stderr', icon: 'i-material-symbols:error-outline-rounded' },
]

function getToolParameters(stepId: string) {
  const toolName = toValue(stepToTool)[stepId]
  return toolName === undefined ? undefined : toValue(toolInputParameters)[toolName]
}

// Shared with `InvokeForm`, which built the identical map (#87).
const toolInputParameterComponent = useGalaxyToolsInputComponents(toolsObj)
function getParametersInputComponent(stepId: string) {
  const toolName = toValue(stepToTool)[stepId]
  const components = toValue(toolInputParameterComponent)
  return toolName === undefined ? undefined : components?.[toolName]
}
</script>

<template>
  <!--
    Said rather than left blank. An analysis whose steps have not run yet
    records no job rows, and an empty space under the Jobs heading reads as a
    page that failed to load — which is the same failure as the empty icon
    #90 fixed next door.
  -->
  <p v-if="entries.length === 0" class="text-sm text-dimmed" data-testid="no-jobs">
    No jobs recorded yet.
  </p>

  <UAccordion
    v-else
    :default-value="[entries[0]?.value ?? '0']"
    :items="entries"
  >
    <template #leading="{ item }">
      <div>
        <GalaxyStatus :state="item.job.state" size="25" />
      </div>
    </template>
    <template #default="{ item }">
      <!--
        The label carries the testid rather than the trigger, which Nuxt UI
        owns: it is inside the button, so a press on it still opens the job.
      -->
      <span :data-testid="`job-trigger-${item.value}`">{{ item.label }}</span>
    </template>
    <template #body="{ item }">
      <div class="p-4">
        <UAccordion :items="DETAILS">
          <template #parameters>
            <div v-if="workflowSteps && workflowParametersModel" class="p-2">
              <!--
                This panel blocks nothing — it has no submit, and the job it
                describes has already run. Where the tool definition could
                not be read there are no labels and no widgets, so what was
                sent is shown by its raw parameter names rather than not at
                all (#96): a tool that failed is never indistinguishable from
                a tool with no parameters.
              -->
              <div v-if="unavailableByStep[item.stepId]" data-testid="step-parameters-unlabelled">
                <p class="text-sm opacity-60 px-4 py-2">
                  {{ describeUnavailableTool(unavailableByStep[item.stepId]!) }}, so these are its raw parameter names.
                  <!--
                    The description is cached without expiry, so a Galaxy
                    that was briefly unreachable when this analysis was first
                    opened would show unlabelled for the life of the tab.
                    This is the only way back.
                  -->
                  <UButton
                    data-testid="retry-workflow-description-step"
                    size="xs"
                    color="neutral"
                    variant="link"
                    :loading="describingWorkflow"
                    @click="retryDescription()"
                  >
                    Retry
                  </UButton>
                </p>
                <dl class="grid grid-cols-[auto_1fr] gap-x-4 px-4 py-2 text-sm">
                  <template v-for="(value, name) in workflowParametersModel[item.stepId]" :key="name">
                    <dt class="font-medium break-all">
                      {{ name }}
                    </dt>
                    <dd class="break-all opacity-80">
                      <!--
                        Stringified rather than interpolated: a conditional's
                        value is an object, and Vue renders one as
                        `[object Object]`.
                      -->
                      {{ typeof value === 'object' && value !== null ? JSON.stringify(value) : value }}
                    </dd>
                  </template>
                </dl>
              </div>
              <GalaxyWorkflowStep
                v-else
                variant="display"
                :workflow-step="workflowSteps[item.stepId]"
                :tool-parameters="getToolParameters(item.stepId)"
                :parameters-inputs-component="getParametersInputComponent(item.stepId)"
                :workflow-parameters-model="workflowParametersModel[item.stepId]"
              />
            </div>
          </template>
          <template #stdout>
            <div class="p-1">
              <div class="ring ring-default rounded-[calc(var(--ui-radius)*2)] p-8 overflow-x-auto">
                <pre class="text-nowrap"> {{ item.job.stdout }}</pre>
              </div>
            </div>
          </template>
          <template #stderr>
            <div class="p-1">
              <div class="ring ring-default rounded-[calc(var(--ui-radius)*2)] p-8 overflow-x-auto">
                <pre> {{ item.job.stderr }}</pre>
              </div>
            </div>
          </template>
        </UAccordion>
      </div>
    </template>
  </UAccordion>
</template>
