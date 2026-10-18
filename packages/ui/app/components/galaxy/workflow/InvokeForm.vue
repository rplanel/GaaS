<!-- eslint-disable ts/no-use-before-define -->
<script setup lang="ts">
import type { AccordionItem, FormSubmitEvent } from '@nuxt/ui'

import type {
  WorkflowToolParameters,
} from 'blendtype'
// import type { SupabaseTypes } from '#build/types/database'
import type { Database } from 'nuxt-galaxy'
import type { Props as WorkflowStepProps } from '../../../components/galaxy/workflow/Step.vue'
import type { EncodedGalaxyWorkflowParameter } from '../../../composables/galaxy/types'
import type { AnalysesListProvide } from '../../../layouts/default.vue'
import type { StartAnalysisFailure } from '../../../utils/startAnalysisFailure'
import { NuxtErrorBoundary } from '#components'
import { computed, ref, toValue } from '#imports'

import { log } from 'evlog/client'
import * as z from 'zod'
import { useGalaxyDecodeParameters } from '../../../composables/galaxy/useGalaxyDecodeParameters'
import { useGalaxyEncodeParameters } from '../../../composables/galaxy/useGalaxyEncodeParameters'
import { useGalaxyToolsInputComponents } from '../../../composables/galaxy/useGalaxyToolInputComponent'
import { describeStartAnalysisFailure, unexplainedStartAnalysisFailure } from '../../../utils/startAnalysisFailure'
// The same naming the graph draws on a node (#89). It was written here first,
// and twice would be two answers to "what is this tool called" — the version
// is still read off `tool_version`, never out of the id, since only a
// toolshed guid carries one (#100).
import { toolDisplayName } from '../../../utils/toolName'

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

// Which component renders each parameter, by tool and then by name. Shared
// with `AnalysisHistoryPanel`, which built the identical map (#87).
// Passed as a getter: `toolsObj` is declared further down, with the rest of
// the data fetching, and this file reads it from up here on purpose (see the
// `ts/no-use-before-define` disable at the top).
const toolInputParameterComponent = useGalaxyToolsInputComponents(() => toolsObj.value)

const workflowStepsItems = computed<AccordionItem[] | undefined>(() => {
  const workflowStepsVal = toValue(workflowToolSteps)
  return Object.entries(workflowStepsVal)
    .map(([stepId, step]) => ({ value: stepId, label: toolDisplayName(step.tool_id) }))
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
  for (const [stepId, step] of Object.entries(toValue(workflowToolSteps))) {
    wfStepsToolInfo[stepId] = {
      name: toolDisplayName(step.tool_id),
      version: step.tool_version,
      // `stepToTool` names the *pin*, which is what the definitions are
      // keyed by: by bare id a step running one of two pinned versions of a
      // tool read the other one's description (#100).
      description: toolsVal[stepToToolVal[stepId] ?? '']?.description ?? '',
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

    // One map for the whole workflow, built once outside the loop. Written
    // inside it, as #83 had it, every pass threw away the step before and
    // only the last one kept an entry: a workflow of two or more tool steps
    // offered parameters for exactly one of them, and the panels for the rest
    // rendered empty with nothing on screen to say why.
    //
    // `undefined` still means "there is no workflow to describe yet", which
    // is what the guard below decides; `{}` means the workflow is known and
    // declares no tool step. Nothing can tell the two apart today — the
    // template's only read is `galaxyWorkflowStepProps?.[stepId]` — but
    // keeping the distinction costs nothing and leaves the loading state
    // legible to the consolidation this derivation is headed for.
    if (workflowStepsItemsVal && toolInputParameterComponentVal) {
      const stepToToolVal = toValue(stepToTool)
      props = {}
      for (const item of workflowStepsItemsVal) {
        const { value: stepId } = item
        if (stepId) {
          const workflowStep = workflowStepsVal[stepId]
          // The tool **this step** pins, `<toolId>@<version>`, never its bare
          // id: a workflow may run the same tool at two versions, and by id
          // alone one of the two steps was offered the other's parameter list
          // bound to its own saved values (#100).
          const pinnedTool = stepToToolVal[stepId]
          if (workflowStep && pinnedTool !== undefined) {
            props[stepId] = {
              workflowStep,
              toolParameters: toolInputParametersVal[pinnedTool],
              parametersInputsComponent:
                toolInputParameterComponentVal[pinnedTool],
              workflowParametersModel: workflowParametersModelVal[stepId],
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
  // Cleared first, so a refusal still on screen from an earlier attempt is
  // never read as this one's answer.
  submitError.value = null
  // Galaxy refuses to run a revision whose tools are not installed at the
  // versions it pins, so the submission is refused here rather than by
  // Galaxy after the datasets have been uploaded. The alert above the button
  // has already named them; Run is disabled too, and this is the refusal
  // that does not depend on the button.
  //
  // A description that *failed* refuses too: the form then knows neither
  // the inputs nor the tools, so what it would send is whatever the reader
  // could see, which is nothing. The alert above the button says so.
  //
  // A description still *in flight* deliberately does not refuse. It would
  // silently reject a reader who types a name and presses Enter before the
  // answer lands — Enter submits a form whatever the button's disabled state
  // — and the worst it risks is the submission Galaxy would have refused
  // anyway, which is where this stood before #87. Refusing without being
  // able to say why is worse than refusing late. The release is the same
  // (#105): until it is known, nothing is refused on its account.
  if (toValue(submissionRefused)) {
    return
  }
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
// The revision the row is pinned to, which is the one the server starts
// (#48). Asked for by name so the inputs shown are the inputs that will run;
// Galaxy's latest revision, which the proxy describes when asked for none,
// moves with every save in its editor.
const workflowRevision = computed(() => toValue(dbWorkflow)?.revision)

// One request for the revision and every tool it pins (#87), shared through
// Pinia Colada with anything else reading the same revision. It replaced
// `useGalaxyWorkflow` + `useGalaxyTool`, which fetched 1+N times per mount
// over raw `$fetch` and so deduplicated nothing.
const {
  workflowSteps,
  stepToTool,
  workflowInputs,
  workflowToolSteps,
  workflowParametersModel,
  toolsObj,
  toolInputParameters,
  blockingTools,
  unavailableByStep,
  unconnectedInputsByStep,
  isLoading: describingWorkflow,
  retry: retryDescription,
  error: describeError,
} = useGalaxyWorkflowDescription(workflowGalaxyId, workflowRevision)

// The Galaxy this form submits to, for the release it runs (#105). Until it
// answers, and if it never does, nothing is refused on the release's account.
const requestFetch = useRequestFetch()
const { data: galaxyInstance, error: galaxyInstanceError } = useQuery(() => galaxyInstanceQuery({ requestFetch }))

// Not reaching it opens the gate for good, which on 24.2 and later lets
// through a submission Galaxy will refuse after the upload, so it leaves a
// trace (LOGGING-SPEC §3), as a description that never arrives does.
watch(galaxyInstanceError, (failure) => {
  if (failure) {
    log.warn({
      action: 'galaxy:instance_failed',
      tag: 'InvokeForm',
      error: String(failure),
    })
  }
})

/**
 * The steps to name above Run, each with the tool that runs it (#97).
 *
 * The per-step alert alone would not satisfy "mark it before submit": the
 * accordion is collapsed until a reader opens it, so a step nobody expands is
 * a step nobody is warned about. This is the summary that is on screen without
 * being asked for — the same two places Q22 marks an unavailable tool, and for
 * the same reason.
 *
 * `refuses` is whether Galaxy would refuse the invocation on this step's
 * account (#105). Such a step disables Run as `blockingTools` does, and is
 * named in a refusal of its own above Run rather than among the steps whose
 * unconnected inputs do not stop the analysis.
 */
const stepsWithUnconnectedInputs = computed(() => {
  const toolInfo = toValue(workflowStepsToolInfo)
  const release = toValue(galaxyInstance)?.version_major
  return Object.entries(toValue(unconnectedInputsByStep)).map(([stepId, inputs]) => ({
    stepId,
    toolName: toolInfo[stepId]?.name ?? stepId,
    description: describeUnconnectedDatasetInputs(inputs),
    refuses: unconnectedInputsRefuseInvocation(inputs, release),
  }))
})

const stepsRefusingUnconnectedInputs = computed(() => toValue(stepsWithUnconnectedInputs).filter(step => step.refuses))
const stepsWarnedForUnconnectedInputs = computed(() => toValue(stepsWithUnconnectedInputs).filter(step => !step.refuses))

/**
 * Everything that refuses the submission before it is sent, in one place, so
 * that Run's disabled state and the refusal in `runAnalysis` — the one that
 * holds when Enter submits past a disabled button — cannot disagree.
 */
const submissionRefused = computed(() =>
  toValue(blockingTools).length > 0
  || toValue(stepsRefusingUnconnectedInputs).length > 0
  || Boolean(toValue(describeError)),
)

/**
 * The same sentence, by step, so the panel and the summary cannot word one
 * step's mark two ways — and the same verdict, so the panel colours it as the
 * summary does.
 */
const unconnectedInputsMark = computed(() => Object.fromEntries(
  toValue(stepsWithUnconnectedInputs).map(step => [step.stepId, step]),
))

/**
 * What the editable parameter model is *of*: the analysis being copied, and
 * the set of steps the revision declares.
 *
 * The seeding below is keyed on this rather than on the model object,
 * because the model is rebuilt whenever the description is — and the Retry
 * beside an unavailable step refetches it on purpose. Re-seeding then would
 * throw away everything the reader had typed, with nothing on screen to say
 * so. A pinned revision is immutable, so the same steps mean the same saved
 * values and there is nothing new to seed from.
 */
const parameterModelSource = computed(() => [
  toValue(analysisId) ?? 'none',
  toValue(dbAnalysis) ? 'loaded' : 'pending',
  Object.keys(toValue(workflowParametersModel)).join(','),
].join('|'))

watch(parameterModelSource, () => {
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
}, { immediate: true })
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
                <!--
                  A step whose tool could not be read is un-editable and says
                  so, rather than rendering an empty panel that looks like a
                  tool with no parameters (#96). The retry is the only way
                  back: the description is cached without expiry, so a tool
                  installed since, or a Galaxy that has come back, is picked
                  up when the reader asks for it.
                -->
                <UAlert
                  v-if="stepId !== undefined && unavailableByStep[stepId]"
                  :data-testid="`step-unavailable-${stepId}`"
                  role="status"
                  variant="subtle"
                  color="warning"
                  icon="i-lucide:unplug"
                  title="This step cannot be edited"
                  :description="describeUnavailableTool(unavailableByStep[stepId]!)"
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
                <template v-else-if="stepId !== undefined && galaxyWorkflowStepProps?.[stepId]">
                  <!--
                    A data parameter nothing feeds (#97). A warning where
                    Galaxy starts the analysis anyway, and coloured as the
                    refusal it is where Galaxy would refuse it (#105) — the
                    summary above Run says which. There is no field to offer
                    either way: a data parameter is fed by a connection, by
                    one of the workflow's own input steps or by a default the
                    workflow gives it, never by a widget on this panel, which
                    is why it is a mark and not a picker.
                  -->
                  <UAlert
                    v-if="unconnectedInputsMark[stepId]"
                    :data-testid="`step-unconnected-${stepId}`"
                    role="status"
                    variant="subtle"
                    :color="unconnectedInputsMark[stepId]?.refuses ? 'error' : 'warning'"
                    icon="i-lucide:unlink"
                    title="An input of this step is not connected"
                    :description="unconnectedInputsMark[stepId]?.description"
                  />
                  <GalaxyWorkflowStep
                    v-bind="galaxyWorkflowStepProps[stepId]" variant="form"
                  />
                </template>
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
      <!--
        A description that never arrived leaves the form with no inputs and
        no steps, which is indistinguishable from a workflow that declares
        none — so it says so, and offers the only way back. The retry beside
        an unavailable step cannot serve here: there are no steps to render
        it in.
      -->
      <UAlert
        v-if="describeError"
        data-testid="workflow-description-error"
        role="alert"
        variant="subtle"
        color="error"
        icon="i-lucide:alert-octagon"
        title="This workflow could not be read"
        :description="describeError.message"
        class="mb-3"
      >
        <template #actions>
          <UButton
            data-testid="retry-workflow-description"
            size="xs"
            color="error"
            variant="outline"
            :loading="describingWorkflow"
            @click="retryDescription()"
          >
            Retry
          </UButton>
        </template>
      </UAlert>
      <!--
        Marked before submit, and only what would refuse it (Q10): Galaxy
        will not run a revision whose tools are not installed at the versions
        it pins, so this analysis cannot start until they are. A tool merely
        unreachable is not here — Galaxy may be well again by the time the
        reader submits, and the values that will be sent come from the
        workflow's saved parameters rather than from the tool definition.
      -->
      <UAlert
        v-if="blockingTools.length > 0"
        data-testid="blocking-tools"
        role="alert"
        variant="subtle"
        color="error"
        icon="i-lucide:alert-octagon"
        title="This version cannot be run"
        class="mb-3"
      >
        <template #description>
          <ul class="list-disc ps-5">
            <li v-for="tool in blockingTools" :key="`${tool.toolId}@${tool.toolVersion}`">
              {{ describeUnavailableTool(tool) }}
            </li>
          </ul>
        </template>
      </UAlert>
      <!--
        A required dataset input nothing feeds, on a Galaxy that refuses the
        invocation for it: 24.2 and later (#105). Refused here for the reason
        the tools above are, before the datasets have been uploaded rather
        than by Galaxy after. Each step is named here or in the warning
        below, never both.
      -->
      <UAlert
        v-if="stepsRefusingUnconnectedInputs.length > 0"
        data-testid="blocking-unconnected-inputs"
        role="alert"
        variant="subtle"
        color="error"
        icon="i-lucide:unlink"
        title="Some steps cannot run without an input that is not connected"
        class="mb-3"
      >
        <template #description>
          <ul class="list-disc ps-5">
            <li v-for="step in stepsRefusingUnconnectedInputs" :key="step.stepId">
              <span class="font-medium">{{ step.toolName }}</span>: {{ step.description }}
            </li>
          </ul>
        </template>
      </UAlert>
      <!--
        Marked before submit and not blocking (#97): Galaxy accepts an
        invocation whose data parameter nothing feeds when the parameter is
        optional, or on a release before 24.2, so Run stays enabled and this
        says what the analysis will do. A release the form has not learnt
        lands here too. Named here as well as in the step panel because the
        accordion is collapsed until a reader opens it, and a warning only
        visible behind a click is not a warning given before submit.
      -->
      <UAlert
        v-if="stepsWarnedForUnconnectedInputs.length > 0"
        data-testid="unconnected-inputs"
        role="status"
        variant="subtle"
        color="warning"
        icon="i-lucide:unlink"
        title="Some steps have an input that is not connected"
        class="mb-3"
      >
        <template #description>
          <ul class="list-disc ps-5">
            <li v-for="step in stepsWarnedForUnconnectedInputs" :key="step.stepId">
              <span class="font-medium">{{ step.toolName }}</span>: {{ step.description }}
            </li>
          </ul>
        </template>
      </UAlert>
      <UButton
        type="submit"
        :loading="startingAnalysis"
        :disabled="submissionRefused"
      >
        Run
      </UButton>
    </UForm>
    <template #error="{ error }">
      <pre>{{ error }}</pre>
    </template>
  </NuxtErrorBoundary>
</template>
