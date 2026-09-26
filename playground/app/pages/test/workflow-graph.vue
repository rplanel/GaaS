<script setup lang="ts">
import type { FormErrorEvent } from '@nuxt/ui'
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'

/**
 * Prototype: a Galaxy workflow drawn as a graph, with its parameters edited
 * from the canvas.
 *
 * Everything the canvas shows is live: the workflow list, the workflow and
 * its tool definitions all come from the configured Galaxy instance through
 * the `nuxt-galaxy` proxy, and the parameter fields are the real components
 * `useGalaxyToolInputComponent` builds from each tool's own inputs — the same
 * ones `GalaxyWorkflowInvokeForm` renders in its accordion.
 *
 * Two things are deliberately fake, because this page starts nothing:
 * the dataset list (there is no analysis history here) and the Run button,
 * which shows the payload it would post instead of posting it.
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

// The first workflow Galaxy lists, so the page has something on it before
// anybody picks. Written once: re-running on every list change would undo a
// selection the reader just made.
watch(workflowItems, (items) => {
  if (!selectedWorkflowId.value) {
    selectedWorkflowId.value = items[0]?.value
  }
}, { immediate: true })

/**
 * The revision to describe. `useGalaxyWorkflowDescription` takes one because
 * the endpoint behind it does (#87, Q15): a pinned revision is immutable and
 * so cacheable, while Galaxy's latest moves with every save in its editor.
 * These prototypes never pinned one, so they ask for the last revision
 * Galaxy lists, which is the one they described before. #91 replaces both
 * pages with the real graph and this goes with them.
 */
const { data: revisions } = useQuery(() => ({
  ...galaxyWorkflowRevisionsQuery({ workflowId: selectedWorkflowId.value ?? '' }),
  enabled: selectedWorkflowId.value !== undefined,
}))

// Read off the entries' `version`, the 0-based index Galaxy indexes a
// revision by, **never off their position** — the rule `PublishVersionModal`
// states and the reason it has a `newestOf`. Galaxy does not promise the
// list is in index order.
const latestRevision = computed(() => {
  const listed = revisions.value ?? []
  return listed.length === 0
    ? undefined
    : listed.reduce((newest, candidate) => (candidate.version > newest.version ? candidate : newest)).version
})

const {
  workflowSteps,
  workflowInputs,
  workflowParametersModel,
  stepToTool,
  toolsObj,
  toolInputParameters,
} = useGalaxyWorkflowDescription(selectedWorkflowId, latestRevision)

/**
 * One component per tool input, per tool — the real widget set, built from
 * what each tool declares rather than from anything this page knows.
 */
const toolInputComponents = computed(() => {
  const tools = toValue(toolsObj)
  return Object.entries(tools).reduce<Record<string, Record<string, unknown>>>(
    // Keyed `<toolId>@<version>`, as `toolsObj` is: a workflow may pin the
    // same tool at two versions, and by bare id one step would be handed the
    // other version's widgets (#100).
    (acc, [pinnedTool, tool]) => {
      const { inputComponentsObject } = useGalaxyToolInputComponent(tool.inputs)
      if (inputComponentsObject.value) {
        acc[pinnedTool] = inputComponentsObject.value
      }
      return acc
    },
    {},
  )
})

/**
 * The parameters being edited, seeded from what the revision was saved with.
 * A copy, not the computed itself: the fields write into this object, and the
 * computed is rebuilt from the fetched workflow. Reseeded when the workflow
 * changes, which is the only moment the edits stop meaning anything.
 */
const parametersModel = ref<Record<string, Record<string, unknown>>>({})
watch(workflowParametersModel, (model) => {
  parametersModel.value = JSON.parse(JSON.stringify(model))
}, { immediate: true, deep: true })

// -------------------------------------------------------------- selection

const selectedStepId = ref<string | undefined>(undefined)

/** Steps the last submission refused, and the payload the last one built. */
const invalidSteps = ref<string[]>([])
const payload = ref<unknown>(null)

watch(selectedWorkflowId, () => {
  selectedStepId.value = undefined
  invalidSteps.value = []
  payload.value = null
})

const selectedStep = computed(() => {
  const stepId = selectedStepId.value
  return stepId === undefined ? undefined : toValue(workflowSteps)[stepId]
})

/**
 * The props `GalaxyWorkflowStep` needs for the one step the panel is showing.
 *
 * Built for the selected step alone rather than for every step at once: a
 * panel only ever renders one, and the map the invoke form builds for all of
 * them re-initialises itself inside its loop, so only its last tool step
 * survives (`InvokeForm.vue:194`).
 */
const selectedStepProps = computed(() => {
  const step = toValue(selectedStep)
  if (!step || step.type !== 'tool' || !step.tool_id) {
    return undefined
  }
  const stepId = selectedStepId.value as string
  // The tool this step pins, not its bare id: both maps are keyed
  // `<toolId>@<version>` (#100).
  const pinnedTool = toValue(stepToTool)[stepId] ?? ''
  return {
    workflowStep: step,
    toolParameters: toValue(toolInputParameters)[pinnedTool],
    parametersInputsComponent: toValue(toolInputComponents)[pinnedTool],
    workflowParametersModel: parametersModel.value[stepId],
  }
})

/**
 * The label the workflow gives each of its input steps, by step id — what the
 * canvas calls those nodes, since the step itself carries no name.
 */
const inputLabels = computed(() =>
  Object.fromEntries(
    Object.entries(toValue(workflowInputs)).map(([stepId, input]) => [stepId, input.label]),
  ),
)

/** The label the workflow gives an input step, for the panel's picker. */
const selectedInputLabel = computed(() => {
  const stepId = selectedStepId.value
  return stepId === undefined ? undefined : toValue(workflowInputs)[stepId]?.label
})

// ------------------------------------------------------------------- form

const state = reactive<{
  analysisName: string | undefined
  inputs: Record<string, MockDataset | undefined>
}>({ analysisName: undefined, inputs: {} })

const graph = ref<{ focus: (stepIds: string[]) => void, fit: () => void } | null>(null)
const direction = ref<'LR' | 'TB'>('LR')

/**
 * The canvas and the step panel as one resizable pair: how much room a graph
 * needs against how much a tool's form needs is a judgement only the reader
 * can make, and it changes from one workflow to the next.
 *
 * `USplitter` is what this would be written with, but `@nuxt/ui` 4.10 — the
 * version this workspace resolves — does not ship it yet; it arrived later.
 * These are the same primitives it is built on, taken from `reka-ui`, which
 * is already here as `@nuxt/ui`'s own dependency and hoisted by this repo's
 * `shamefully-hoist`. Imported rather than declared on purpose: a second copy
 * of `reka-ui` in `playground/package.json` could resolve to a different
 * version than the one `@nuxt/ui` uses. Swapping in `USplitter` after an
 * upgrade is a template change and nothing else.
 *
 * Both panels carry a `defaultSize` and the group carries an `id` so that the
 * server and the client agree on the layout: ids generated per render differ
 * between the two and break resizing on hydration.
 */
function onSplitterDragging(dragging: boolean) {
  if (!dragging) {
    graph.value?.fit()
  }
}

/**
 * Plain function rather than a schema: the prototype has no zod of its own,
 * and what it has to show is not the validation but where the result of it
 * lands — a field inside a node the reader may not be looking at.
 */
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
 * What a canvas has to do that a form does not: say where the refusal is.
 *
 * The offending field can be off-screen, or at a zoom nobody can read, so the
 * nodes are marked, the first one is opened in the panel and the view is
 * moved onto all of them.
 */
function onError(event: FormErrorEvent) {
  const stepIds = (event.errors ?? [])
    .map(error => error.name?.startsWith('inputs.') ? error.name.slice('inputs.'.length) : undefined)
    .filter((stepId): stepId is string => stepId !== undefined)

  invalidSteps.value = stepIds
  if (stepIds[0]) {
    selectedStepId.value = stepIds[0]
    graph.value?.focus(stepIds)
  }
}

function onSubmit() {
  invalidSteps.value = []
  const { encodedParameters } = useGalaxyEncodeParameters(parametersModel.value)
  payload.value = {
    name: state.analysisName,
    datamap: state.inputs,
    parameters: toValue(encodedParameters),
    // The real endpoint takes the *database* workflow id of a published
    // version, not Galaxy's; this page never published one, so the Galaxy id
    // is shown in its place.
    galaxyWorkflowId: selectedWorkflowId.value,
  }
}
</script>

<template>
  <UDashboardPanel id="workflow-graph-prototype">
    <template #header>
      <UDashboardNavbar title="Workflow graph (prototype)" :toggle="false">
        <template #right>
          <USelectMenu
            v-model="selectedWorkflowId"
            :items="workflowItems"
            value-key="value"
            placeholder="Pick a Galaxy workflow"
            icon="i-lucide:workflow"
            class="w-96"
            data-testid="workflow-picker"
          />
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
          title="Prototype"
          description="Workflow, steps and tool parameters are live from the configured Galaxy instance. The dataset list is mocked and Run only prints the payload it would post."
        />

        <UForm
          :state="state"
          :validate="validate"
          @submit="onSubmit"
          @error="onError"
        >
          <div class="h-[70vh]">
            <SplitterGroup
              id="workflow-graph-split"
              direction="horizontal"
              auto-save-id="gaas-workflow-graph-split"
            >
              <!-- canvas -->
              <SplitterPanel
                id="workflow-graph-canvas"
                :default-size="65"
                :min-size="30"
              >
                <!--
                  A border rather than a ring: the panel clips what overflows
                  it, and a ring is a shadow drawn outside the box, so its
                  edges are cut and only the corners survive.
                -->
                <div class="size-full border border-default rounded-[calc(var(--ui-radius)*2)] overflow-hidden">
                  <ClientOnly>
                    <ProtoWorkflowGraph
                      ref="graph"
                      :steps="workflowSteps"
                      :selected="selectedStepId"
                      :invalid="invalidSteps"
                      :labels="inputLabels"
                      :direction="direction"
                      @select="stepId => selectedStepId = stepId"
                    />
                    <template #fallback>
                      <div class="size-full grid place-items-center text-sm opacity-60">
                        Loading canvas…
                      </div>
                    </template>
                  </ClientOnly>
                </div>
              </SplitterPanel>

              <SplitterResizeHandle
                id="workflow-graph-handle"
                class="group flex w-4 shrink-0 items-center justify-center outline-none"
                @dragging="onSplitterDragging"
              >
                <span
                  class="h-10 w-1 rounded-full bg-accented transition-colors group-hover:bg-primary group-focus-visible:bg-primary group-data-[state=drag]:bg-primary"
                />
              </SplitterResizeHandle>

              <!-- panel -->
              <SplitterPanel
                id="workflow-graph-panel"
                :default-size="35"
                :min-size="20"
              >
                <div class="flex flex-col h-full w-full min-h-0 gap-4 px-1">
                  <!-- scrolls on its own: a tool form is taller than any panel -->
                  <div class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 pe-1">
                    <UCard variant="outline">
                      <template #header>
                        <h3 class="font-semibold">
                          Analysis
                        </h3>
                      </template>
                      <UFormField label="Name of the analysis" name="analysisName" required>
                        <UInput v-model="state.analysisName" class="w-full" placeholder="Enter a name" />
                      </UFormField>
                    </UCard>

                    <UCard variant="outline">
                      <template #header>
                        <div class="flex items-center justify-between gap-2">
                          <h3 class="font-semibold">
                            <template v-if="selectedStepId === undefined">
                              No step selected
                            </template>
                            <template v-else>
                              Step #{{ selectedStepId }}
                            </template>
                          </h3>
                          <UBadge v-if="selectedStep" size="xs" variant="subtle">
                            {{ selectedStep.type }}
                          </UBadge>
                        </div>
                      </template>

                      <p v-if="selectedStepId === undefined" class="text-sm opacity-60">
                        Click a node on the canvas to edit what it runs with.
                      </p>

                      <!-- an input step: the datamap entry it stands for -->
                      <UFormField
                        v-else-if="selectedInputLabel !== undefined"
                        :label="selectedInputLabel"
                        :name="`inputs.${selectedStepId}`"
                        required
                      >
                        <USelectMenu
                          v-model="state.inputs[selectedStepId]"
                          :items="MOCK_DATASETS"
                          label-key="dataset_name"
                          icon="i-material-symbols:dataset"
                          class="w-full nodrag"
                          data-testid="dataset-picker"
                          :search-input="{ placeholder: 'Filter…', icon: 'i-lucide:search' }"
                        />
                      </UFormField>

                      <!-- a tool step: the real parameter widgets for that tool -->
                      <div v-else-if="selectedStepProps" class="ring ring-default rounded-[calc(var(--ui-radius))] -mx-2">
                        <GalaxyWorkflowStep v-bind="selectedStepProps" variant="form" />
                      </div>

                      <p v-else class="text-sm opacity-60">
                        This step has no parameters to set.
                      </p>
                    </UCard>
                  </div>

                  <UButton type="submit" icon="i-lucide:play" block>
                    Run
                  </UButton>
                </div>
              </SplitterPanel>
            </SplitterGroup>
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
