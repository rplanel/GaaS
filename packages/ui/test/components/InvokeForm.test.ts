import type { GalaxyIntegerToolParameter, GalaxyTool } from 'blendtype'
import type { IncomingMessage } from 'node:http'
import type { DescribedStep, DescribedWorkflowInput, UnavailableTool } from 'nuxt-galaxy'
import type { UploadedDatasetDb } from '../../app/components/galaxy/workflow/InvokeForm.vue'
import { UApp } from '#components'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'

import { useQueryCache } from '@pinia/colada'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import InvokeForm from '../../app/components/galaxy/workflow/InvokeForm.vue'

/** The status the analyses endpoint refuses the next submission with. */
let refuseWith: number | null = null
/**
 * The words it refuses with, in the JSON body's `statusMessage`, as a 400
 * naming a left-out input does (#43). `null` refuses with none, as
 * `toHttpError` does for the statuses that have no words of their own.
 */
let refuseMessage: string | null = null
/** Whether it answers 200 with nothing in the body, as it did before #25. */
let serveEmptyBody = false

/** How many times the form actually asked the server to start an analysis. */
let requestsMade = 0
/** The body of the last submission that reached the endpoint. */
let lastBody: Record<string, unknown> | null = null

/** The Galaxy identifier the workflow row the form is started for carries. */
const GALAXY_WORKFLOW_ID = 'galaxy-wf-1'
/** The Galaxy revision that row is pinned to, its `revision` column. */
const WORKFLOW_REVISION = 3
/** The revision the form last asked for a description of, `null` when it asked for none. */
let describedRevision: number | null = null
/** How many times the form asked the server to describe the revision. */
let descriptionsServed = 0
/** The tools the description reports as unusable, and why. */
let unavailableTools: UnavailableTool[] = []
/** The status the description endpoint refuses with, or `null` to answer it. */
let describeWith: number | null = null

/** The inputs the workflow declares, as the description endpoint serves them. */
let workflowInputs: Record<string, DescribedWorkflowInput> = {}
/** The steps it declares, keyed by step id, as the description endpoint serves them. */
let workflowSteps: Record<string, DescribedStep> = {}
/** Which tools the description carries definitions for; the two below unless a test says otherwise. */
let servedTools: AToolStep[] = []
/** The datamap of the analysis being copied, when the form is copying one. */
let storedDatamap: Record<string, UploadedDatasetDb> | null = null
/** Whether the query for the pickable datasets fails instead of answering. */
let datasetsUnavailable = false

/** The rows the dataset picker offers, distinctive enough to trace. */
const DATASETS = [
  { id: 1, dataset_name: 'reads.fastq', metadata: null, owner_id: 'owner-1', storage_object_id: 'so-reads' },
  { id: 2, dataset_name: 'genome.fasta', metadata: null, owner_id: 'owner-1', storage_object_id: 'so-genome' },
] satisfies UploadedDatasetDb[]

function anInput(label: string, uuid: string): DescribedWorkflowInput {
  return { label, value: '', uuid }
}

/**
 * A tool one step is pinned to. `id` is the toolshed guid Galaxy knows it by,
 * whose last two segments are the name and version the accordion header
 * reads off it; `parameter` is the single input that step offers, named
 * distinctly per tool so one panel can be told apart from its neighbour's by
 * what it renders.
 */
interface AToolStep {
  id: string
  version: string
  name: string
  description: string
  parameter: string
  parameterLabel: string
  /**
   * A parameter this tool shares with another version of itself, under one
   * name and a label of its own. Two versions of one tool usually differ by
   * what a shared parameter *is* rather than by which parameters exist, and
   * that difference is invisible unless the name is the same (#100).
   */
  sharedParameter?: { name: string, label: string }
}

const TOOL_A: AToolStep = {
  id: 'toolshed.g2.bx.psu.edu/repos/iuc/seqtk/seqtk_seq/1.3',
  version: '1.3',
  name: 'seqtk_seq',
  description: 'Convert FASTQ to FASTA',
  parameter: 'quality_cutoff',
  parameterLabel: 'Quality cutoff',
}

const TOOL_B: AToolStep = {
  id: 'toolshed.g2.bx.psu.edu/repos/iuc/fasttree/fasttree/2.1.10',
  version: '2.1.10',
  name: 'fasttree',
  description: 'Build an approximately-maximum-likelihood tree',
  parameter: 'bootstrap_replicates',
  parameterLabel: 'Bootstrap replicates',
}

/**
 * The one parameter a tool offers. Deliberately not a `data` parameter:
 * the composable filters those out of `toolInputParameters`, so a panel
 * built from one would render nothing whether or not #83 is fixed.
 */
function anIntegerParameter(name: string, label: string): GalaxyIntegerToolParameter {
  return {
    model_class: 'IntegerToolParameter',
    type: 'integer',
    name,
    label,
    argument: null,
    help: '',
    refresh_on_change: false,
    optional: false,
    hidden: false,
    is_dynamic: false,
    min: 1,
    max: 100,
    value: '10',
    area: false,
  }
}

/** A tool as the proxy describes it, under the id its step names it by. */
function aTool(tool: AToolStep): GalaxyTool {
  return {
    model_class: 'Tool',
    id: tool.id,
    name: tool.name,
    version: tool.version,
    description: tool.description,
    edam_operations: [],
    edam_topics: [],
    tool_shed_repository: {
      name: tool.name,
      owner: 'iuc',
      changeset_revision: 'abc123',
      tool_shed: 'toolshed.g2.bx.psu.edu',
    },
    inputs: parametersOf(tool),
    outputs: [],
  }
}

/** Every parameter a tool declares: its own, and any it shares with another version of itself. */
function parametersOf(tool: AToolStep): GalaxyIntegerToolParameter[] {
  const parameters = [anIntegerParameter(tool.parameter, tool.parameterLabel)]
  if (tool.sharedParameter) {
    parameters.push(anIntegerParameter(tool.sharedParameter.name, tool.sharedParameter.label))
  }
  return parameters
}

/**
 * One tool step of the workflow. `tool_inputs` has to carry the parameter by
 * name as well as the tool definition declaring it: `Step.vue` renders a
 * parameter only where the step's own model holds a value under that name.
 */
function aToolStep(id: number, tool: AToolStep): DescribedStep {
  return {
    id,
    type: 'tool',
    label: null,
    uuid: `step-uuid-${id}`,
    tool_id: tool.id,
    tool_version: tool.version,
    annotation: null,
    tool_inputs: {
      [tool.parameter]: '10',
      ...(tool.sharedParameter ? { [tool.sharedParameter.name]: '10' } : {}),
    },
    input_connections: {},
    outputs: [],
  }
}

/**
 * What each of the three Supabase queries behind this form is answered with,
 * chosen by the relation it reads.
 */
function servedRows(relation: string) {
  switch (relation) {
    case 'workflows':
      return { id: 1, name: 'A workflow', galaxy_id: GALAXY_WORKFLOW_ID, revision: WORKFLOW_REVISION, definition: null }
    case 'uploaded_datasets_with_storage_path':
      if (datasetsUnavailable) {
        throw new Error('the dataset list is unavailable')
      }
      return DATASETS
    case 'analyses':
      return { name: 'First run', parameters: {}, datamap: storedDatamap }
    default:
      throw new Error(`no rows are registered for "${relation}"`)
  }
}

/**
 * `useQuery` hands the client straight to the Supabase query builder, so only
 * the steps those three chains call have to exist. Each one returns the same
 * object and `.then` resolves with whatever the relation `.from()` named
 * holds — anything else is a `TypeError` rather than a silent empty result.
 */
function fakeSupabaseClient() {
  let relation = ''
  const chain = {
    schema: () => chain,
    from: (name: string) => {
      relation = name
      return chain
    },
    select: () => chain,
    eq: () => chain,
    limit: () => chain,
    single: () => chain,
    then: (resolve: (response: { data: unknown, error: null, count: null }) => unknown) =>
      Promise.resolve(resolve({ data: servedRows(relation), error: null, count: null })),
  }
  return chain
}

const supabase = fakeSupabaseClient()
mockNuxtImport('useSupabaseClient', () => () => supabase)

/**
 * The one call the form makes for the revision and every tool it pins (#87).
 * `registerEndpoint` matches a path literally, so this registration is the
 * proof that the form asked for the revision the row is pinned to: any other
 * revision, or the unpinned read the form used to make, reaches nothing.
 *
 * Only the definitions of the tools the steps actually name are served, so a
 * test that marks one unavailable gets a description with a hole in it,
 * which is what the endpoint answers.
 */
registerEndpoint(
  `/api/galaxy/workflows/${GALAXY_WORKFLOW_ID}/revisions/${WORKFLOW_REVISION}/description`,
  (event) => {
    describedRevision = WORKFLOW_REVISION
    descriptionsServed += 1
    if (describeWith !== null) {
      event.node.res.statusCode = describeWith
      return { statusCode: describeWith, statusMessage: 'Galaxy service is unavailable' }
    }
    const unusable = new Set(unavailableTools.map(tool => `${tool.toolId}@${tool.toolVersion}`))
    const tools: Record<string, GalaxyTool> = {}
    for (const tool of servedTools) {
      const key = `${tool.id}@${tool.version}`
      if (!unusable.has(key)) {
        tools[key] = aTool(tool)
      }
    }
    return { steps: workflowSteps, inputs: workflowInputs, tools, unavailable: unavailableTools }
  },
)

/**
 * The submitted JSON. `readBody` would mean importing `h3`, which is not a
 * declared dependency of this package — the same reason the refusals below
 * set the status on the response directly. The harness has already buffered
 * the body onto the request by the time the handler runs, which is the same
 * place `readBody` would reach for it last.
 */
function submittedBody(req: IncomingMessage): Record<string, unknown> {
  const { body } = req as IncomingMessage & { body?: string }
  if (body === undefined)
    throw new Error('the harness did not buffer the request body onto req.body')
  return JSON.parse(body)
}

/**
 * The real endpoint's refusals, as `toHttpError` sends them: a status, and
 * words in the body only when the server had some. The status is set on the
 * Node response rather than through `createError` so this test does not reach
 * for `h3`, which is not a declared dependency of this package. That also
 * leaves the reason phrase to the transport: empty in this harness, as it is
 * over HTTP/2, and Node's default for the status — "Bad Request" for a 400 —
 * over HTTP/1.1 when the server set none. Neither is the server's sentence,
 * which is why the form reads the body.
 */
registerEndpoint('/api/db/analyses', {
  method: 'POST',
  handler: (event) => {
    requestsMade += 1
    lastBody = submittedBody(event.node.req)
    if (refuseWith !== null) {
      event.node.res.statusCode = refuseWith
      return { statusCode: refuseWith, statusMessage: refuseMessage ?? 'Refused' }
    }
    if (serveEmptyBody) {
      return null
    }
    return { id: 7 }
  },
})

/**
 * `analysisId` copies an existing analysis, which is how a test gets a
 * selection into the form: the picker's own menu opens in a portal outside
 * the wrapper, while the stored datamap arrives through the same form state
 * a selection writes to.
 */
async function mountForm({ analysisId }: { analysisId?: number } = {}) {
  return mountSuspended({
    components: { UApp, InvokeForm },
    template: `<UApp><InvokeForm :workflow-id="1" ${analysisId === undefined ? '' : `:analysis-id="${analysisId}"`} /></UApp>`,
  })
}

/** The field an input's selector and its error are rendered in. */
function inputField(form: Awaited<ReturnType<typeof mountForm>>, stepId: string) {
  return form.find(`[data-testid="workflow-input-${stepId}"]`)
}

/** Wait for the workflow to arrive and its inputs to be on the page. */
async function inputFieldOf(form: Awaited<ReturnType<typeof mountForm>>, stepId: string) {
  await vi.waitFor(() => {
    expect(inputField(form, stepId).exists()).toBe(true)
  })
  return inputField(form, stepId)
}

/**
 * Choose a dataset for an input the way the picker does. `USelectMenu` is a
 * `v-model` over Reka's `ComboboxRoot`, so setting that model is the write a
 * reader's click performs — and it travels the `v-model` binding on the
 * field, which is the half of #39 a stored datamap cannot reach: a binding
 * writing to the wrong key would leave every other test here passing.
 *
 * The picker is found by the same name its field carries, so a field and a
 * binding that disagree cannot both be satisfied.
 */
async function choose(
  form: Awaited<ReturnType<typeof mountForm>>,
  stepId: string,
  dataset: UploadedDatasetDb,
) {
  await pickerOf(form, stepId).findComponent({ name: 'ComboboxRoot' }).setValue(dataset)
}

/** The dataset picker rendered for `stepId`, found by the name its field carries. */
function pickerOf(form: Awaited<ReturnType<typeof mountForm>>, stepId: string) {
  const picker = form
    .findAllComponents({ name: 'USelectMenu' })
    .find(candidate => candidate.props('name') === `inputs.${stepId}`)
  if (!picker) {
    throw new Error(`no dataset picker is rendered for step ${stepId}`)
  }
  return picker
}

/**
 * What the picker for `stepId` offers once the reader has opened it and typed
 * `text` into its filter, as the labels of the options listed.
 *
 * The menu renders in a portal on `document.body`, outside the wrapper, so it
 * is reached through the trigger's `aria-controls`, which names the one menu
 * that belongs to this picker.
 */
async function offeredAfterTyping(
  form: Awaited<ReturnType<typeof mountForm>>,
  stepId: string,
  text: string,
): Promise<string[]> {
  const trigger = pickerOf(form, stepId).find('button[aria-haspopup="listbox"]')
  await trigger.trigger('click')

  const menu = await vi.waitFor(() => {
    const element = document.getElementById(trigger.attributes('aria-controls') ?? '')
    expect(element, 'the picker opened its menu').not.toBeNull()
    return element!
  })
  const filter = menu.querySelector<HTMLInputElement>('input[role="combobox"]')
  if (!filter) {
    throw new Error('the picker has no filter input')
  }
  filter.value = text
  filter.dispatchEvent(new Event('input', { bubbles: true }))

  return vi.waitFor(() => {
    const options = Array.from(menu.querySelectorAll('[role="option"]'))
      .map(option => option.textContent?.trim() ?? '')
    expect(options, 'the filter reached the list').not.toEqual(DATASETS.map(dataset => dataset.dataset_name))
    return options
  })
}

/** Name the analysis and ask for it, the way a reader does. */
async function submit(wrapper: Awaited<ReturnType<typeof mountForm>>) {
  await wrapper.find('input[name="name"]').setValue('My analysis')
  await wrapper.find('form').trigger('submit')
}

/**
 * Wait until every one of `tools` is listed as a step *and* its definition
 * has arrived. The description is the proof of the second: the header reads
 * it off the fetched tool, so it is empty until that fetch lands, and a panel
 * opened before then would be empty for a reason that has nothing to do
 * with #83.
 */
async function toolStepsReady(
  form: Awaited<ReturnType<typeof mountForm>>,
  tools: AToolStep[],
) {
  await vi.waitFor(() => {
    for (const tool of tools) {
      expect(form.text(), `the step running ${tool.name} is listed`).toContain(tool.description)
      expect(form.text(), `the step running ${tool.name} names its version`).toContain(`v${tool.version}`)
    }
  })
}

/**
 * Open the panel of the step running `tool` and answer with what it renders.
 *
 * Read through the trigger's `aria-controls` rather than off the whole form,
 * so an assertion names one step's panel and cannot be satisfied by its
 * neighbour's. Each panel is opened and read in turn because `UAccordion` is
 * single-open — showing the second collapses the first, and Reka unmounts a
 * collapsed panel rather than hiding it.
 *
 * Looked up inside the wrapper, not on `document`: a panel renders inline,
 * unlike the dataset picker's menu, and the mounted wrapper is not attached
 * to the document, so `getElementById` would answer `null` for every panel
 * whether or not it opened.
 */
async function parametersShownFor(
  form: Awaited<ReturnType<typeof mountForm>>,
  tool: AToolStep,
): Promise<string> {
  // Matched on the version as well as the name, because a workflow may run
  // the same tool at two versions and the name alone would then always
  // answer with the first step's panel (#100). The header renders both.
  const trigger = form
    .findAll('button')
    .find(candidate => candidate.text().includes(tool.name) && candidate.text().includes(`v${tool.version}`))
  if (!trigger) {
    throw new Error(`no accordion trigger is rendered for the step running ${tool.name} ${tool.version}`)
  }
  await trigger.trigger('click')

  const panelId = trigger.attributes('aria-controls')
  if (!panelId) {
    throw new Error(`the trigger for the step running ${tool.name} names no panel`)
  }
  const panel = await vi.waitFor(() => {
    const element = form.element.querySelector(`[id="${panelId}"]`)
    expect(element, `the step running ${tool.name} opened its panel`).not.toBeNull()
    return element!
  })
  await nextTick()
  return panel.textContent ?? ''
}

/**
 * The Colada cache the mounted app shares, reached from inside a component
 * because the store needs the app's pinia and a test body is outside it.
 */
let queryCache: ReturnType<typeof useQueryCache> | undefined

/**
 * Forget every answer between tests.
 *
 * The Colada cache outlives one mount, so the first test's workflow would
 * otherwise be served to every test after it. The entries are **removed**
 * rather than invalidated: the description is cached with no expiry on
 * purpose — a pinned revision is immutable — and invalidating only marks an
 * entry stale, which a `staleTime` of forever then reads as fresh anyway.
 */
async function forgetCachedAnswers() {
  if (!queryCache) {
    await mountSuspended(defineComponent({
      setup() {
        queryCache = useQueryCache()
        return () => h('div')
      },
    }))
  }
  for (const entry of queryCache!.getEntries()) {
    queryCache!.remove(entry)
  }
}

beforeEach(async () => {
  refuseWith = null
  refuseMessage = null
  describedRevision = null
  descriptionsServed = 0
  unavailableTools = []
  describeWith = null
  serveEmptyBody = false
  requestsMade = 0
  lastBody = null
  workflowInputs = {}
  workflowSteps = {}
  servedTools = [TOOL_A, TOOL_B]
  storedDatamap = null
  datasetsUnavailable = false
  await forgetCachedAnswers()
})

// This used to have to be first in the file: every mount shares one Colada
// cache, so only the first met a cold one and could observe the dataset
// query failing rather than being served an earlier test's answer. #87's
// description query is cached with no expiry at all, which made that
// ordering rule insufficient rather than merely fragile, so `beforeEach`
// now empties the cache outright — and every test, this one included, meets
// a cold cache wherever it sits.
describe('an input whose pickable datasets never arrived', () => {
  // The fields are where the errors for those inputs render. Gating them on
  // the list having arrived would hide both, and Run would go back to doing
  // nothing the reader can see — the shape #36 and #39 are both about.
  it('is still refused, against the input, with a visible error', async () => {
    datasetsUnavailable = true
    workflowInputs = { 0: anInput('Sequence data', 'input-uuid-0') }
    const form = await mountForm()
    await inputFieldOf(form, '0')

    await submit(form)

    await vi.waitFor(() => {
      expect(inputField(form, '0').text()).toContain('Required')
    })
    expect(requestsMade).toBe(0)
  })
})

describe('invokeForm component', () => {
  // #48. The proxy answered with Galaxy's latest revision while the server
  // compares the datamap against, and now invokes, the one the row is pinned
  // to; a save in Galaxy's editor that added an input would have shown a
  // field the server then refused. The form asks for the revision the row is
  // pinned to, which is the one that will run.
  it('asks Galaxy for the revision the row is pinned to, not the latest', async () => {
    await mountForm()

    await vi.waitFor(() => {
      expect(describedRevision).toBe(WORKFLOW_REVISION)
    })
  })

  it('can mount component', async () => {
    const component = await mountForm()
    expect(component.text()).toContain('Select workflow parameters')
  })

  // #36: `z.string().max(256)` accepts `''`, so a name that was typed and then
  // cleared validated, `UForm` emitted submit, and `runAnalysis`' own falsy
  // guard dropped it without a word. Nothing reached the server and nothing
  // reached the reader.
  it('refuses a name the reader typed and then cleared', async () => {
    const form = await mountForm()

    await form.find('input[name="name"]').setValue('My analysis')
    await form.find('input[name="name"]').setValue('')
    await form.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(form.text()).toContain('Required')
    })
    expect(requestsMade).toBe(0)
  })

  // An untouched name is `undefined`, which plain `z.string()` already
  // rejected. Pinned so the `min(1)` above cannot be traded for it.
  it('refuses a name the reader never entered', async () => {
    const form = await mountForm()

    await form.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(form.text()).toContain('Required')
    })
    expect(requestsMade).toBe(0)
  })

  it('sends the name the reader entered', async () => {
    const form = await mountForm()

    await submit(form)

    await vi.waitFor(() => {
      expect(requestsMade).toBe(1)
    })
    expect(lastBody).toMatchObject({ name: 'My analysis', workflowId: 1 })
  })

  // #61. `min(1)` measured the name as typed, so a name of only spaces had a
  // length and was sent; the server then refused it (#47) and the reader was
  // told after a round trip, in the server's words, what the `Required`
  // marker says one keystroke earlier for an empty name.
  it('refuses a name of only spaces as it refuses an empty one', async () => {
    const form = await mountForm()

    await form.find('input[name="name"]').setValue('   ')
    await form.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(form.text()).toContain('Required')
    })
    expect(requestsMade).toBe(0)
  })

  it('sends the name without the spaces around it', async () => {
    const form = await mountForm()

    await form.find('input[name="name"]').setValue('  My analysis  ')
    await form.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(requestsMade).toBe(1)
    })
    expect(lastBody).toMatchObject({ name: 'My analysis' })
  })

  // The rule is the column's width, `varchar(256)`, and the server accepts
  // exactly 256 (#47); the message used to say "less than 256", which the
  // rule never enforced.
  it('accepts a name of exactly 256 characters', async () => {
    const form = await mountForm()

    await form.find('input[name="name"]').setValue('a'.repeat(256))
    await form.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(requestsMade).toBe(1)
    })
    expect(lastBody).toMatchObject({ name: 'a'.repeat(256) })
  })

  it('refuses a name of 257 characters, saying how many are allowed', async () => {
    const form = await mountForm()

    await form.find('input[name="name"]').setValue('a'.repeat(257))
    await form.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(form.text()).toContain('Must be at most 256 characters')
    })
    expect(requestsMade).toBe(0)
  })

  it('tells the reader when Galaxy refuses the submission', async () => {
    refuseWith = 503
    const form = await mountForm()

    await submit(form)

    await vi.waitFor(() => {
      expect(form.text()).toContain('Galaxy is unavailable right now')
    })
    // `UAlert` carries no role of its own, so without this the refusal is
    // silent to a reader using a screen reader
    expect(form.find('[role="alert"]').text()).toContain('Galaxy is unavailable right now')
  })

  it('offers a way back to the login page when the session has gone', async () => {
    refuseWith = 401
    const form = await mountForm()

    await submit(form)

    await vi.waitFor(() => {
      expect(form.text()).toContain('Your session expired')
    })
    // the action has to go somewhere, or the 401 still silently does nothing
    const signIn = form.find('[data-testid="start-analysis-failure-sign-in"]')
    expect(signIn.exists()).toBe(true)
    expect(signIn.attributes('href')).toBe('/login')
  })

  it('does not offer the login page for a refusal the session cannot fix', async () => {
    refuseWith = 404
    const form = await mountForm()

    await submit(form)

    await vi.waitFor(() => {
      expect(form.text()).toContain('That workflow is no longer available')
    })
    expect(form.find('[data-testid="start-analysis-failure-sign-in"]').exists()).toBe(false)
  })

  // #46. #43 made the server name the input a datamap left out, and the form
  // showed the "our side" copy over it. The name arrives before the workflow
  // does, so a reader who submits during that window is the common path here.
  it('shows the reader the input the server said was left out', async () => {
    refuseWith = 400
    refuseMessage = 'No dataset was provided for the input "Input FASTQ"'
    const form = await mountForm()

    await submit(form)

    await vi.waitFor(() => {
      expect(form.find('[role="alert"]').text()).toContain('No dataset was provided for the input "Input FASTQ"')
    })
    // nothing went wrong on our side, and the same submission would be
    // refused the same way, so neither line of the generic copy fits
    expect(form.text()).not.toContain('Something went wrong on our side')
    // the session is fine; offering the login page would send them in a circle
    expect(form.find('[data-testid="start-analysis-failure-sign-in"]').exists()).toBe(false)
  })

  // #25 stopped the server answering 200 with an empty body. The reader is
  // told if it ever does again, rather than meeting the bare `TypeError` the
  // destructure used to throw into a catch that discarded it.
  it('tells the reader when the server answers with no analysis', async () => {
    serveEmptyBody = true
    const form = await mountForm()

    await submit(form)

    await vi.waitFor(() => {
      expect(form.text()).toContain('Could not start the analysis')
    })
  })

  // `login.vue` navigates to whatever this cookie holds and falls back to the
  // default page, so an unset cookie would strand the reader away from the
  // workflow they were starting.
  it('records where to return before sending the reader to sign in', async () => {
    refuseWith = 401
    const form = await mountForm()

    await submit(form)
    await vi.waitFor(() => {
      expect(form.text()).toContain('Your session expired')
    })
    await form.find('[data-testid="start-analysis-failure-sign-in"]').trigger('click')

    expect(document.cookie).toContain('redirect-path')
  })
})

// #39: the selections lived in a ref of their own, so `:state` never carried
// them, `UForm` had nothing to validate, and `required` on those fields was
// decorative. A submission with an unselected input went through, and the
// server prepared a history for a run it could not start.
describe('workflow inputs the reader has to choose', () => {
  it('refuses an input the reader never selected, and sends nothing', async () => {
    workflowInputs = { 0: anInput('Sequence data', 'input-uuid-0') }
    const form = await mountForm()
    await inputFieldOf(form, '0')

    await submit(form)

    await vi.waitFor(() => {
      expect(inputField(form, '0').text()).toContain('Required')
    })
    expect(requestsMade).toBe(0)
  })

  // The field's `name` and the path zod reports its issue at have to be the
  // same string. Asserting only that *some* error appears would pass with the
  // two disagreeing, which is the state #39 found them in: the error would be
  // matched by no field and rendered nowhere.
  it('renders the error against the input it belongs to, not the one the reader chose', async () => {
    workflowInputs = {
      0: anInput('Sequence data', 'input-uuid-0'),
      1: anInput('Reference genome', 'input-uuid-1'),
    }
    const form = await mountForm()
    await inputFieldOf(form, '1')

    await choose(form, '0', DATASETS[0]!)
    await submit(form)

    await vi.waitFor(() => {
      expect(inputField(form, '1').text()).toContain('Required')
    })
    expect(inputField(form, '0').text()).not.toContain('Required')
    expect(requestsMade).toBe(0)
  })

  it('sends each chosen dataset under the step it was chosen for', async () => {
    workflowInputs = {
      0: anInput('Sequence data', 'input-uuid-0'),
      1: anInput('Reference genome', 'input-uuid-1'),
    }
    const form = await mountForm()
    await inputFieldOf(form, '1')

    await choose(form, '0', DATASETS[0]!)
    await choose(form, '1', DATASETS[1]!)
    await submit(form)

    await vi.waitFor(() => {
      expect(requestsMade).toBe(1)
    })
    expect(lastBody).toMatchObject({
      datamap: {
        0: { storage_object_id: 'so-reads' },
        1: { storage_object_id: 'so-genome' },
      },
    })
  })
})

// #44: the picker offered **Create "…"** for any text typed, and clicking it
// did nothing: `USelectMenu` only emits `create`, and nothing here listened.
// The picker chooses among datasets already uploaded, so it offers nothing
// but those. Asserted on the options a reader is shown, not on the prop that
// used to produce the dead one.
describe('the dataset picker', () => {
  it('offers the datasets that match what the reader typed, and no action', async () => {
    workflowInputs = { 0: anInput('Sequence data', 'input-uuid-0') }
    const form = await mountForm()
    await inputFieldOf(form, '0')

    const offered = await offeredAfterTyping(form, '0', 'reads')

    // the typed text reached the list: without this, an empty menu would pass
    expect(offered).toContain('reads.fastq')
    expect(offered.filter(option => option.startsWith('Create'))).toEqual([])
  })
})

// Copying an analysis seeds the same form state a selection writes to, so a
// stored datamap that no longer covers the workflow's inputs is refused the
// same way an untouched picker is, rather than re-running with a gap in it.
describe('an analysis copied from an earlier one', () => {
  it('sends the selections it was stored with', async () => {
    workflowInputs = {
      0: anInput('Sequence data', 'input-uuid-0'),
      1: anInput('Reference genome', 'input-uuid-1'),
    }
    storedDatamap = { 0: DATASETS[0]!, 1: DATASETS[1]! }
    const form = await mountForm({ analysisId: 11 })
    await inputFieldOf(form, '1')

    await form.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(requestsMade).toBe(1)
    })
    expect(lastBody).toMatchObject({
      name: 'Copy of First run',
      datamap: {
        0: { storage_object_id: 'so-reads' },
        1: { storage_object_id: 'so-genome' },
      },
    })
  })

  it('is refused on the input its stored datamap does not cover', async () => {
    workflowInputs = {
      0: anInput('Sequence data', 'input-uuid-0'),
      1: anInput('Reference genome', 'input-uuid-1'),
    }
    storedDatamap = { 0: DATASETS[0]! }
    const form = await mountForm({ analysisId: 12 })
    await inputFieldOf(form, '1')

    await form.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(inputField(form, '1').text()).toContain('Required')
    })
    expect(requestsMade).toBe(0)
  })
})

describe('the parameters a workflow\'s tool steps offer', () => {
  // #83. `galaxyWorkflowStepProps` reset its map to empty inside the loop it
  // filled, so each pass discarded the one before and only the last tool step
  // kept an entry. Every earlier step's panel then rendered nothing, with no
  // error and nothing on screen to say a parameter had gone missing — which
  // is why this asserts on the first step's panel, not on a count.
  it('are offered for every tool step, not only the last', async () => {
    workflowSteps = { 0: aToolStep(0, TOOL_A), 1: aToolStep(1, TOOL_B) }
    const form = await mountForm()
    await toolStepsReady(form, [TOOL_A, TOOL_B])

    expect(await parametersShownFor(form, TOOL_A)).toContain(TOOL_A.parameterLabel)
    expect(await parametersShownFor(form, TOOL_B)).toContain(TOOL_B.parameterLabel)
  })

  // The case that passed throughout, kept so the fix cannot be traded for one
  // that keeps only the first entry instead of only the last.
  it('are offered for the only tool step of a one-step workflow', async () => {
    workflowSteps = { 0: aToolStep(0, TOOL_A) }
    const form = await mountForm()
    await toolStepsReady(form, [TOOL_A])

    expect(await parametersShownFor(form, TOOL_A)).toContain(TOOL_A.parameterLabel)
  })
})

/**
 * #100. A workflow may pin the **same tool at two versions**, and each step
 * must be offered the parameters of the version *that step* pins.
 *
 * The two tools below share one `tool_id` on purpose. A toolshed guid
 * carries its version inside the id — `…/seqtk_seq/1.3` and `…/seqtk_seq/1.4`
 * are two different strings — so the one kind of tool whose id really is the
 * same at two versions is a **built-in**: `Cut1`, `__BUILD_LIST__`,
 * `Grep1`. That is what this pins.
 *
 * Before the fix the composable dropped the version from the endpoint's own
 * key on the way past, so both definitions landed under `Cut1` and the last
 * one read won. The step on 1.0.2 was then offered 1.1.0's parameter list
 * bound to 1.0.2's saved values: a parameter 1.0.2 does not have rendered
 * and submitted, and one it does have dropped.
 */
describe('a workflow pinning one tool at two versions', () => {
  const CUT_OLD: AToolStep = {
    id: 'Cut1',
    version: '1.0.2',
    name: 'Cut1',
    description: 'Cut columns from a table',
    parameter: 'columnList',
    parameterLabel: 'Cut columns',
    sharedParameter: { name: 'delimiter', label: 'Delimited by a tab' },
  }

  const CUT_NEW: AToolStep = {
    ...CUT_OLD,
    version: '1.1.0',
    // A parameter 1.0.2 does not have, and a different reading of the one
    // both versions do have: the two ways a step can be handed the wrong
    // version's form.
    parameter: 'header_lines',
    parameterLabel: 'Header lines to keep',
    sharedParameter: { name: 'delimiter', label: 'Delimited by anything' },
  }

  beforeEach(() => {
    servedTools = [CUT_OLD, CUT_NEW]
    workflowSteps = { 1: aToolStep(1, CUT_OLD), 2: aToolStep(2, CUT_NEW) }
  })

  it('offers each step the parameters of the version that step pins', async () => {
    const form = await mountForm()
    await toolStepsReady(form, [CUT_OLD, CUT_NEW])

    // Asserted separately, panel by panel: the failure this replaces was one
    // step being handed its neighbour's parameter list, which only shows up
    // when each panel is read on its own.
    const older = await parametersShownFor(form, CUT_OLD)
    expect(older, 'the step pinned to 1.0.2 offers 1.0.2\'s parameter').toContain(CUT_OLD.parameterLabel)
    expect(older, 'and not 1.1.0\'s').not.toContain(CUT_NEW.parameterLabel)

    const newer = await parametersShownFor(form, CUT_NEW)
    expect(newer, 'the step pinned to 1.1.0 offers 1.1.0\'s parameter').toContain(CUT_NEW.parameterLabel)
    expect(newer, 'and not 1.0.2\'s').not.toContain(CUT_OLD.parameterLabel)
  })

  it('reads a parameter both versions declare as its own version declares it', async () => {
    // The commoner shape, and the one a disjoint parameter set cannot show:
    // two versions usually differ in what a shared parameter *is* — its
    // label, its bounds, which widget renders it — rather than in which
    // parameters exist. Keyed by bare id both steps were handed the last
    // definition read, so both rendered the same version's reading of it.
    const form = await mountForm()
    await toolStepsReady(form, [CUT_OLD, CUT_NEW])

    expect(await parametersShownFor(form, CUT_OLD)).toContain(CUT_OLD.sharedParameter!.label)
    expect(await parametersShownFor(form, CUT_NEW)).toContain(CUT_NEW.sharedParameter!.label)
  })
})

/**
 * #87. Galaxy refuses to run a revision whose tools are not installed at the
 * versions it pins, so the form says so before the reader fills anything in.
 * Q10 applied honestly splits the verdicts: only what would refuse the
 * submission refuses it here.
 */
describe('a revision whose tools Galaxy cannot serve', () => {
  /** Open the accordion panel of the step running `tool` and answer with its root element. */
  async function panelOf(form: Awaited<ReturnType<typeof mountForm>>, tool: AToolStep) {
    const trigger = await vi.waitFor(() => {
      const found = form.findAll('button').find(candidate => candidate.text().includes(tool.name))
      expect(found, `the step running ${tool.name} is listed`).toBeDefined()
      return found!
    })
    await trigger.trigger('click')
    const panelId = trigger.attributes('aria-controls')
    return vi.waitFor(() => {
      const element = form.element.querySelector(`[id="${panelId}"]`)
      expect(element, `the step running ${tool.name} opened its panel`).not.toBeNull()
      return element!
    })
  }

  it('names the tools that would refuse the submission, and refuses it', async () => {
    workflowSteps = { 2: aToolStep(2, TOOL_A), 3: aToolStep(3, TOOL_B) }
    unavailableTools = [
      { toolId: TOOL_A.id, toolVersion: TOOL_A.version, reason: 'not_installed' },
      { toolId: TOOL_B.id, toolVersion: TOOL_B.version, reason: 'version_mismatch', servedVersion: '3.0' },
    ]
    const form = await mountForm()

    const alert = await vi.waitFor(() => {
      const found = form.find('[data-testid="blocking-tools"]')
      expect(found.exists(), 'the form marked the revision as unrunnable').toBe(true)
      return found
    })
    expect(alert.text()).toContain(TOOL_A.id)
    expect(alert.text()).toContain('is not installed')
    expect(alert.text()).toContain('is installed only at 3.0')
    expect(form.find('button[type="submit"]').attributes('disabled')).toBeDefined()

    // Submitted through the form rather than the button, so the refusal
    // being real is what this reads, not the button being disabled.
    await submit(form)
    await nextTick()

    expect(requestsMade).toBe(0)
  })

  it('does not refuse the submission for a tool that is merely unreachable', async () => {
    // Galaxy may be well again by the time the reader submits, and the
    // values that go up come from the workflow's saved parameters rather
    // than from the tool definition, so nothing here would submit wrong.
    workflowSteps = { 2: aToolStep(2, TOOL_A) }
    unavailableTools = [{ toolId: TOOL_A.id, toolVersion: TOOL_A.version, reason: 'unreachable' }]
    const form = await mountForm()
    await vi.waitFor(() => {
      expect(form.text()).toContain(TOOL_A.name)
    })

    expect(form.find('[data-testid="blocking-tools"]').exists()).toBe(false)
    await submit(form)

    await vi.waitFor(() => {
      expect(requestsMade).toBe(1)
    })
  })

  it('renders an unreachable tool\'s step un-editable, with the reason and a retry that picks it up', async () => {
    workflowSteps = { 2: aToolStep(2, TOOL_A) }
    unavailableTools = [{ toolId: TOOL_A.id, toolVersion: TOOL_A.version, reason: 'unreachable' }]
    const form = await mountForm()

    const panel = await panelOf(form, TOOL_A)
    await vi.waitFor(() => {
      expect(panel.textContent, 'the step says why it cannot be edited').toContain('could not be read from Galaxy')
    })
    // An empty panel is what #96 is about: a tool that failed must never
    // look like a tool that loaded with no parameters.
    expect(panel.textContent).not.toContain(TOOL_A.parameterLabel)

    unavailableTools = []
    await form.find('[data-testid="retry-workflow-description"]').trigger('click')

    await vi.waitFor(() => {
      expect(descriptionsServed, 'the retry asked Galaxy again').toBe(2)
      expect(panel.textContent, 'the step is editable again').toContain(TOOL_A.parameterLabel)
    })
  })
})

/**
 * #87. One request per revision, shared through Pinia Colada. The old pair
 * of composables used raw `$fetch`, so every mount refetched the workflow
 * and every one of its tools.
 */
describe('a revision described a second time', () => {
  it('is served from the cache rather than fetched again', async () => {
    workflowSteps = { 2: aToolStep(2, TOOL_A) }
    const first = await mountForm()
    await toolStepsReady(first, [TOOL_A])
    expect(descriptionsServed).toBe(1)

    const second = await mountForm()
    await toolStepsReady(second, [TOOL_A])

    expect(descriptionsServed).toBe(1)
  })
})

/**
 * #87. One shared, never-expiring Colada entry is the point of the
 * refactor, and it is also the new hazard: whatever the form hands a widget
 * to write into must not be the cached description itself. The pair of
 * composables this replaced re-fetched per mount, so nothing they leaked
 * outlived one screen.
 */
describe('the cached description and what the reader edits', () => {
  /**
   * The widget rendered for `tool`'s one parameter, found inside the step's
   * own panel. `UUInputNumber` carries no `name`, so the widget is reached
   * through the component `Step.vue` binds its `v-model` to — which is the
   * binding under test.
   */
  /**
   * Open the panel of the step running `tool`. `UAccordion` is single-open
   * and Reka unmounts a collapsed panel, so only one step's contents exist
   * at a time.
   */
  async function openStep(form: Awaited<ReturnType<typeof mountForm>>, tool: AToolStep) {
    const trigger = await vi.waitFor(() => {
      const found = form.findAll('button').find(candidate => candidate.text().includes(tool.name))
      expect(found, `the step running ${tool.name} is listed`).toBeDefined()
      return found!
    })
    if (trigger.attributes('aria-expanded') !== 'true') {
      await trigger.trigger('click')
    }
  }

  async function widgetFor(form: Awaited<ReturnType<typeof mountForm>>, tool: AToolStep) {
    await openStep(form, tool)
    return vi.waitFor(() => {
      const found = form
        .findAllComponents({ name: 'GalaxyIntegerToolParameter' })
        .find(widget => widget.props('name') === tool.parameter)
      expect(found, `the widget for ${tool.parameter} is rendered`).toBeDefined()
      return found!
    })
  }

  /** Type a value into it, the way the widget's own `v-model` writes back. */
  async function edit(widget: Awaited<ReturnType<typeof widgetFor>>, value: string) {
    widget.vm.$emit('update:modelValue', value)
    await nextTick()
  }

  it('does not write the reader\'s edit back into the cache', async () => {
    workflowSteps = { 2: aToolStep(2, TOOL_A) }
    const first = await mountForm()
    await edit(await widgetFor(first, TOOL_A), '30')

    // Mounted again, as navigating away and back does. The cached answer is
    // served — no second request — so if the edit reached it, it is now the
    // revision's "saved" value for every reader of this revision.
    const second = await mountForm()
    const widget = await widgetFor(second, TOOL_A)

    expect(descriptionsServed, 'the second mount was served from the cache').toBe(1)
    expect(widget.props('modelValue')).toBe('10')
  })

  it('keeps the reader\'s edits when the description is refetched', async () => {
    // The retry beside an unavailable step refetches, which rebuilds the
    // parameter model. Re-seeding from it would silently discard everything
    // typed so far — and a pinned revision is immutable, so there is nothing
    // new to seed from anyway.
    workflowSteps = { 2: aToolStep(2, TOOL_A), 3: aToolStep(3, TOOL_B) }
    unavailableTools = [{ toolId: TOOL_B.id, toolVersion: TOOL_B.version, reason: 'unreachable' }]
    const form = await mountForm()
    await edit(await widgetFor(form, TOOL_A), '30')

    unavailableTools = []
    // The retry lives in the unavailable step's own panel, and opening that
    // collapses the one just edited — which is the shape of the loss: the
    // edit is no longer on screen when the refetch lands.
    await openStep(form, TOOL_B)
    await form.find('[data-testid="retry-workflow-description"]').trigger('click')

    // Waited for through the *rendered* consequence of the new description
    // rather than through the request count: the reseed this guards against
    // happens after the response lands, so asserting any earlier passes
    // whether or not the seeding was fixed.
    await vi.waitFor(() => {
      expect(descriptionsServed).toBe(2)
      expect(form.find('[data-testid="step-unavailable-3"]').exists(), 'step 3 became editable').toBe(false)
    })
    await nextTick()

    expect((await widgetFor(form, TOOL_A)).props('modelValue')).toBe('30')
  })
})

/**
 * #87. A description that never arrived leaves the form with no inputs and
 * no steps — the same shape as a workflow that declares none. The pair of
 * composables this replaced threw, which at least reached the error
 * boundary; a Colada query reports the failure instead, and something has
 * to read it.
 */
describe('a workflow the server could not describe', () => {
  it('says so, refuses to submit, and offers the only retry there is', async () => {
    describeWith = 503
    const form = await mountForm()

    const alert = await vi.waitFor(() => {
      const found = form.find('[data-testid="workflow-description-error"]')
      expect(found.exists(), 'the failure is on screen').toBe(true)
      return found
    })
    expect(alert.text()).toContain('could not be read')
    expect(form.find('button[type="submit"]').attributes('disabled')).toBeDefined()

    // Through the form, so what is read is the refusal and not the button.
    await submit(form)
    await nextTick()
    expect(requestsMade).toBe(0)

    // The per-step retry cannot serve here: there are no steps to render it in.
    describeWith = null
    await form.find('[data-testid="retry-workflow-description"]').trigger('click')
    await vi.waitFor(() => {
      expect(form.find('[data-testid="workflow-description-error"]').exists()).toBe(false)
    })
    expect(form.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })
})
