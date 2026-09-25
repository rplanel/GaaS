<script setup lang="ts">
import type { FormErrorEvent } from '@nuxt/ui'

/**
 * Prototype B: the same Galaxy workflow, with each step's form inside its own
 * node instead of in a panel beside the canvas.
 *
 * What this variant is for is the question the panel version cannot answer:
 * does a Nuxt UI form work *inside* a Vue Flow node? It does, because Vue
 * Flow renders nodes inline in the component tree rather than teleporting
 * them, so `UForm` — which wraps the whole canvas here — is still an ancestor
 * of every field and every `UFormField` still resolves its context and
 * renders its error in place.
 *
 * What it costs is visible as soon as you open more than one step: the canvas
 * becomes a pile of tall forms, the zoom that fits them all is the zoom that
 * makes them unreadable, and a teleported dropdown renders at page scale over
 * a node drawn at canvas scale. Compare `/test/workflow-graph`.
 *
 * Live, as there: the workflow, the steps and the tool definitions. Mocked:
 * the dataset list, and Run, which prints the payload rather than posting it.
 */

/** Stands in for a row of `uploaded_datasets_with_storage_path`. */
interface MockDataset {
  id: number
  dataset_name: string
}

const MOCK_DATASETS: MockDataset[] = [
  { id: 1, dataset_name: 'genome.fasta' },
  { id: 2, dataset_name: 'reads_R1.fastq.gz' },
  { id: 3, dataset_name: 'annotations.gff3' },
]

// ---------------------------------------------------------------- workflow

const { data: galaxyWorkflows } = await useFetch('/api/galaxy/workflows')

const workflowItems = computed(() =>
  (galaxyWorkflows.value ?? []).map(workflow => ({
    label: `${workflow.name} — ${workflow.number_of_steps} steps`,
    value: workflow.id,
  })),
)

const selectedWorkflowId = ref<string | undefined>(undefined)

watch(workflowItems, (items) => {
  if (!selectedWorkflowId.value) {
    selectedWorkflowId.value = items[0]?.value
  }
}, { immediate: true })

const {
  workflowSteps,
  workflowInputs,
  workflowToolIds,
  workflowParametersModel,
} = useGalaxyWorkflow(selectedWorkflowId)

const { toolsObj, toolInputParameters } = useGalaxyTool(workflowToolIds)

/** One component per tool input, per tool — the real widget set. */
const toolInputComponents = computed(() => {
  const tools = toValue(toolsObj)
  return Object.entries(tools).reduce<Record<string, Record<string, unknown>>>(
    (acc, [toolId, tool]) => {
      const { inputComponentsObject } = useGalaxyToolInputComponent(tool.inputs)
      if (inputComponentsObject.value) {
        acc[toolId] = inputComponentsObject.value
      }
      return acc
    },
    {},
  )
})

/** The parameters being edited, seeded from what the revision was saved with. */
const parametersModel = ref<Record<string, Record<string, unknown>>>({})
watch(workflowParametersModel, (model) => {
  parametersModel.value = JSON.parse(JSON.stringify(model))
}, { immediate: true, deep: true })

/** What the canvas calls an input node: the label the workflow gives it. */
const inputLabels = computed(() =>
  Object.fromEntries(
    Object.entries(toValue(workflowInputs)).map(([stepId, input]) => [stepId, input.label]),
  ),
)

/**
 * The props `GalaxyWorkflowStep` needs, for whichever step is asking.
 *
 * A function rather than a map built ahead of time: every node calls it for
 * itself, so there is no shared object to get half-filled — which is what
 * `InvokeForm.vue:194` does, re-initialising its map inside its own loop so
 * that only the last tool step survives.
 */
function stepProps(stepId: string) {
  const step = toValue(workflowSteps)[stepId]
  if (!step || step.type !== 'tool' || !step.tool_id) {
    return undefined
  }
  return {
    workflowStep: step,
    toolParameters: toValue(toolInputParameters)[step.tool_id],
    parametersInputsComponent: toValue(toolInputComponents)[step.tool_id],
    workflowParametersModel: parametersModel.value[stepId],
  }
}

// ------------------------------------------------------------ folded state

/**
 * Which nodes show their form. Every step starts unfolded so the variant
 * shows what it is; folding is how a workflow of any size stays navigable,
 * and folding changes the layout because it changes how tall a node is.
 */
const openSteps = ref<string[]>([])
watch(workflowSteps, (steps) => {
  openSteps.value = Object.keys(steps)
}, { immediate: true })

function toggleStep(stepId: string) {
  openSteps.value = openSteps.value.includes(stepId)
    ? openSteps.value.filter(id => id !== stepId)
    : [...openSteps.value, stepId]
}

const allOpen = computed(() => openSteps.value.length === Object.keys(toValue(workflowSteps)).length)

function toggleAll() {
  openSteps.value = allOpen.value ? [] : Object.keys(toValue(workflowSteps))
}

// ------------------------------------------------------------------- form

const state = reactive<{
  analysisName: string | undefined
  inputs: Record<string, MockDataset | undefined>
}>({ analysisName: undefined, inputs: {} })

const invalidSteps = ref<string[]>([])
const payload = ref<unknown>(null)

const graph = ref<{ focus: (stepIds: string[]) => void, fit: () => void } | null>(null)
const direction = ref<'LR' | 'TB'>('LR')

watch(selectedWorkflowId, () => {
  invalidSteps.value = []
  payload.value = null
})

function validate() {
  const errors: { name: string, message: string }[] = []
  if (!state.analysisName?.trim()) {
    errors.push({ name: 'analysisName', message: 'Required' })
  }
  for (const stepId of Object.keys(toValue(workflowInputs))) {
    if (!state.inputs[stepId]) {
      errors.push({ name: `inputs.${stepId}`, message: 'Required' })
    }
  }
  return errors
}

/**
 * A refused field now lives inside a node, which is better than the panel
 * version in one way and worse in another: the error renders exactly where
 * the reader has to act, but only if that node is unfolded and on screen. So
 * a refusal unfolds the nodes it names before moving the view onto them.
 */
function onError(event: FormErrorEvent) {
  const stepIds = (event.errors ?? [])
    .map(error => error.name?.startsWith('inputs.') ? error.name.slice('inputs.'.length) : undefined)
    .filter((stepId): stepId is string => stepId !== undefined)

  invalidSteps.value = stepIds
  if (stepIds.length > 0) {
    openSteps.value = [...new Set([...openSteps.value, ...stepIds])]
    nextTick(() => graph.value?.focus(stepIds))
  }
}

function onSubmit() {
  invalidSteps.value = []
  const { encodedParameters } = useGalaxyEncodeParameters(parametersModel.value)
  payload.value = {
    name: state.analysisName,
    datamap: state.inputs,
    parameters: toValue(encodedParameters),
    galaxyWorkflowId: selectedWorkflowId.value,
  }
}
</script>

<template>
  <UDashboardPanel id="workflow-graph-in-node-prototype">
    <template #header>
      <UDashboardNavbar title="Workflow graph — forms in nodes" :toggle="false">
        <template #right>
          <USelectMenu
            v-model="selectedWorkflowId"
            :items="workflowItems"
            value-key="value"
            placeholder="Pick a Galaxy workflow"
            icon="i-lucide:workflow"
            class="w-80"
            data-testid="workflow-picker"
          />
          <UButton
            :icon="allOpen ? 'i-lucide:fold-vertical' : 'i-lucide:unfold-vertical'"
            variant="subtle"
            color="neutral"
            data-testid="toggle-all"
            @click="toggleAll"
          >
            {{ allOpen ? 'Fold all' : 'Unfold all' }}
          </UButton>
          <UButton
            :icon="direction === 'LR' ? 'i-lucide:move-horizontal' : 'i-lucide:move-vertical'"
            variant="subtle"
            color="neutral"
            @click="direction = direction === 'LR' ? 'TB' : 'LR'"
          >
            {{ direction }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <NuxtErrorBoundary>
        <UAlert
          class="mb-4"
          variant="subtle"
          color="info"
          icon="i-lucide:flask-conical"
          title="Prototype B — forms in the nodes"
          description="Each step edits itself on the canvas. Nodes drag by their header; fields, scroll areas and the fold button do not drag the node. Compare with /test/workflow-graph, which keeps the form in a panel."
        />

        <UForm
          :state="state"
          :validate="validate"
          @submit="onSubmit"
          @error="onError"
        >
          <!--
            The analysis name and Run belong to no step, so they stay off the
            canvas — where they are always reachable, whatever the view is
            showing.
          -->
          <div class="flex items-end gap-3 mb-4">
            <UFormField label="Name of the analysis" name="analysisName" required class="grow">
              <UInput v-model="state.analysisName" class="w-full" placeholder="Enter a name" />
            </UFormField>
            <UButton type="submit" icon="i-lucide:play" size="lg">
              Run
            </UButton>
          </div>

          <div class="h-[72vh] border border-default rounded-[calc(var(--ui-radius)*2)] overflow-hidden">
            <ClientOnly>
              <ProtoWorkflowFormGraph
                ref="graph"
                :steps="workflowSteps"
                :labels="inputLabels"
                :invalid="invalidSteps"
                :open="openSteps"
                :direction="direction"
                @toggle="toggleStep"
              >
                <template #node="{ stepId, step }">
                  <!-- an input step: the datamap entry it stands for -->
                  <UFormField
                    v-if="inputLabels[stepId] !== undefined"
                    :label="inputLabels[stepId]"
                    :name="`inputs.${stepId}`"
                    required
                  >
                    <USelectMenu
                      v-model="state.inputs[stepId]"
                      :items="MOCK_DATASETS"
                      label-key="dataset_name"
                      icon="i-material-symbols:dataset"
                      class="w-full nodrag"
                      :data-testid="`dataset-picker-${stepId}`"
                      :search-input="{ placeholder: 'Filter…', icon: 'i-lucide:search' }"
                    />
                  </UFormField>

                  <!-- a tool step: the real parameter widgets for that tool -->
                  <GalaxyWorkflowStep
                    v-else-if="stepProps(stepId)"
                    v-bind="stepProps(stepId)!"
                    variant="form"
                  />

                  <p v-else class="text-sm opacity-60">
                    {{ step.type }} — nothing to set here.
                  </p>
                </template>
              </ProtoWorkflowFormGraph>

              <template #fallback>
                <div class="size-full grid place-items-center text-sm opacity-60">
                  Loading canvas…
                </div>
              </template>
            </ClientOnly>
          </div>
        </UForm>

        <UCard v-if="payload" variant="subtle" class="mt-4">
          <template #header>
            <h3 class="font-semibold">
              Payload this would POST to <code>/api/db/analyses</code>
            </h3>
          </template>
          <pre class="text-xs overflow-x-auto">{{ JSON.stringify(payload, null, 2) }}</pre>
        </UCard>

        <template #error="{ error }">
          <UAlert color="error" variant="subtle" title="Could not load the workflow" :description="String(error)" />
        </template>
      </NuxtErrorBoundary>
    </template>
  </UDashboardPanel>
</template>
