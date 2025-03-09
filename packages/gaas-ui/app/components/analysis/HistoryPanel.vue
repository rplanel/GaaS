<script setup lang="ts">
import type { AccordionItem } from '@nuxt/ui'
import type { GalaxyTool } from 'blendtype'
import type { GalaxyToolInputComponent } from '../../composables/galaxy/useGalaxyToolInputComponent'
import type { Database, RowAnalysisJob } from '../../types'
import { useGalaxyDecodeParameters } from '../../composables/galaxy/useGalaxyDecodeParameters'
import { useGalaxyToolInputComponent } from '../../composables/galaxy/useGalaxyToolInputComponent'

const props = withDefaults(defineProps<{
  analysisId: number
}>(), {})

const emits = defineEmits(['close'])
// const { analysis } = toRefs(props)
const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const workflowParametersModel = ref<
  | Record<string, Record<string, string | string[] | Record<string, any>>>
  | undefined
>(undefined)
const { outputs, analysis: detailedAnalysis, inputs } = useAnalysisDatasetIO(props.analysisId)

const { data: dbWorkflow } = await useAsyncData('workflow-db', async () => {
  const userVal = toValue(user)
  const analysisVal = toValue(detailedAnalysis)
  if (!userVal) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized: User not found',
    })
  }
  if (!analysisVal) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found: Analysis not found',
    })
  }
  const workflowIdVal = toValue(analysisVal.workflow_id)
  const { data } = await supabase
    .schema('galaxy')
    .from('workflows')
    .select('id, name, galaxy_id, definition')
    .eq('id', workflowIdVal)
    .limit(1)
    .single()
  return data
})

const workflowGalaxyId = computed(() => {
  const dbWorkflowVal = toValue(dbWorkflow)
  if (dbWorkflowVal)
    return dbWorkflowVal.galaxy_id
  return undefined
})
const {
  workflowSteps,
  workflowToolIds,
  stepToTool,
} = useGalaxyWorkflow(workflowGalaxyId)
const { tools, toolInputParameters } = useGalaxyTool(workflowToolIds)
const { getToolParameters, getParametersInputComponent } = useAnalysisTools()
const { jobsAccordionItems, jobsMap, jobDetailsAccordionItems } = useAnalysisJob()

function useAnalysisJob() {
  const jobs = computed<RowAnalysisJob[] | undefined>(() => {
    const analysisVal = toValue(detailedAnalysis)
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
        return {
          label: `${toolsVal[job.tool_id]?.name ?? 'no tool name'} - ${
            toolsVal[job.tool_id]?.version ?? 'no tool version'
          }`,
          icon: 'i-mdi:tools',
          value: String(job.step_id),
        }
      })
    }
    return undefined
  })

  // const activeAccordionItem = computed(() => {
  //   const jobsAccordionItemsVal = toValue(jobsAccordionItems)
  //   if (jobsAccordionItemsVal) {
  //     return jobsAccordionItemsVal.map(() => true)
  //   }
  //   return []
  // })
  // const activeAccordionItem = ref(0)

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
            { label: 'Parameters', slot: 'parameters' },
            { label: 'Stdout', slot: 'stdout' },
            { label: 'Stderr', slot: 'stderr' },
          ],
        }
      }
      return perJobItems
    }
    return undefined
  })

  return { jobs, jobsAccordionItems, jobsMap, jobDetailsAccordionItems }
}

function useAnalysisTools() {
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

watchEffect(() => {
  const dbAnalysisVal = toValue(detailedAnalysis) as Record<string, any> | undefined
  if (dbAnalysisVal) {
    const { decodedParameters } = useGalaxyDecodeParameters(
      dbAnalysisVal.parameters,
    )
    workflowParametersModel.value = toValue(decodedParameters)
  }
})
</script>

<template>
  <UDashboardPanel id="analysis-detail-1" class="overflow-auto">
    <UDashboardNavbar
      v-if="detailedAnalysis"
      :title="detailedAnalysis.name"
      :toggle="true"
    >
      <template #leading>
        <UButton icon="i-lucide-x" color="neutral" variant="ghost" class="-ms-1.5" @click="emits('close')" />
      </template>

      <UButtonGroup orientation="horizontal">
        <UButton variant="subtle" active-variant="solid" label="Results" :to="`/analyses/${analysisId}/results`" />
        <UButton variant="subtle" active-variant="solid" label="parameters" :to="`/analyses/${analysisId}`" :active="$route.name === 'analyses-analysisId'" />
      </UButtonGroup>

      <template #right>
        <!-- <GalaxyStatus v-if="history" :state="history.state" :size="30" /> -->
        <UTooltip text="Rerun">
          <UButton
            icon="lucide:refresh-ccw"
            color="neutral"
            variant="ghost"
          />
        </UTooltip>
      </template>
    </UDashboardNavbar>
    <slot>
      <UPageList divide>
        <UPageCard title="Inputs" variant="ghost" :ui="{ container: 'lg:grid-cols-1' }">
          <GalaxyAnalysisIoDatasets :items="inputs" />
        </UPageCard>
        <UPageCard title="Jobs" variant="ghost" :ui="{ container: 'lg:grid-cols-1' }">
          <UPageAccordion :default-value="[jobsAccordionItems?.[0]?.value ?? '0']" :items="jobsAccordionItems">
            <template #leading="{ item }">
              <div>
                <GalaxyStatus :state="item?.value && jobsMap ? jobsMap[item.value]?.state : undefined" size="25" />
              </div>
            </template>
            <template #body="{ item }">
              <div v-if="jobDetailsAccordionItems && item.value" class="p-4">
                <UPageAccordion :default-value="['0']" :items="jobDetailsAccordionItems[item.value]?.details">
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
                      <div class="ring ring-[var(--ui-border)] rounded-[calc(var(--ui-radius)*2)] p-8 overflow-x-auto">
                        <pre v-if="jobsMap" class="text-nowrap"> {{ jobsMap[item.value]?.stdout }}</pre>
                      </div>
                    </div>
                  </template>
                  <template #stderr>
                    <div class="p-1">
                      <div class="ring ring-[var(--ui-border)] rounded-[calc(var(--ui-radius)*2)] p-8 overflow-x-auto">
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
  </UDashboardPanel>
</template>
