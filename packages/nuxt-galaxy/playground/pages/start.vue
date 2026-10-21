<script setup lang="ts">
import type { WorkflowParameterValue } from 'blendtype'
import type { Database } from 'nuxt-galaxy'
import ParameterWidget from '../components/ParameterWidget.vue'

type Dataset = Database['galaxy']['Views']['uploaded_datasets_with_storage_path']['Row']

const supabase = useSupabaseClient<Database>()
const requestFetch = useRequestFetch()

const { data: workflows } = useQuery(() => workflowsListQuery({ supabase }))
const { data: datasets } = useQuery(() => analysesOutputsViewQuery({ supabase }))
// What Galaxy refuses at invoke depends on its release (#105).
const { data: galaxyInstance } = useQuery(() => galaxyInstanceQuery({ requestFetch }))

const workflowId = ref<number>()
const workflow = computed(() => workflows.value?.find(candidate => candidate.id === workflowId.value))

const {
  workflowInputs,
  workflowToolSteps,
  workflowParametersModel,
  stepToTool,
  toolInputParameters,
  blockingTools,
  unconnectedInputsByStep,
  error: describeError,
} = useGalaxyWorkflowDescription(
  () => workflow.value?.galaxy_id,
  () => workflow.value?.revision,
)

const galaxyRelease = computed(() => galaxyInstance.value?.version_major)

/**
 * Whether Start is refused before anything is sent. One answer for the
 * disabled button and for a submission Enter makes past it.
 */
const refused = computed(() => startAnalysisRefused({
  blockingTools: blockingTools.value,
  unconnectedInputsByStep: unconnectedInputsByStep.value,
  galaxyRelease: galaxyRelease.value,
  descriptionFailed: Boolean(describeError.value),
}))

/**
 * The steps with a dataset input nothing feeds, with the tool each runs, and
 * whether this Galaxy release refuses to run them (#105) or runs the step
 * without it (#97).
 */
const stepsWithUnconnectedInputs = computed(() => Object.entries(unconnectedInputsByStep.value)
  .map(([stepId, inputs]) => ({
    stepId,
    toolId: workflowToolSteps.value[stepId]?.tool_id,
    description: describeUnconnectedDatasetInputs(inputs),
    refuses: unconnectedInputsRefuseInvocation(inputs, galaxyRelease.value),
  })))
const stepsRefusingUnconnectedInputs = computed(() => stepsWithUnconnectedInputs.value.filter(step => step.refuses))
const stepsWarnedForUnconnectedInputs = computed(() => stepsWithUnconnectedInputs.value.filter(step => !step.refuses))

const analysisName = ref('')
/** The dataset picked for each input, keyed by the input's step index. */
const datamap = ref<Record<string, Dataset | undefined>>({})

/**
 * The parameters the reader edits, by step index, seeded with what the
 * revision saved (#167). The description gives a fresh copy each time it
 * changes, and so only when another workflow is chosen: it is cached for
 * ever and never refetched under the reader.
 */
const parameters = ref(workflowParametersModel.value)
watch(workflowParametersModel, (saved) => {
  parameters.value = saved
})

/**
 * The parameters a tool step offers a widget for: those the tool the step
 * pins declares, as far as the step saved them (`nuxt-galaxy`'s rule, #167).
 */
function stepParameters(stepId: string) {
  const pinned = stepToTool.value[stepId]
  const declared = pinned === undefined ? [] : toolInputParameters.value[pinned] ?? []
  return parametersSavedIn(declared, parameters.value[stepId] ?? {})
}

/** An edit of one of a step's parameters, written as a new bag for the step, as every level below writes one. */
function setParameter(stepId: string, name: string, value: WorkflowParameterValue) {
  const step = parameters.value[stepId]
  if (step !== undefined)
    parameters.value = { ...parameters.value, [stepId]: { ...step, [name]: value } }
}

// The request, its encoding and the words for a refused start (#163).
const { start, starting, failure } = useStartAnalysis()
/** The analysis the last start created, if it created one. */
const startedId = ref<number>()
/**
 * What the schema found wrong, keyed by the path of each issue, which is
 * also the `name` of the field it is about: `analysisName`, `inputs.<step>`.
 */
const issues = ref<Record<string, string>>({})

/** The `name` of an input's dataset field, which is also the path the schema reports its issue at. */
function inputFieldName(stepId: string) {
  return `inputs.${stepId}`
}

/** The id of the message saying what is wrong with a field, if anything is. */
function issueId(field: string) {
  return issues.value[field] === undefined ? undefined : `${field}-issue`
}

async function startAnalysis() {
  // Cleared first, so that nothing still on screen from an earlier attempt
  // is read as this one's answer.
  startedId.value = undefined
  failure.value = null
  issues.value = {}
  const chosen = workflow.value
  if (!chosen)
    return
  // Validated before the gate, as @gaas/ui's form is, so a refused start
  // still says what is missing. Sent is what the schema outputs: the name
  // trimmed, and the datamap holding only the inputs this workflow declares.
  const parsed = startAnalysisSchema<Dataset>(Object.keys(workflowInputs.value))
    .safeParse({ analysisName: analysisName.value, inputs: datamap.value })
  if (!parsed.success) {
    issues.value = Object.fromEntries(parsed.error.issues.map(issue => [issue.path.join('.'), issue.message]))
    return
  }
  if (refused.value)
    return
  const created = await start({
    name: parsed.data.analysisName,
    datamap: parsed.data.inputs,
    parameters: parameters.value,
    workflowId: chosen.id,
  })
  startedId.value = created?.id
}
</script>

<template>
  <main>
    <h1>Start an analysis</h1>
    <form @submit.prevent="startAnalysis">
      <p>
        <label>
          Workflow
          <select v-model="workflowId" name="workflow" required>
            <option :value="undefined" disabled>
              Choose a workflow
            </option>
            <option v-for="candidate in workflows ?? []" :key="candidate.id" :value="candidate.id">
              {{ candidate.name }} {{ candidate.version_key }}
            </option>
          </select>
        </label>
      </p>
      <p v-for="(input, stepId) in workflowInputs" :key="stepId">
        <label>
          {{ input.label }}
          <select
            v-model="datamap[stepId]"
            :name="inputFieldName(stepId)"
            required
            :aria-invalid="issueId(inputFieldName(stepId)) !== undefined"
            :aria-describedby="issueId(inputFieldName(stepId))"
          >
            <option :value="undefined" disabled>
              Choose a dataset
            </option>
            <option v-for="(dataset, index) in datasets ?? []" :key="dataset.id ?? index" :value="dataset">
              {{ dataset.dataset_name }}
            </option>
          </select>
        </label>
        <span v-if="issueId(inputFieldName(stepId))" :id="issueId(inputFieldName(stepId))">{{ issues[inputFieldName(stepId)] }}</span>
      </p>
      <p>
        <label>
          Name of the analysis
          <input
            v-model="analysisName"
            name="analysisName"
            type="text"
            required
            :aria-invalid="issueId('analysisName') !== undefined"
            :aria-describedby="issueId('analysisName')"
          >
        </label>
        <span v-if="issueId('analysisName')" :id="issueId('analysisName')">{{ issues.analysisName }}</span>
      </p>
      <fieldset v-for="(step, stepId) in workflowToolSteps" :key="stepId" :data-testid="`step-${stepId}`">
        <legend>Step {{ stepId }}: {{ step.tool_id }}</legend>
        <ParameterWidget
          v-for="offered in stepParameters(stepId)"
          :key="offered.name"
          :parameter="offered"
          :model-value="parameters[stepId]?.[offered.name]"
          @update:model-value="setParameter(stepId, offered.name, $event)"
        />
      </fieldset>
      <div v-if="describeError" role="alert" data-testid="workflow-description-error">
        <p><strong>This workflow could not be read</strong></p>
        <p>{{ describeError.message }}</p>
      </div>
      <div v-if="blockingTools.length > 0" role="alert" data-testid="blocking-tools">
        <p>This version cannot be started:</p>
        <ul>
          <li v-for="tool in blockingTools" :key="`${tool.toolId}@${tool.toolVersion}`">
            {{ describeUnavailableTool(tool) }}
          </li>
        </ul>
      </div>
      <div v-if="stepsRefusingUnconnectedInputs.length > 0" role="alert" data-testid="blocking-unconnected-inputs">
        <p>Some steps cannot run without an input that is not connected:</p>
        <ul>
          <li v-for="step in stepsRefusingUnconnectedInputs" :key="step.stepId">
            {{ step.toolId }}: {{ step.description }}
          </li>
        </ul>
      </div>
      <div v-if="stepsWarnedForUnconnectedInputs.length > 0" role="status" data-testid="unconnected-inputs">
        <p>Some steps have an input that is not connected:</p>
        <ul>
          <li v-for="step in stepsWarnedForUnconnectedInputs" :key="step.stepId">
            {{ step.toolId }}: {{ step.description }}
          </li>
        </ul>
      </div>
      <div v-if="failure" role="alert" data-testid="start-analysis-failure">
        <p><strong>{{ failure.title }}</strong></p>
        <p>{{ failure.description }}</p>
        <p v-if="failure.signIn">
          <NuxtLink to="/login">
            Sign in
          </NuxtLink>
        </p>
      </div>
      <!-- Disabled while a start is in flight too, as @gaas/ui's loading button is, so a double click starts one analysis. -->
      <button type="submit" :disabled="refused || starting">
        Start
      </button>
    </form>
    <p v-if="startedId !== undefined" role="status">
      Analysis {{ startedId }} started.
    </p>
  </main>
</template>
