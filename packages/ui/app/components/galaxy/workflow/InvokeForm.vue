<!-- eslint-disable ts/no-use-before-define -->
<script setup lang="ts">
import type { AccordionItem, FormSubmitEvent } from '@nuxt/ui'

import type {
  GalaxyTool,
  WorkflowToolParameters,
} from 'blendtype'
// import type { SupabaseTypes } from '#build/types/database'
import type { Database } from 'nuxt-galaxy'
import type { Props as WorkflowStepProps } from '../../../components/galaxy/workflow/Step.vue'
import type { EncodedGalaxyWorkflowParameter } from '../../../composables/galaxy/types'
import type { GalaxyToolInputComponent } from '../../../composables/galaxy/useGalaxyToolInputComponent'
import type { AnalysesListProvide } from '../../../layouts/default.vue'
import type { StartAnalysisFailure } from '../../../utils/startAnalysisFailure'
import { NuxtErrorBoundary } from '#components'
import { computed, ref, toValue } from '#imports'

import { log } from 'evlog/client'
import * as z from 'zod'
import { useGalaxyDecodeParameters } from '../../../composables/galaxy/useGalaxyDecodeParameters'
import { useGalaxyEncodeParameters } from '../../../composables/galaxy/useGalaxyEncodeParameters'
import {

  useGalaxyToolInputComponent,
} from '../../../composables/galaxy/useGalaxyToolInputComponent'
import { describeStartAnalysisFailure, unexplainedStartAnalysisFailure } from '../../../utils/startAnalysisFailure'

// type Database = SupabaseTypes.Database
export type UploadedDatasetDb = Database['galaxy']['Views']['uploaded_datasets_with_storage_path']['Row']

export interface Props {
  workflowId: number
  analysisId?: number
}

export type WorkflowParameterValue
  = | string
    | string[]
    | Record<string | number, WorkflowParameterConditionalValue>

interface WorkflowParameterConditionalValue {
  [key: string]: WorkflowParameterValue
}

const props = withDefaults(defineProps<Props>(), {})
const router = useRouter()
const route = useRoute()
const redirectInfo = useSupabaseCookieRedirect()

const workflowId = toRef(() => props.workflowId)
const analysisId = toRef(() => props.analysisId)
const startingAnalysis = ref<boolean>(false)
/** Why the last submission was refused, or `null` if none was. */
const submitError = ref<StartAnalysisFailure | null>(null)
/** An unselected input is an absent key, never an absent map. */
const workflowInputDatasetsModel = ref<Record<string, UploadedDatasetDb>>({})
const invokeWorkflowParameterModel = ref<Record<string, WorkflowToolParameters>>({})
const supabase = useSupabaseClient<Database>()

const analysesListInjected = inject<AnalysesListProvide>('analysesList')
const { refreshAnalysesList } = analysesListInjected || {}

/**
 * Both ways of arriving at an empty name, kept in one place: zod does not
 * cascade a schema-level `error` into `.min()`, so the two have to be written
 * separately and must not drift.
 */
const REQUIRED = 'Required'

const schema = z.object({
  // `min(1)` is what makes the `required` marker on the field mean something:
  // plain `z.string()` rejects the untouched `undefined` but accepts the `''`
  // a reader leaves behind by typing a name and clearing it again.
  analysisName: z
    .string({ error: REQUIRED })
    .min(1, REQUIRED)
    .max(256, 'Must be less than 256 characters'),
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

/**
 * Where `login.vue` sends the reader once they are back in: it navigates to
 * whatever this cookie holds and falls back to the default page. Leaving it
 * unset would drop them somewhere other than the workflow they were starting,
 * which is most of what showing the refusal in place was meant to avoid.
 */
function rememberThisPage() {
  redirectInfo.path.value = route.fullPath
}

/**
 * `UForm` hands the submit event the schema's *output*, so the name arrives
 * already validated as a non-empty string. Reading it from `event.data`
 * rather than from `state` is what stops an empty name being a falsy value
 * this function has to guard against: there is no branch left to fall
 * through, because there is no `undefined` to fall through on.
 */
async function runAnalysis(event: FormSubmitEvent<Schema>) {
  const workflowInputsModelVal = toValue(workflowInputDatasetsModel)
  const analysesNameVal = event.data.analysisName
  const workflowIdVal = toValue(props.workflowId)
  const workflowParametersModelVal = toValue(invokeWorkflowParameterModel)
  const { encodedParameters } = useGalaxyEncodeParameters(
    workflowParametersModelVal,
  )
  const parameters = toValue(encodedParameters)
  const payload = {
    name: analysesNameVal,
    datamap: workflowInputsModelVal,
    parameters,
    workflowId: workflowIdVal,
  }
  startingAnalysis.value = true
  submitError.value = null
  // Only the request is guarded, so a failed submission is the only thing
  // this handler can claim.
  const created = await $fetch('/api/db/analyses', {
    method: 'POST',
    body: payload,
  }).catch((error: unknown) => {
    // Shown rather than thrown: every status this endpoint refuses with is
    // one the reader may be able to act on, and a fatal page would cost
    // them the form they just filled in. The reader gets the status turned
    // into words; the cause itself is only ever worth a log.
    const { errorStatus } = useErrorStatus(error)
    log.error({
      action: 'analysis:start_failed',
      tag: 'InvokeForm',
      status: toValue(errorStatus),
      error: String(error),
    })
    submitError.value = describeStartAnalysisFailure(toValue(errorStatus))
    return null
  })
  startingAnalysis.value = false
  if (!created) {
    // Either the request was refused above and is already described, or it
    // answered 200 with no analysis to navigate to. ADR 0002 and #25 took
    // that empty body out of the server; if it returns, the reader is told
    // rather than left with a stopped spinner and nothing else.
    if (submitError.value === null) {
      log.error({ action: 'analysis:start_returned_no_analysis', tag: 'InvokeForm' })
      submitError.value = unexplainedStartAnalysisFailure
    }
    return
  }
  // A missing provide is this application's mistake rather than a refused
  // submission, so it is left to surface as the programming error it is.
  if (!refreshAnalysesList) {
    throw createError('refreshAnalysesList not provided')
  }
  refreshAnalysesList()
  router.push(`/analyses/${created.id}`)
}

const { data: dbWorkflow } = useQuery(() => workflowByIdQuery({ id: toValue(workflowId), supabase }))

const { data: dbAnalysis } = useQuery(() => {
  const analysisIdVal = toValue(analysisId)
  return {
    ...analysisByIdWithJobsQuery({ id: analysisIdVal!, supabase }),
    enabled: !!analysisIdVal,
  }
})

const { data: datasets } = useQuery(() => analysesOutputsViewQuery({ supabase }))

const workflowGalaxyId = computed(() => {
  const dbWorkflowVal = toValue(dbWorkflow)
  return dbWorkflowVal?.galaxy_id
})

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
  // Named rather than `Record<string, any>`: `datamap` is a nullable `Json`
  // column, and only a type that says so makes the `?? {}` below something
  // the compiler enforces instead of something a comment promises.
  const dbAnalysisVal = toValue(dbAnalysis) as {
    name: string
    parameters: EncodedGalaxyWorkflowParameter
    datamap: Record<string, UploadedDatasetDb> | null
  } | null | undefined

  if (props.analysisId && dbAnalysisVal) {
    state.analysisName = `Copy of ${dbAnalysisVal.name}`
    const { decodedParameters } = useGalaxyDecodeParameters(
      dbAnalysisVal.parameters,
    )
    invokeWorkflowParameterModel.value = decodedParameters.value
    // A stored analysis with no datamap re-runs as an empty selection, which
    // the server answers for, rather than as a submission that does nothing.
    // Dropping the `?? {}` is a type error, not a silent regression.
    workflowInputDatasetsModel.value = dbAnalysisVal.datamap ?? {}
  }
  else {
    invokeWorkflowParameterModel.value = workflowParametersModel.value
  }
})
</script>

<template>
  <NuxtErrorBoundary>
    <UForm :schema="schema" :state="state" @submit.prevent="runAnalysis">
      <UFormField label="Name of the analysis" name="analysisName" required>
        <UInput
          v-model="state.analysisName" type="text" name="name" placeholder="Enter the name of the analysis"
          class="w-full"
        />
      </UFormField>
      <!-- <USeparator
            icon="i-lucide-files"
            class="mt-5 mb-3"
          /> -->
      <div v-if="datasets" class="mt-5">
        <h3 class="font-bold text-lg ">
          <template v-if="Object.values(workflowInputs).length > 1">
            Select workflow inputs
          </template>
          <template v-else>
            Select workflow input
          </template>
        </h3>

        <UFormField
          v-for="(input, stepId) in workflowInputs" :key="stepId" :label="input.label" required
          :name="input.uuid"
        >
          <USelectMenu
            v-model="workflowInputDatasetsModel[stepId]" :search-input="{
              placeholder: 'Filter...',
              icon: 'i-lucide-search',
            }" :create-item="{ position: 'top', when: 'always' }" icon="i-material-symbols:dataset" :items="datasets"
            label-key="dataset_name" class="w-full" :name="input.uuid"
          />
        </UFormField>
      </div>

      <USeparator icon="i-lucide:workflow" class="mt-5 mb-3" />
      <h3 class="font-bold text-lg">
        Select workflow parameters
      </h3>
      <div v-if="workflowStepsToolInfo">
        <UAccordion
          :items="workflowStepsItems" :ui="{
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
                <VersionBadge :version="workflowStepsToolInfo[stepId]?.version" />
              </div>
            </div>
          </template>
          <template #body="{ item: { value: stepId } }">
            <div class="p-2">
              <div class="ring ring-default rounded-[calc(var(--ui-radius)*2)]">
                <GalaxyWorkflowStep
                  v-if="stepId !== undefined && galaxyWorkflowStepProps?.[stepId]"
                  v-bind="galaxyWorkflowStepProps[stepId]" variant="form"
                />
              </div>
            </div>
          </template>
        </UAccordion>
        <USeparator class="mt-5 mb-3" />
      </div>

      <UAlert
        v-if="submitError"
        role="alert"
        variant="subtle"
        color="error"
        icon="i-lucide:alert-octagon"
        :title="submitError.title"
        :description="submitError.description"
        class="mb-3"
      >
        <template v-if="submitError.signIn" #actions>
          <UButton
            data-testid="start-analysis-failure-sign-in"
            color="error"
            variant="outline"
            size="xs"
            to="/login"
            @click="rememberThisPage"
          >
            Sign in
          </UButton>
        </template>
      </UAlert>
      <UButton type="submit" :loading="startingAnalysis">
        Run
      </UButton>
    </UForm>
    <template #error="{ error }">
      <pre>{{ error }}</pre>
    </template>
  </NuxtErrorBoundary>
</template>
