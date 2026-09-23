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

/**
 * Rebuilt whenever the workflow arrives, because what it declares is what
 * there is to validate: one entry per input, so `required` on those fields is
 * something `UForm` can act on rather than a marker beside a field it never
 * sees.
 */
const schema = computed(() => z.object({
  // `min(1)` is what makes the `required` marker on the field mean something:
  // plain `z.string()` rejects the untouched `undefined` but accepts the `''`
  // a reader leaves behind by typing a name and clearing it again. `trim()`
  // comes first so that a name of only spaces is that same `''` rather than a
  // string with a length: the server refuses it either way (#47), but here
  // the reader is told by the marker beside the field, not after a round
  // trip. What the schema outputs is the trimmed name, and that is what is
  // sent, so the length rule measures what will be stored (`varchar(256)`,
  // 256 allowed).
  analysisName: z
    .string({ error: REQUIRED })
    .trim()
    .min(1, REQUIRED)
    .max(256, 'Must be at most 256 characters'),
  inputs: z.object(
    Object.fromEntries(
      Object.keys(toValue(workflowInputs)).map(stepId => [
        stepId,
        // There is nothing to check about a selection beyond its being
        // there: the picker writes back one of the rows it was given.
        z.custom<UploadedDatasetDb>(
          selection => selection !== undefined && selection !== null,
          REQUIRED,
        ),
      ]),
    ),
  ),
}))

type Schema = z.output<typeof schema.value>

/**
 * `analysisName` is absent until the reader types one. `inputs` is always
 * there, with an absent key for an input nobody has chosen yet: `UForm`
 * validates the object handed to it as `:state`, so a selection kept
 * anywhere else is a selection it cannot refuse (#39).
 */
type FormState = Partial<Pick<Schema, 'analysisName'>> & Pick<Schema, 'inputs'>

const state = reactive<FormState>({
  analysisName: undefined,
  inputs: {},
})

/**
 * The name a `UFormField` has to carry for the error zod reports at
 * `inputs.<stepId>` to render against it. `UFormField` matches an error by
 * comparing its `name` to the joined issue path, so the two silently
 * disagreeing renders the error nowhere — which is what `input.uuid` did
 * here, one field over from the name #36 repaired.
 */
function inputFieldName(stepId: string) {
  return `inputs.${stepId}`
}

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
 * already validated as a non-empty string and the datamap already carries a
 * selection for every input the workflow declares. Reading both from
 * `event.data` rather than from `state` is what stops an empty name being a
 * falsy value this function has to guard against: there is no branch left to
 * fall through, because there is no `undefined` to fall through on.
 *
 * It also decides what the datamap may contain: the schema names the inputs
 * this workflow declares, and `z.object` keeps nothing else, so a selection
 * stored against a step the workflow has since dropped is not sent. The form
 * asks for exactly what it showed.
 */
async function runAnalysis(event: FormSubmitEvent<Schema>) {
  const analysesNameVal = event.data.analysisName
  const workflowIdVal = toValue(props.workflowId)
  const workflowParametersModelVal = toValue(invokeWorkflowParameterModel)
  const { encodedParameters } = useGalaxyEncodeParameters(
    workflowParametersModelVal,
  )
  const parameters = toValue(encodedParameters)
  const payload = {
    name: analysesNameVal,
    datamap: event.data.inputs,
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
    // them the form they just filled in. The rejection itself is handed
    // over, not just its status: a 400 carries the server's own words for
    // which input was left out (#43, #46), and the status alone cannot say.
    // The cause is still only ever worth a log.
    const { errorStatus } = useErrorStatus(error)
    log.error({
      action: 'analysis:start_failed',
      tag: 'InvokeForm',
      status: toValue(errorStatus),
      error: String(error),
    })
    submitError.value = describeStartAnalysisFailure(error)
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
    // A stored analysis whose datamap no longer covers every input the
    // workflow declares re-runs as a field error on the ones it misses,
    // rather than as a submission with a gap in it. Copied rather than
    // shared: the picker writes into this object, and the original belongs to
    // the query cache. Dropping the `?? {}` is a type error, not a silent
    // regression.
    state.inputs = { ...dbAnalysisVal.datamap ?? {} }
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
      <!--
        Gated on what the workflow declares, not on the list of datasets
        having arrived: these fields are where the errors for those inputs
        render, so hiding them until the list loads — or for ever, if the
        query for it fails — would leave Run doing nothing the reader can
        see, which is the shape both #36 and #39 are about. An empty picker
        is the honest state while the list is on its way.
      -->
      <div v-if="Object.keys(workflowInputs).length > 0" class="mt-5">
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
          :name="inputFieldName(stepId)" :data-testid="`workflow-input-${stepId}`"
        >
          <USelectMenu
            v-model="state.inputs[stepId]" :search-input="{
              placeholder: 'Filter...',
              icon: 'i-lucide-search',
            }" icon="i-material-symbols:dataset"
            :items="datasets ?? []" label-key="dataset_name" class="w-full" :name="inputFieldName(stepId)"
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
