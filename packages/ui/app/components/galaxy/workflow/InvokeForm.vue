<!-- eslint-disable ts/no-use-before-define -->
<script setup lang="ts">
import type { SupabaseTypes } from '#build/types/database'
import type { AccordionItem } from '@nuxt/ui'
import type {
  GalaxyTool,
  WorkflowToolParameters,
} from 'blendtype'
import type { Props as WorkflowStepProps } from '../../../components/galaxy/workflow/Step.vue'
import type { GalaxyToolInputComponent } from '../../../composables/galaxy/useGalaxyToolInputComponent'
import { NuxtErrorBoundary } from '#components'
import { computed, ref, toValue } from '#imports'
import { getErrorMessage, getStatusCode } from 'blendtype'
import { z } from 'zod'
import { useGalaxyDecodeParameters } from '../../../composables/galaxy/useGalaxyDecodeParameters'
import { useGalaxyEncodeParameters } from '../../../composables/galaxy/useGalaxyEncodeParameters'
import {

  useGalaxyToolInputComponent,
} from '../../../composables/galaxy/useGalaxyToolInputComponent'

type Database = SupabaseTypes.Database
export type UploadedDatasetDb = Database['galaxy']['Views']['uploaded_datasets_with_storage_path']['Row']

export interface Props {
  workflowId: number
  analysisId?: number
}
const props = withDefaults(defineProps<Props>(), {})
const router = useRouter()

export type WorkflowParameterValue =
  | string
  | string[]
  | Record<string | number, WorkflowParameterConditionalValue>

interface WorkflowParameterConditionalValue {
  [key: string]: WorkflowParameterValue
}

const startingAnalysis = ref<boolean>(false)
const workflowInputDatasetsModel = ref<
  Record<string, UploadedDatasetDb> | undefined
>({})
const invokeWorkflowParameterModel = ref<Record<string, WorkflowToolParameters>>({})
const user = useSupabaseUser()
const supabase = useSupabaseClient<Database>()

const { refreshAnalysesList } = inject('analysesList')

const schema = z.object({
  analysisName: z.string().max(256, 'Must be less than 256'),

})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  analysisName: undefined,
})

const toolInputParameterComponent = computed(() => {
  const toolsVal = toValue(toolsObj)
  if (toolsVal) {
    return Object.entries(toolsVal).reduce(
      (
        acc: Record<string, Record<string, GalaxyToolInputComponent>>,
        [toolId, tool]: [string, GalaxyTool],
      ) => {
        // toolInput.
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

const workflowStepsItems = computed<AccordionItem[] | undefined>(() => {
  const workflowStepsVal = toValue(workflowToolSteps)
  return Object.entries(workflowStepsVal)
    .map(([stepId, step]) => {
      const toolId = step.tool_id
      const splittedToolId = toolId?.split('/').slice(-2)
      if (splittedToolId?.length === 2) {
        return { value: stepId, label: splittedToolId[0] }
      }
      return { value: stepId }
    })
})

const workflowStepsToolInfo = computed(() => {
  const toolsVal = toValue(toolsObj)
  const stepToToolVal = toValue(stepToTool)
  const wfStepsToolInfo: {
    [stepId: string]: {
      name: string
      version: string
      description: string
    }
  } = {}
  for (const stepId in stepToToolVal) {
    const toolId = stepToToolVal[stepId]
    if (toolId) {
      const splittedToolId = toolId?.split('/').slice(-2)
      if (splittedToolId?.length === 2) {
        const [toolName, toolVersion] = splittedToolId
        const toolDescription = toolsVal[toolId]?.description ?? ''
        wfStepsToolInfo[stepId] = {
          name: toolName || '',
          version: toolVersion || '',
          description: toolDescription,
        }
      }
    }
  }
  return wfStepsToolInfo
})

const galaxyWorkflowStepProps = computed(
  () => {
    const workflowStepsItemsVal = toValue(workflowStepsItems)
    const workflowStepsVal = toValue(workflowSteps)
    const toolInputParametersVal = toValue(toolInputParameters)
    const toolInputParameterComponentVal = toValue(
      toolInputParameterComponent,
    )
    const workflowParametersModelVal = toValue(invokeWorkflowParameterModel)
    let props: Record<string, Omit<WorkflowStepProps, 'variant'>> | undefined

    if (workflowStepsItemsVal && toolInputParameterComponentVal) {
      for (const item of workflowStepsItemsVal) {
        const { value: stepId } = item
        if (stepId) {
          const workflowStep = workflowStepsVal[stepId]
          if (workflowStep) {
            const toolId = workflowStep.tool_id
            if (toolId !== null) {
              props = {}
              props[stepId] = {
                workflowStep,
                toolParameters: toolInputParametersVal[toolId],
                parametersInputsComponent:
                toolInputParameterComponentVal[toolId],
                workflowParametersModel: workflowParametersModelVal[stepId],
              }
            }
          }
        }
      }
    }
    return props
  },
)

async function runAnalysis() {
  const workflowInputsModelVal = toValue(workflowInputDatasetsModel)
  const analysesNameVal = state.analysisName
  const workflowIdVal = toValue(props.workflowId)
  const workflowParametersModelVal = toValue(invokeWorkflowParameterModel)
  if (workflowParametersModelVal) {
    const { encodedParameters } = useGalaxyEncodeParameters(
      workflowParametersModelVal,
    )
    const parameters = toValue(encodedParameters)
    if (workflowInputsModelVal && analysesNameVal && workflowIdVal) {
      const payload = {
        name: analysesNameVal,
        datamap: workflowInputsModelVal,
        parameters,
        workflowId: workflowIdVal,
      }
      startingAnalysis.value = true
      try {
        const { id: newAnalysisId } = await $fetch('/api/db/analyses', {
          method: 'POST',
          body: payload,
        })
        refreshAnalysesList()

        router.push(`/analyses/${newAnalysisId}`)
      }
      catch (error) {
        createError({ statusCode: getStatusCode(error), statusMessage: getErrorMessage(error) })
      }
      finally {
        startingAnalysis.value = false
      }
    }
  }
}

const { data: dbWorkflow } = await useAsyncData('workflow-db', async () => {
  const userVal = toValue(user)
  const workflowIdVal = toValue(props.workflowId)
  if (!userVal) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized: User not found',
    })
  }
  if (!workflowIdVal) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found: Workflow not found',
    })
  }
  const { data, error } = await supabase
    .schema('galaxy')
    .from('workflows')
    .select('id, name, galaxy_id, definition')
    .eq('id', workflowIdVal)
    .limit(1)
    .single()
  if (data === null) {
    throw createError({ statusMessage: 'No workflow found', statusCode: 404 })
  }
  if (error) {
    throw createError({ statusCode: getStatusCode(error), statusMessage: getErrorMessage(error) })
  }
  return data
})

const { data: dbAnalysis } = await useAsyncData('analysis-db', async () => {
  const userVal = toValue(user)
  const analysisId = toValue(props.analysisId)

  if (!userVal) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized: User not found',
    })
  }
  if (!analysisId) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found: Analysis not found',
    })
  }
  // const workflowIdVal = toValue(props.workflowId);
  const { data, error } = await supabase
    .schema('galaxy')
    .from('analyses')
    .select(`*,jobs(*)`)
    .eq('id', analysisId)
    .limit(1)
    .single()

  if (data === null) {
    throw createError({ statusMessage: 'No analysis found', statusCode: 404 })
  }
  if (error) {
    throw createError({ statusCode: getStatusCode(error), statusMessage: getErrorMessage(error) })
  }

  return data
})

const workflowGalaxyId = computed(() => {
  const dbWorkflowVal = toValue(dbWorkflow)
  return dbWorkflowVal?.galaxy_id
})

const { data: datasets } = await useAsyncData(
  'analysis-input-datasets',
  async (): Promise<UploadedDatasetDb[]> => {
    const userVal = toValue(user)
    if (!userVal) {
      throw createError({ statusMessage: 'No uploaded datasets', statusCode: 500 })
    }
    const { data, error } = await supabase
      .schema('galaxy')
      .from('uploaded_datasets_with_storage_path')
      .select()
      .overrideTypes<UploadedDatasetDb[]>()

    if (error) {
      throw createError({ statusCode: getStatusCode(error), statusMessage: getErrorMessage(error) })
    }
    if (data === null) {
      throw createError({ statusMessage: 'No uploaded datasets', statusCode: 500 })
    }
    return data
  },
)

const {
  workflowSteps,
  stepToTool,
  workflowInputs,
  workflowToolSteps,
  workflowToolIds,
  workflowParametersModel,
} = useGalaxyWorkflow(workflowGalaxyId)

const { toolsObj, toolInputParameters } = useGalaxyTool(workflowToolIds)

watchEffect(() => {
  const dbAnalysisVal = toValue(dbAnalysis) as Record<string, any>

  if (props.analysisId && dbAnalysisVal) {
    state.analysisName = `Copy of ${dbAnalysisVal.name}`
    const { decodedParameters } = useGalaxyDecodeParameters(
      dbAnalysisVal.parameters,
    )
    invokeWorkflowParameterModel.value = decodedParameters.value
    workflowInputDatasetsModel.value = dbAnalysisVal.datamap
  }
  else {
    invokeWorkflowParameterModel.value = workflowParametersModel.value
  }
})
</script>

<template>
  <NuxtErrorBoundary>
    <UForm :schema="schema" :state="state" @submit.prevent="runAnalysis">
      <UFormField
        label="Name of the analysis"
        name="analysisName"
        required
      >
        <UInput
          v-model="state.analysisName"
          type="text"
          name="name"
          placeholder="Enter the name of the analysis"
          class="w-full"
        />
      </UFormField>
      <!-- <USeparator
            icon="i-lucide-files"
            class="mt-5 mb-3"
          /> -->
      <div v-if="datasets && workflowInputDatasetsModel" class="mt-5">
        <h3 class="font-bold text-lg ">
          <template v-if="Object.values(workflowInputs).length > 1">
            Select workflow inputs
          </template>
          <template v-else>
            Select workflow input
          </template>
        </h3>

        <UFormField
          v-for="(input, stepId) in workflowInputs"
          :key="stepId"
          :label="input.label"
          required
          :name="input.uuid"
        >
          <USelectMenu
            v-model="workflowInputDatasetsModel[stepId]"
            :search-input="{
              placeholder: 'Filter...',
              icon: 'i-lucide-search',
            }"
            :create-item="{ position: 'top', when: 'always' }"
            icon="i-material-symbols:dataset"
            :items="datasets"
            label-key="dataset_name"
            class="w-full"
            :name="input.uuid"
          />
        </UFormField>
      </div>

      <USeparator
        icon="i-lucide:workflow"
        class="mt-5 mb-3"
      />
      <h3 class="font-bold text-lg">
        Select workflow parameters
      </h3>
      <div v-if="workflowStepsToolInfo">
        <UAccordion
          :items="workflowStepsItems"
          :ui="{
            header:
              'hover:bg-elevated px-2 rounded-[calc(var(--ui-radius))]',

          }"
        >
          <template #default="{ item: { value: stepId } }">
            <div
              v-if="stepId !== undefined"
              class="grid grid-flow-col auto-cols-auto items-center justify-between w-full gap-5 break-words"
            >
              <div class="grid grid-flow-row auto-rows-auto break-words">
                <div class="font-bold text-info grow break-all">
                  {{ workflowStepsToolInfo[stepId]?.name }}
                </div>
                <div class="font-medium text-sm opacity-60 grow break-words">
                  {{ workflowStepsToolInfo[stepId]?.description }}
                </div>
              </div>
              <div>
                <VersionBadge
                  :version="workflowStepsToolInfo[stepId]?.version"
                />
              </div>
            </div>
          </template>
          <template #body="{ item: { value: stepId } }">
            <div class="p-2">
              <div
                class="ring ring-default rounded-[calc(var(--ui-radius)*2)]"
              >
                <GalaxyWorkflowStep
                  v-if="stepId !== undefined && galaxyWorkflowStepProps?.[stepId]"
                  v-bind="galaxyWorkflowStepProps[stepId]"
                  variant="form"
                />
              </div>
            </div>
          </template>
        </UAccordion>
        <USeparator class="mt-5 mb-3" />
      </div>

      <UButton
        type="submit"
        :loading="startingAnalysis"
      >
        Run
      </UButton>
    </UForm>
    <template #error="{ error }">
      <pre>{{ error }}</pre>
    </template>
  </NuxtErrorBoundary>
</template>
