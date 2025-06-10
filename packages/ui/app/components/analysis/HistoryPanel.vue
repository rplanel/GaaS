<script setup lang="ts">
import type { AccordionItem } from '@nuxt/ui'
import type { GalaxyTool } from 'blendtype'
import type { GalaxyToolInputComponent } from '../../composables/galaxy/useGalaxyToolInputComponent'
import type { AnalysisDetail, RowAnalysisJob } from '../../types'
import * as bt from 'blendtype'
import { useGalaxyDecodeParameters } from '../../composables/galaxy/useGalaxyDecodeParameters'
import { useGalaxyToolInputComponent } from '../../composables/galaxy/useGalaxyToolInputComponent'

const props = withDefaults(defineProps<{
  analysisId: number
}>(), {})

const emits = defineEmits(['close'])
// const client = useSupabaseClient<Database>()
// const user = useSupabaseUser()
// let realtimeHistoriesChannel: RealtimeChannel
// let realtimeJobsChannel: RealtimeChannel
// const workflowParametersModel = ref<
//   | Record<string, Record<string, string | string[] | Record<string, any>>>
//   | undefined
// >(undefined)
// const analysisId = toRef(() => props.analysisId)
const analysisId = ref<number | undefined>(props.analysisId)
watch(
  () => props.analysisId,
  (newAnalysisId) => {
    analysisId.value = newAnalysisId
  },
  { immediate: true, deep: true },
)

const { outputs, analysis: detailedAnalysis, inputs, refresh, pendingAnalysis } = useAnalysisDetails(analysisId)

const workflowGalaxyId = computed(() => {
  const detailedAnalysisVal = toValue(detailedAnalysis)
  if (detailedAnalysisVal) {
    return detailedAnalysisVal.workflows.galaxy_id
  }
  return undefined
})
const { gaasUi: { resultsMenuItems, analyisParametersMenuItems } } = useAppConfig()

useSupabaseRealtime(`galaxy:histories:${props.analysisId}`, 'histories', refresh)
useSupabaseRealtime(`galaxy:jobs:${props.analysisId}`, 'jobs', refresh)
useSupabaseRealtime(`galaxy:analysis_outputs:${props.analysisId}`, 'analysis_outputs', refresh)

const {
  workflow,
  workflowSteps,
  workflowToolIds,
  stepToTool,
  error: workflowError,
} = useGalaxyWorkflow(workflowGalaxyId)

const { toolsObj, toolInputParameters } = useGalaxyTool(workflowToolIds)
const { getToolParameters, getParametersInputComponent } = useAnalysisTools(toolsObj)
const { jobs, jobsAccordionItems, jobsMap, jobDetailsAccordionItems } = useAnalysisJob(detailedAnalysis, toolsObj)

function useAnalysisJob(analysis: Ref<AnalysisDetail | null>, tools: Ref<Record<string, GalaxyTool>>) {
  const jobs = computed<RowAnalysisJob[] | undefined>(() => {
    const analysisVal = toValue(analysis)
    if (analysisVal && analysisVal?.jobs) {
      return analysisVal.jobs
    }
    return undefined
  })

  const jobsAccordionItems = computed<AccordionItem[] | undefined>(() => {
    const jobsVal = toValue(jobs)
    const toolsVal = toValue(tools)
    if (jobsVal && toolsVal) {
      return jobsVal.map((job): AccordionItem => {
        const item = toolsVal[job.tool_id]
        return {
          label: `${item?.name ?? 'no tool name'} - ${
            item?.version ?? 'no tool version'
          }`,
          icon: 'i-mdi:tools',
          value: String(job.step_id),
        }
      })
    }
    return undefined
  })

  const jobsMap = computed(() => {
    const jobsVal = toValue(jobs) as RowAnalysisJob[]
    if (jobsVal) {
      const jobM: Record<string, RowAnalysisJob> = {}
      for (const job of jobsVal) {
        jobM[String(job.step_id)] = job
      }
      return jobM
    }
    return {}
  })

  const jobDetailsAccordionItems = computed(() => {
    const jobsVal = toValue(jobs)
    const perJobItems: Record<string, { details: AccordionItem[] }> = {}
    if (jobsVal) {
      for (const job of jobsVal) {
        perJobItems[job.step_id] = {
          details: [
            { label: 'Parameters', slot: 'parameters', icon: 'i-lucide:settings-2' },
            { label: 'Stdout', slot: 'stdout', icon: 'i-material-symbols:output' },
            { label: 'Stderr', slot: 'stderr', icon: 'i-material-symbols:error-outline-rounded' },
          ],
        }
      }
      return perJobItems
    }
    return undefined
  })

  return { jobs, jobsAccordionItems, jobsMap, jobDetailsAccordionItems }
}

function useAnalysisTools(tools: Ref<Record<string, GalaxyTool>>) {
  function getToolParameters(stepId: string) {
    const stepToolsVal = toValue(stepToTool)
    const toolInputParametersVal = toValue(toolInputParameters)
    const toolName = stepToolsVal[stepId]
    if (toolName) {
      return toolInputParametersVal[toolName]
    }
  }

  const toolInputParameterComponent = computed(() => {
    const toolsVal = toValue(tools)
    if (toolsVal) {
      return Object.entries(toolsVal).reduce(
        (
          acc: Record<string, Record<string, GalaxyToolInputComponent>>,
          curr,
        ) => {
        // toolInput.
          const [toolId, tool] = curr as [string, GalaxyTool]
          const { inputComponentsObject } = useGalaxyToolInputComponent(
            tool.inputs,
          )
          if (inputComponentsObject.value)
            acc[toolId] = inputComponentsObject.value
          return acc
        },
        {} as Record<string, Record<string, GalaxyToolInputComponent>>,
      )
    }
    return undefined
  })
  function getParametersInputComponent(stepId: string) {
    const toolName = toValue(stepToTool)[stepId]
    const computedParameterInputComponentObjectVal = toValue(toolInputParameterComponent)
    if (toolName && computedParameterInputComponentObjectVal) {
      return computedParameterInputComponentObjectVal[toolName]
    }
  }

  return { tools, getToolParameters, getParametersInputComponent }
}

const analysisParameters = computed(() => {
  const analysisVal = toValue(detailedAnalysis)
  if (analysisVal) {
    return analysisVal.parameters
  }
  return undefined
})

const { decodedParameters: workflowParametersModel } = useGalaxyDecodeParameters(
  analysisParameters,
)

// watchEffect(() => {
//   const dbAnalysisVal = toValue(detailedAnalysis) as Record<string, any> | undefined
//   if (dbAnalysisVal) {
//     const { decodedParameters } = useGalaxyDecodeParameters(
//       dbAnalysisVal.parameters,
//     )
//     workflowParametersModel.value = toValue(decodedParameters)
//   }
// })

const computedResultsMenuItems = computed(() => {
  const analysisIdVal = toValue(analysisId)
  const workflowVal = toValue(workflow)
  const items = [{ ...analyisParametersMenuItems, to: {
    name: 'analyses-analysisId',
    params: {
      analysisId: analysisIdVal,
    },
  } }]
  if (!workflowVal) {
    return items
  }
  const workflowTagVersion = bt.getWorkflowTagVersion(workflowVal.tags)
  const workflowTagName = bt.getWorkflowTagName(workflowVal.tags)

  if (workflowTagVersion === null || workflowTagName === null) {
    return items
  }
  const resultItems = resultsMenuItems?.[workflowTagName]?.[workflowTagVersion]
  if (!Array.isArray(resultItems)) {
    return items
  }
  return [

    ...items,
    ...resultItems.map(item => ({
      ...item,
      to: `/analyses/${analysisIdVal}/${item.to}`,
    })).reverse(),
  ]
})
</script>

<template>
  <UDashboardPanel id="history-panel" class="overflow-auto">
    <template #header>
      <UDashboardNavbar
        v-if="detailedAnalysis"
        :title="detailedAnalysis.name"
        :toggle="true"
      >
        <template #leading>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" class="-ms-1.5" @click="emits('close')" />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left>
          <UNavigationMenu :items="computedResultsMenuItems" highlight class="-mx-1 flex-1" />
        </template>
      </UDashboardToolbar>
    </template>
    <template #body>
      <template v-if="pendingAnalysis">
        <div class="hidden lg:flex flex-1 items-center justify-center">
          <div class="flex items-center gap-4">
            <USkeleton class="h-20 w-20 rounded-full" />
            <div class="grid gap-2">
              <USkeleton class="h-8 w-[250px]" />
              <USkeleton class="h-8 w-[200px]" />
            </div>
          </div>
        </div>
      </template>

      <slot v-else>
        <UAlert v-if="workflowError" :description="workflowError.message" color="error" variant="soft" icon="i-mdi:alert-circle-outline" />

        <UPageList v-else divide>
          <UPageCard title="Inputs" variant="ghost" :ui="{ container: 'lg:grid-cols-1' }">
            <GalaxyAnalysisIoDatasets :items="inputs" />
          </UPageCard>
          <UPageCard v-if="jobs && toolsObj" title="Jobs" variant="ghost" :ui="{ container: 'lg:grid-cols-1' }">
            <UPageAccordion :default-value="[jobsAccordionItems?.[0]?.value ?? '0']" :items="jobsAccordionItems">
              <template #leading="{ item }">
                <div>
                  <GalaxyStatus :state="item?.value && jobsMap ? jobsMap[item.value]?.state : undefined" size="25" />
                </div>
              </template>
              <template #body="{ item }">
                <div v-if="jobDetailsAccordionItems && item.value" class="p-4">
                  <UPageAccordion :items="jobDetailsAccordionItems[item.value]?.details">
                    <template #parameters>
                      <div
                        v-if="
                          workflowSteps
                            && workflowParametersModel
                            && item.value
                        " class="p-2"
                      >
                        <GalaxyWorkflowStep
                          variant="display" :workflow-step="workflowSteps[item.value]"
                          :tool-parameters="getToolParameters(item.value)"
                          :parameters-inputs-component="getParametersInputComponent(item.value)"
                          :workflow-parameters-model=" workflowParametersModel[item.value] "
                        />
                      </div>
                    </template>
                    <template #stdout>
                      <div class="p-1">
                        <div class="ring ring-default rounded-[calc(var(--ui-radius)*2)] p-8 overflow-x-auto">
                          <pre v-if="jobsMap" class="text-nowrap"> {{ jobsMap[item.value]?.stdout }}</pre>
                        </div>
                      </div>
                    </template>
                    <template #stderr>
                      <div class="p-1">
                        <div class="ring ring-default rounded-[calc(var(--ui-radius)*2)] p-8 overflow-x-auto">
                          <pre v-if="jobsMap"> {{ jobsMap[item.value]?.stderr }}</pre>
                        </div>
                      </div>
                    </template>
                  </UPageAccordion>
                </div>
              </template>
            </UPageAccordion>
          </UPageCard>
          <UPageCard title="Outputs" variant="ghost" :ui="{ container: 'lg:grid-cols-1' }">
            <GalaxyAnalysisIoDatasets :items="outputs" />
          </UPageCard>
        </UPageList>
      </slot>
    </template>
  </UDashboardPanel>
</template>
