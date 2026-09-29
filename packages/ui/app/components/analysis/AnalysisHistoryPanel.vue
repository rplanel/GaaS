<script setup lang="ts">
import type { AnalysisDetail, Database, JobRow } from 'nuxt-galaxy'
import type { EncodedGalaxyWorkflowParameter } from '../../composables/galaxy/types'
import { useSupabaseClient } from '#imports'
import { stepMarks } from '../../utils/stepMarks'

const props = withDefaults(defineProps<{
  analysisId: number
}>(), {})

const analysisId = ref<number | undefined>(props.analysisId)
watch(
  () => props.analysisId,
  (newAnalysisId) => {
    analysisId.value = newAnalysisId
  },
  { immediate: true, deep: true },
)

const supabase = useSupabaseClient<Database>()

const { data: inputs, refresh: _refreshInputs } = useQuery(() =>
  analysisInputsViewByIdQuery({ analysisId: analysisId.value, supabase }),
)

const { data: analysis, refresh: _refreshAnalysis, isPending: pendingAnalysis, error } = useQuery(() =>
  analysisByIdWithDetailsQuery({ id: analysisId.value, supabase }),
)

if (error.value) {
  throw createError({
    statusCode: 500,
    statusMessage: error.value?.message || 'Error fetching analysis details',
  })
}

function refresh() {
  _refreshAnalysis()
  _refreshInputs()
}

const detailedAnalysis = computed<AnalysisDetail | undefined>(() => {
  const analysisVal = analysis.value
  return analysisVal as AnalysisDetail | undefined
})

const workflowGalaxyId = computed(() => {
  const detailedAnalysisVal = toValue(detailedAnalysis)
  if (detailedAnalysisVal) {
    return detailedAnalysisVal.workflows.galaxy_id
  }
  return undefined
})
// The revision this analysis was started against, recorded on it at start
// (#48). Asked for by name so that the steps and tools shown are the ones
// the jobs ran; Galaxy's latest revision, which the proxy describes when
// asked for none, moves with every save in its editor (#68). An analysis
// started before #48 recorded none: it ran whatever was latest at the time,
// which nothing here can recover, and the revision its workflow row is
// pinned to is the closest description this server holds. #67 lists the
// backfill that would retire the fallback.
const workflowRevision = computed(() => {
  const detailedAnalysisVal = toValue(detailedAnalysis)
  if (detailedAnalysisVal) {
    return detailedAnalysisVal.workflow_revision ?? detailedAnalysisVal.workflows.revision
  }
  return undefined
})

// Display-only refresh: this subscription re-fetches displayed rows and must not trigger Galaxy sync.
useSupabaseRealtime(`galaxy:histories:${props.analysisId}`, 'histories', refresh)
// Display-only refresh: this subscription re-fetches displayed rows and must not trigger Galaxy sync.
useSupabaseRealtime(`galaxy:jobs:${props.analysisId}`, 'jobs', refresh)
// Display-only refresh: this subscription re-fetches displayed rows and must not trigger Galaxy sync.
useSupabaseRealtime(`galaxy:analysis_outputs:${props.analysisId}`, 'analysis_outputs', refresh)

// One request for the revision and every tool it pins (#87), shared through
// Pinia Colada: the invoke form for the same revision reuses this answer
// rather than fetching 1+N times of its own — and so does `AnalysisJobs`
// below, which asks for the tools this panel no longer reads itself.
const {
  workflowSteps,
  isLoading: describingWorkflow,
  retry: retryDescription,
  error: workflowError,
} = useGalaxyWorkflowDescription(workflowGalaxyId, workflowRevision)

/**
 * Whether the revision could be described at all.
 *
 * `workflowSteps` is `{}` both while the one request is in flight and when it
 * failed, and an empty canvas reads as a workflow of no steps either way.
 */
const hasSteps = computed(() => Object.keys(toValue(workflowSteps)).length > 0)

/**
 * What the analysis was started with, keyed by step id then parameter name,
 * as `AnalysisJobs` decodes it.
 */
const analysisParameters = computed(() => {
  const analysisVal = toValue(detailedAnalysis)
  if (analysisVal?.parameters) {
    return analysisVal.parameters as unknown as EncodedGalaxyWorkflowParameter
  }
  return {} as EncodedGalaxyWorkflowParameter
})

/**
 * The recorded jobs, as `analysisByIdWithDetailsQuery` serves them.
 *
 * Listing them, naming their tools and showing what each was sent is
 * `AnalysisJobs`', not this panel's: the graph's detail panel shows the same
 * block for one step's jobs, and two copies of it would drift (#90, Q7).
 */
const jobs = computed<JobRow[] | undefined>(() => toValue(detailedAnalysis)?.jobs)

/**
 * What each step of the revision is doing, for the canvas to draw (#90, Q4).
 *
 * From the job rows this server already holds, not from Galaxy: they are
 * cached, they are joined on the step's order index — the same key the nodes
 * use — and the realtime subscription above already refetches them, so the
 * graph follows a running invocation without a second source or a poll.
 */
const marks = computed(() => stepMarks(toValue(workflowSteps), toValue(jobs)))

/**
 * The rows recorded against one step, for the panel beside the canvas.
 *
 * Several for a step that mapped over a collection (#84), which is why the
 * block that lists them is keyed by the job's own id rather than by this one.
 */
function jobsOfStep(stepId: string): JobRow[] {
  return (toValue(jobs) ?? []).filter(job => String(job.step_id) === stepId)
}

const { data: outputs, refresh: _refreshOutputs } = useQuery(() =>
  analysisOutputsViewByIdQuery({ analysisId: analysisId.value, supabase }),
)

// function enterMotion(delay: number = 0) {
//   return {
//     initial: { opacity: 0, y: 16 },
//     animate: { opacity: 1, y: 0 },
//     transition: { duration: 0.6, delay },
//   }
// }

// function scrollMotion(delay: number = 0) {
//   return {
//     initial: { opacity: 0, y: 16 },
//     whileInView: { opacity: 1, y: 0 },
//     inViewOptions: { once: true, amount: 1 },
//     transition: { duration: 0.6, delay },
//   }
// }

// function staggerMotion(index: number = 0) {
//   return {
//     initial: { opacity: 0 },
//     whileInView: { opacity: 1 },
//     inViewOptions: { once: true, amount: 1 },
//     transition: { duration: 0.6, delay: index * 0.08 },
//   }
// }

const sortedOutputs = computed(() => {
  const outputsVal = toValue(outputs)
  if (outputsVal) {
    return [...outputsVal].sort((a, b) => {
      if (a.dataset_name === null && b.dataset_name === null)
        return 0
      if (a.dataset_name === null)
        return 1
      if (b.dataset_name === null)
        return -1
      return a.dataset_name.localeCompare(b.dataset_name)
    })
  }
  return []
})
</script>

<template>
  <template v-if="pendingAnalysis">
    <div class="hidden lg:flex flex-1 items-center justify-center">
      <div class="flex items-center gap-4">
        <USkeleton class="h-20 w-20 rounded-full" />
        <div class="grid gap-2">
          <USkeleton class="h-8 w-62.5" />
          <USkeleton class="h-8 w-50" />
        </div>
      </div>
    </div>
  </template>

  <slot v-else>
    <!--
      Shown *beside* the analysis, never instead of it. Everything below —
      the inputs, the jobs and their states, stdout, stderr, the outputs —
      comes from this server's own database and needs Galaxy for nothing;
      only the tool names and parameter labels do. Replacing the page with
      this alert would cost a reader the whole analysis because a proxy was
      briefly unwell, and the branch reached here for the first time when
      #87 gave the composable a real `error` — the pair it replaced declared
      one and never assigned it, so this was dead code that had never run.
    -->
    <UAlert
      v-if="workflowError"
      data-testid="workflow-description-error"
      :description="`${workflowError.message} — tool names and parameter labels are unavailable.`"
      color="warning"
      variant="soft"
      icon="i-mdi:alert-circle-outline"
      class="mb-3"
    >
      <template #actions>
        <UButton
          data-testid="retry-workflow-description"
          size="xs"
          color="warning"
          variant="outline"
          :loading="describingWorkflow"
          @click="retryDescription()"
        >
          Retry
        </UButton>
      </template>
    </UAlert>
    <!--
      The shape of what ran, drawn from the revision this analysis was started
      against (#89). Above the jobs rather than instead of them: the graph says
      how the steps are joined, which a list cannot, and the list says what each
      one did, which #90 will bring onto the canvas as per-step marks.

      Only when there are steps to draw. A description that failed leaves this
      out and says so in the alert above, rather than showing an empty canvas
      that looks like a workflow of no steps.
    -->
    <template v-if="hasSteps">
      <USeparator label="Graph" />
      <UPageCard variant="ghost" :ui="{ container: 'lg:grid-cols-1' }">
        <GalaxyWorkflowGraphView :steps="workflowSteps" :marks="marks">
          <!--
            The panel says what the definition declares about the step and
            then what actually ran there, in the **same** block the list
            below uses rather than a second one that would drift from it
            (Q7).
          -->
          <template #detail="{ selection, openSubworkflow }">
            <div class="flex flex-col gap-4">
              <GalaxyWorkflowGraphStepDetails :selection="selection" @open="openSubworkflow" />
              <!--
                Only for a step of the workflow itself that runs jobs at all.
                A job row's `step_id` is the *outer* step's order index, so a
                step inside a subworkflow has no rows of its own (#119); and
                an input step has none and never will, so "no jobs recorded
                yet" would promise something still to come.
              -->
              <template
                v-if="selection
                  && selection.path.length === 0
                  && marks[selection.stepId]?.state !== 'unmarked'"
              >
                <USeparator label="Jobs" />
                <GalaxyAnalysisJobs
                  :jobs="jobsOfStep(selection.stepId)"
                  :workflow-galaxy-id="workflowGalaxyId"
                  :workflow-revision="workflowRevision"
                  :parameters="analysisParameters"
                />
              </template>
            </div>
          </template>
        </GalaxyWorkflowGraphView>
      </UPageCard>
    </template>

    <USeparator label="Inputs" />
    <UPageCard variant="ghost" :ui="{ container: 'lg:grid-cols-1' }">
      <GalaxyAnalysisIoDatasetsList :items="inputs" />
    </UPageCard>

    <USeparator label="Jobs" />

    <UPageCard variant="ghost" :ui="{ container: 'lg:grid-cols-1' }">
      <GalaxyAnalysisJobs
        :jobs="jobs"
        :workflow-galaxy-id="workflowGalaxyId"
        :workflow-revision="workflowRevision"
        :parameters="analysisParameters"
      />
    </UPageCard>

    <USeparator label="Outputs" />

    <UPageCard variant="ghost" :ui="{ container: 'lg:grid-cols-1' }">
      <GalaxyAnalysisIoDatasetsList :items="sortedOutputs" />
    </UPageCard>
  </slot>
</template>
