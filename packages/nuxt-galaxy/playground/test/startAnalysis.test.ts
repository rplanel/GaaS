/**
 * Starting an analysis in the second UI, the plain-HTML playground that
 * imports only `nuxt-galaxy` (ADR 0009, #165): choose a workflow, pick a
 * dataset for each of its inputs, name the analysis, set its parameters
 * (#167) and start it.
 *
 * Everything the page reads is faked at the boundary it reads it from: the
 * Supabase client for the workflows and the datasets, and the application's
 * own endpoints for the workflow's description, the Galaxy release and the
 * start itself. So what a test reads is what the page sent.
 */

import type { DOMWrapper } from '@vue/test-utils'
import type { GalaxyTool, WorkflowRepeatInstanceValue } from 'blendtype'
import type { IncomingMessage } from 'node:http'
import type { Database, DescribedStep, DescribedWorkflowInput, UnavailableTool } from 'nuxt-galaxy'
import type { WorkflowFixture } from '../../test/characterisation/fixtures'
import { GALAXY_INSTANCE_QUERY_KEYS } from '#imports'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { useQueryCache } from '@pinia/colada'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { declaredParameter, FIXTURES, loadFixture } from '../../test/characterisation/fixtures'
import { aStep, describedRevision } from '../../test/describedSteps'
import StartPage from '../pages/start.vue'

type Dataset = Database['galaxy']['Views']['uploaded_datasets_with_storage_path']['Row']

/** The Galaxy identifier of the one active workflow, and the revision its version pins. */
const GALAXY_WORKFLOW_ID = 'galaxy-wf-1'
const WORKFLOW_REVISION = 3

/** The active workflows, as the workflows table answers for them. */
const WORKFLOWS = [
  { id: 1, name: 'Integron finder', version_key: '2.0', galaxy_id: GALAXY_WORKFLOW_ID, revision: WORKFLOW_REVISION, active: true },
]

/** The datasets the user may pick, distinctive enough to trace. */
const DATASETS = [
  { id: 1, dataset_name: 'reads.fastq', metadata: null, owner_id: 'owner-1', storage_object_id: 'so-reads' },
  { id: 2, dataset_name: 'genome.fasta', metadata: null, owner_id: 'owner-1', storage_object_id: 'so-genome' },
] satisfies Dataset[]

/** The inputs the workflow declares, as its description serves them. */
let workflowInputs: Record<string, DescribedWorkflowInput> = {}
/** The steps it declares, and the definitions of the tools they pin, keyed `<toolId>@<version>`. */
let workflowSteps: Record<string, DescribedStep> = {}
let workflowTools: Record<string, GalaxyTool> = {}
/** The tools the description reports as unusable, and why. */
let unavailableTools: UnavailableTool[] = []
/** The status the description endpoint refuses with, or `null` to answer it. */
let descriptionRefusedWith: number | null = null
/** The `version_major` the Galaxy instance answers with. */
let galaxyRelease = '22.05'

/** How many times the page asked the server to start an analysis, and with what. */
let requestsMade = 0
let lastBody: Record<string, unknown> | null = null
/** The status the start is refused with, and the words in the body; `null` to start it. */
let refuseWith: { status: number, message: string } | null = null

function anInput(label: string): DescribedWorkflowInput {
  return { label, value: '', uuid: `uuid-${label}` }
}

const TOOL_ID = 'toolshed.g2.bx.psu.edu/repos/iuc/integron_finder/integron_finder/2.0.5'
const TOOL_VERSION = '2.0.5'

/** A tool declaring one required `data` parameter, labelled `label`. */
function aToolRequiringData(label: string): GalaxyTool {
  return {
    model_class: 'Tool',
    id: TOOL_ID,
    name: 'integron_finder',
    version: TOOL_VERSION,
    description: 'Find integrons',
    edam_operations: [],
    edam_topics: [],
    tool_shed_repository: { name: 'integron_finder', owner: 'iuc', changeset_revision: 'abc123', tool_shed: 'toolshed.g2.bx.psu.edu' },
    inputs: [{
      model_class: 'DataToolParameter',
      type: 'data',
      name: 'sequence',
      label,
      argument: null,
      help: '',
      refresh_on_change: false,
      optional: false,
      hidden: false,
      is_dynamic: false,
      value: null,
      extensions: ['fasta'],
      edam: { edam_formats: [], edam_data: [] },
      multiple: false,
      options: { hda: [], hdca: [] },
    }],
    outputs: [],
  }
}

/** A step running that tool, saved with `toolInputs`, and fed by no connection or default. */
function aToolStep(id: number, toolInputs: DescribedStep['tool_inputs']): DescribedStep {
  return {
    id,
    type: 'tool',
    label: null,
    uuid: `step-uuid-${id}`,
    tool_id: TOOL_ID,
    tool_version: TOOL_VERSION,
    annotation: null,
    tool_inputs: toolInputs,
    input_connections: {},
    input_defaults: {},
    outputs: [],
    subworkflow: null,
  }
}

/**
 * A step whose `data` parameter nothing feeds: Galaxy saves it as a runtime
 * value, and no connection or default supplies it.
 */
function aStepWithAnUnconnectedDataInput(id: number): DescribedStep {
  return aToolStep(id, { sequence: { __class__: 'RuntimeValue' } } as DescribedStep['tool_inputs'])
}

/**
 * What the Supabase query builder answers, by the relation `.from()` names.
 * Only the steps the page's queries call exist, so any other is a
 * `TypeError` rather than a silent empty answer.
 */
function fakeSupabaseClient() {
  let relation = ''
  const rowsOf: Record<string, unknown> = {
    workflows: WORKFLOWS,
    uploaded_datasets_with_storage_path: DATASETS,
  }
  const chain = {
    schema: () => chain,
    from: (name: string) => {
      relation = name
      return chain
    },
    select: () => chain,
    eq: () => chain,
    then: (resolve: (response: { data: unknown, error: null, count: null }) => unknown) => {
      if (!(relation in rowsOf))
        throw new Error(`no rows are registered for "${relation}"`)
      return Promise.resolve(resolve({ data: rowsOf[relation], error: null, count: null }))
    },
  }
  return chain
}

const supabase = fakeSupabaseClient()
mockNuxtImport('useSupabaseClient', () => () => supabase as never)

// Matched literally, so this answers only for the revision the version pins.
registerEndpoint(
  `/api/galaxy/workflows/${GALAXY_WORKFLOW_ID}/revisions/${WORKFLOW_REVISION}/description`,
  (event) => {
    if (descriptionRefusedWith !== null) {
      event.node.res.statusCode = descriptionRefusedWith
      return { statusCode: descriptionRefusedWith, statusMessage: 'Galaxy service is unavailable' }
    }
    return { steps: workflowSteps, inputs: workflowInputs, tools: workflowTools, unavailable: unavailableTools }
  },
)

registerEndpoint('/api/galaxy/instance', () => ({ url: 'https://galaxy.example.org', version_major: galaxyRelease, version_minor: '1' }))

/**
 * The submitted JSON, read off the request the harness has already buffered,
 * so that this test does not reach for `h3`.
 */
function submittedBody(req: IncomingMessage): Record<string, unknown> {
  const { body } = req as IncomingMessage & { body?: string }
  if (body === undefined)
    throw new Error('the harness did not buffer the request body onto req.body')
  return JSON.parse(body)
}

/**
 * A refusal is sent as `toHttpError` sends one, a status with the server's
 * words in the JSON body. The status is set on the Node response rather than
 * through `createError`, which would mean reaching for `h3`.
 */
registerEndpoint('/api/db/analyses', {
  method: 'POST',
  handler: (event) => {
    requestsMade += 1
    lastBody = submittedBody(event.node.req)
    if (refuseWith) {
      event.node.res.statusCode = refuseWith.status
      return { statusCode: refuseWith.status, statusMessage: refuseWith.message }
    }
    return { id: 7 }
  },
})

/**
 * The Colada cache the mounted app shares, reached from inside a component
 * because the store needs the app's pinia.
 */
let queryCache: ReturnType<typeof useQueryCache> | undefined

/**
 * Forget every answer between tests. The cache outlives a mount, and the
 * description is cached with no expiry, so without this the first test's
 * workflow would answer for every test after it.
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
  for (const entry of queryCache!.getEntries())
    queryCache!.remove(entry)
}

let mounted: { unmount: () => void } | undefined

beforeEach(async () => {
  workflowInputs = {}
  workflowSteps = {}
  workflowTools = {}
  unavailableTools = []
  descriptionRefusedWith = null
  galaxyRelease = '22.05'
  requestsMade = 0
  lastBody = null
  refuseWith = null
  await forgetCachedAnswers()
})

// Unmounted after each test, so a previous mount's form or message cannot
// answer for the next one's.
afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

async function mountPage() {
  const page = await mountSuspended(StartPage, { route: '/start' })
  mounted = page
  return page
}

type Page = Awaited<ReturnType<typeof mountPage>>

/** Picks the option a reader would, by the text it shows, once it has arrived. */
async function choose(page: Page, select: string, optionText: string) {
  const option = await vi.waitFor(() => {
    const found = page.findAll(`${select} option`).find(candidate => candidate.text() === optionText)
    expect(found, `"${optionText}" is offered in ${select}`).toBeDefined()
    return found!
  })
  // On an option, `setValue` selects it and fires the select's `change`.
  await option.setValue()
  await nextTick()
}

async function chooseTheWorkflow(page: Page) {
  await choose(page, 'select[name="workflow"]', 'Integron finder 2.0')
}

/** What a reader types and picks: the name, and a dataset's name per input's step index. */
interface Filled {
  name: string
  datasets: Record<string, string>
}

/** Picks a dataset per input and types the name, once the workflow is chosen. */
async function fillIn(page: Page, { name, datasets }: Filled) {
  for (const [stepId, datasetName] of Object.entries(datasets))
    await choose(page, `select[name="inputs.${stepId}"]`, datasetName)
  await page.get('input[name="analysisName"]').setValue(name)
}

/**
 * Submits the form itself rather than clicking Start, so a refusal is the
 * page's and not only the disabled button's: Enter submits a form whatever
 * its button says.
 */
async function submit(page: Page) {
  await page.get('form').trigger('submit')
}

/** Chooses the workflow, a dataset per input, types the name and submits. */
async function startAnalysis(page: Page, filled: Filled) {
  await chooseTheWorkflow(page)
  await fillIn(page, filled)
  await submit(page)
}

/** Waits for the element `testId` names to be shown, as an alert. */
async function alertShown(page: Page, testId: string, what: string) {
  const found = await vi.waitFor(() => {
    const candidate = page.find(`[data-testid="${testId}"]`)
    expect(candidate.exists(), what).toBe(true)
    return candidate
  })
  expect(found.attributes('role')).toBe('alert')
  return found
}

/** Submits and lets every request the page might make land, then checks none was a start. */
async function submitAndExpectNothingSent(page: Page) {
  await submit(page)
  await flushPromises()
  expect(requestsMade).toBe(0)
}

/**
 * Waits until the page has heard which release Galaxy runs. Before then it
 * refuses nothing on the release's account, so a test expecting a start to
 * go through would pass on a rule that refuses everything.
 */
async function releaseSettled() {
  await vi.waitFor(() => {
    const [entry] = queryCache!.getEntries({ key: [...GALAXY_INSTANCE_QUERY_KEYS.root] })
    expect(entry, 'the page asked for the release').toBeDefined()
    expect(entry!.state.value.status, 'the release query has settled').toBe('success')
  })
  await nextTick()
}

/** What a widget is found inside: the page, or a group of widgets on it. */
interface Scope {
  findAll: (selector: string) => DOMWrapper<Element>[]
}

/** The control of the widget labelled `text`, inside `scope`. */
function widget(scope: Scope, text: string): DOMWrapper<Element> {
  const label = scope.findAll('label').find(candidate => candidate.find('span').exists() && candidate.find('span').text() === text)
  expect(label, `a widget is labelled "${text}"`).toBeDefined()
  return label!.find('input, select, textarea')
}

/** The group of widgets whose legend reads `legend`, inside `scope`. */
function group(scope: Scope, legend: string): DOMWrapper<Element> {
  const found = scope.findAll('fieldset').find(candidate => candidate.find('legend').text() === legend)
  expect(found, `a group of widgets is headed "${legend}"`).toBeDefined()
  return found!
}

/** The widgets of one step, once its tool's declaration has arrived. */
async function stepWidgets(page: Page, stepId: string): Promise<DOMWrapper<Element>> {
  return vi.waitFor(() => {
    const found = page.find(`[data-testid="step-${stepId}"]`)
    expect(found.exists(), `step ${stepId} offers its parameters`).toBe(true)
    expect(found.findAll('label').length, `step ${stepId} has widgets`).toBeGreaterThan(0)
    return found
  })
}

/** The encoded parameters the last start sent, by step index. */
function sentParameters(): Record<string, Record<string, unknown>> {
  return lastBody?.parameters as Record<string, Record<string, unknown>>
}

describe('the playground\'s start page', () => {
  it('starts the analysis with the name, the datamap keyed by each input\'s step index, and the workflow', async () => {
    workflowInputs = { 0: anInput('Replicon'), 1: anInput('Reads') }
    workflowSteps = { 2: aToolStep(2, { cutoff: '10', adv: { mode: 'fast' } }) }
    const page = await mountPage()

    // Each input given the dataset the other's label suggests, so a datamap
    // keyed by anything but the step index cannot come out right.
    await startAnalysis(page, { name: '  Integron run  ', datasets: { 0: 'reads.fastq', 1: 'genome.fasta' } })

    await vi.waitFor(() => expect(requestsMade).toBe(1))
    // Trimmed, because the schema's output is what is sent.
    expect(lastBody?.name).toBe('Integron run')
    expect(lastBody?.datamap).toEqual({ 0: DATASETS[0], 1: DATASETS[1] })
    expect(lastBody?.workflowId).toBe(1)
    // The values the revision was saved with, under the names Galaxy reads:
    // a conditional's parameter as `parent|child`.
    expect(lastBody?.parameters).toEqual({ 2: { 'cutoff': '10', 'adv|mode': 'fast' } })
    await vi.waitFor(() => expect(page.find('[role="status"]').text()).toBe('Analysis 7 started.'))
  })

  // The browser's `required` lets spaces through. The schema trims first, so
  // they are the empty name it refuses; the test above is the control that a
  // padded name does go.
  it('refuses a name of only spaces, and says the name is required', async () => {
    workflowInputs = { 0: anInput('Reads') }
    const page = await mountPage()

    await startAnalysis(page, { name: '   ', datasets: { 0: 'reads.fastq' } })

    const issue = await vi.waitFor(() => {
      const found = page.find('#analysisName-issue')
      expect(found.exists(), 'the page says what is wrong with the name').toBe(true)
      return found
    })
    expect(issue.text()).toBe('Required')
    expect(page.get('input[name="analysisName"]').attributes('aria-describedby')).toBe('analysisName-issue')
    await flushPromises()
    expect(requestsMade).toBe(0)
  })

  it('shows the server\'s words when it refuses the start', async () => {
    workflowInputs = { 0: anInput('Reads') }
    refuseWith = { status: 400, message: 'The input "Reads" was not given a dataset.' }
    const page = await mountPage()

    await startAnalysis(page, { name: 'Integron run', datasets: { 0: 'reads.fastq' } })

    const refusal = await alertShown(page, 'start-analysis-failure', 'the page shows the refusal')
    expect(refusal.text()).toContain('The input "Reads" was not given a dataset.')
  })

  it('refuses to start a version whose tool Galaxy does not hold, and names the tool', async () => {
    workflowInputs = { 0: anInput('Reads') }
    unavailableTools = [{ toolId: TOOL_ID, toolVersion: TOOL_VERSION, reason: 'not_installed' }]
    const page = await mountPage()
    await chooseTheWorkflow(page)

    const refusal = await alertShown(page, 'blocking-tools', 'the page names the tool that refuses the start')
    expect(refusal.text()).toContain(`${TOOL_ID} (${TOOL_VERSION}) is not installed on this Galaxy`)
    expect(page.get('button[type="submit"]').attributes('disabled')).toBeDefined()

    await fillIn(page, { name: 'Integron run', datasets: { 0: 'reads.fastq' } })
    await submitAndExpectNothingSent(page)
  })

  // With no description the page knows neither the inputs nor the tools, so
  // what it would send is a name and an empty datamap.
  it('refuses to start a version whose description could not be read, and says so', async () => {
    descriptionRefusedWith = 503
    const page = await mountPage()
    await chooseTheWorkflow(page)

    const refusal = await alertShown(page, 'workflow-description-error', 'the page says the workflow could not be read')
    expect(refusal.text()).toContain('This workflow could not be read')
    expect(page.get('button[type="submit"]').attributes('disabled')).toBeDefined()

    await page.get('input[name="analysisName"]').setValue('Integron run')
    await submitAndExpectNothingSent(page)
  })

  /**
   * Galaxy refuses an invocation that leaves a required dataset input with
   * nothing to supply it from 24.2 on, and runs it before (#105). So the
   * page refuses it on 24.2, before anything is sent, and the same workflow
   * on 22.05 is the control that shows the form would otherwise have gone.
   */
  describe('a step whose required dataset input nothing feeds', () => {
    beforeEach(() => {
      workflowInputs = { 0: anInput('Reads') }
      workflowSteps = { 1: aStepWithAnUnconnectedDataInput(1) }
      workflowTools = { [`${TOOL_ID}@${TOOL_VERSION}`]: aToolRequiringData('Replicon file') }
    })

    it('refuses to start on Galaxy 24.2, and says why', async () => {
      galaxyRelease = '24.2'
      const page = await mountPage()
      await chooseTheWorkflow(page)

      const refusal = await alertShown(page, 'blocking-unconnected-inputs', 'the page names the step that refuses the start')
      expect(refusal.text()).toContain('This step cannot run without Replicon file')
      expect(page.find('[data-testid="unconnected-inputs"]').exists(), 'named once, as the refusal it is').toBe(false)
      expect(page.get('button[type="submit"]').attributes('disabled')).toBeDefined()

      await fillIn(page, { name: 'Integron run', datasets: { 0: 'reads.fastq' } })
      await submitAndExpectNothingSent(page)
    })

    // Warned rather than refused, as @gaas/ui's form does (#97): the
    // analysis starts, and the step runs without the input.
    it('starts on Galaxy 22.05, which runs it, and warns about the step', async () => {
      const page = await mountPage()
      await chooseTheWorkflow(page)
      await releaseSettled()

      const warning = await vi.waitFor(() => {
        const found = page.find('[data-testid="unconnected-inputs"]')
        expect(found.exists(), 'the page warns about the step').toBe(true)
        return found
      })
      expect(warning.attributes('role')).toBe('status')
      expect(warning.text()).toContain('This step cannot run without Replicon file')
      expect(page.find('[data-testid="blocking-unconnected-inputs"]').exists()).toBe(false)
      expect(page.get('button[type="submit"]').attributes('disabled')).toBeUndefined()

      await fillIn(page, { name: 'Integron run', datasets: { 0: 'reads.fastq' } })
      await submit(page)
      await vi.waitFor(() => expect(requestsMade).toBe(1))
    })
  })
})

/**
 * The parameters a reader sets (#167), on a recorded workflow.
 *
 * `conditional-repeat-runtime` is integron_finder at 26.1. Its first tool
 * step holds booleans, an optional select, and a section inside a section
 * that holds integers. Then come a repeat whose instances each hold a
 * conditional, and a conditional inside a section. All of those conditionals
 * are saved on a case that holds nothing, so two of them are moved by hand
 * onto a case that holds a text parameter, in the shape Galaxy saves when its
 * editor chooses that case. A float, a multiple select and a multi-line text
 * are in no recording, so one hand-built step declares those.
 */
describe('the parameters a reader sets', () => {
  const HAND_BUILT_TOOL_ID = 'toolshed.g2.bx.psu.edu/repos/devteam/hand_built/hand_built/1.0.0'
  const HAND_BUILT_TOOL_VERSION = '1.0.0'

  /**
   * A tool declaring the three parameter types no recording holds, each in
   * the shape Galaxy's `to_dict` writes it.
   */
  function aToolOfTheUnrecordedTypes(): GalaxyTool {
    const declared = { argument: null, help: '', refresh_on_change: false, optional: false, hidden: false, is_dynamic: false }
    return {
      model_class: 'Tool',
      id: HAND_BUILT_TOOL_ID,
      name: 'hand_built',
      version: HAND_BUILT_TOOL_VERSION,
      description: 'Every kind no recording holds',
      edam_operations: [],
      edam_topics: [],
      tool_shed_repository: { name: 'hand_built', owner: 'devteam', changeset_revision: 'abc123', tool_shed: 'toolshed.g2.bx.psu.edu' },
      inputs: [
        { ...declared, model_class: 'FloatToolParameter', type: 'float', name: 'evalue', label: 'E-value threshold', min: 0, max: 1, value: '0.5', area: false },
        {
          ...declared,
          model_class: 'SelectToolParameter',
          type: 'select',
          name: 'formats',
          label: 'Output formats',
          multiple: true,
          display: null,
          textable: false,
          value: ['gff'],
          options: [['GFF3', 'gff', true], ['GenBank', 'gbk', false], ['FASTA', 'fasta', false]],
        },
        { ...declared, model_class: 'TextToolParameter', type: 'text', name: 'notes', label: 'Notes', area: true, value: '', datalist: [] },
      ],
      outputs: [],
    }
  }

  /** The recording the description is built from, its declarations served as they stand. */
  let fixture: WorkflowFixture

  beforeEach(() => {
    fixture = loadFixture(FIXTURES.conditionalRepeatRuntime)
    const { steps, inputs } = describedRevision(fixture)
    // __BUILD_LIST__'s fifth dataset, labelled by hand: the case that holds
    // the identifier to label it with. The recording labels it by index.
    const datasets = steps[2]!.tool_inputs.datasets as WorkflowRepeatInstanceValue[]
    datasets[4] = { ...datasets[4]!, id_cond: { __current_case__: 2, id_select: 'manual', identifier: 'sample-5' } }
    // __MERGE_COLLECTION__'s conflict handling, on the first case, which
    // holds the suffix to append. The recording keeps the first of each.
    steps[3]!.tool_inputs.advanced = {
      conflict: { __current_case__: 0, duplicate_options: 'suffix_conflict', suffix_pattern: '_#' },
    }
    workflowInputs = inputs
    workflowSteps = {
      ...steps,
      5: aStep(5, {
        tool_id: HAND_BUILT_TOOL_ID,
        tool_version: HAND_BUILT_TOOL_VERSION,
        tool_inputs: { evalue: '0.5', formats: ['gff'], notes: '' },
      }),
    }
    workflowTools = { ...fixture.tools, [`${HAND_BUILT_TOOL_ID}@${HAND_BUILT_TOOL_VERSION}`]: aToolOfTheUnrecordedTypes() }
  })

  it('sends a value of each kind the reader edited, under the name Galaxy reads it by', async () => {
    const page = await mountPage()
    await chooseTheWorkflow(page)

    const integronFinder = await stepWidgets(page, '1')
    await widget(integronFinder, 'Genbank output?').setValue(false)
    // Saved as `null`: the optional select was left on nothing.
    await widget(integronFinder, 'Default replicons topology').setValue('--circ')
    const attcOptions = group(group(integronFinder, 'Advanced Parameters'), 'Attc options')
    await widget(attcOptions, 'Threshold for clustering (in base)').setValue('5000')

    const buildList = await stepWidgets(page, '2')
    await widget(group(group(buildList, 'Dataset(s)'), '5: Dataset(s)'), 'Identifier').setValue('replicon-5')

    const mergeCollections = await stepWidgets(page, '3')
    await widget(group(mergeCollections, 'Advanced Options'), 'Use the following suffix pattern:').setValue('-#')

    const handBuilt = await stepWidgets(page, '5')
    await widget(handBuilt, 'E-value threshold').setValue('0.01')
    await widget(handBuilt, 'Output formats').setValue(['gff', 'fasta'])
    await widget(handBuilt, 'Notes').setValue('first line\nsecond line')

    await fillIn(page, { name: 'Integron run', datasets: { 0: 'genome.fasta' } })
    await submit(page)

    await vi.waitFor(() => expect(requestsMade).toBe(1))
    expect(sentParameters()[1]).toMatchObject({
      // A boolean as `'false'`, the spelling Galaxy reads back on both releases.
      'gbk': 'false',
      // A select by the value of the option chosen, not its label.
      'type_replicon': '--circ',
      // A number as typed, which is what Galaxy's own form sends, inside a
      // section inside a section, by the path to it.
      'settings|attc_settings|dist_thresh': '5000',
      // Beside it, a value nobody edited, sent as the revision saved it.
      'settings|attc_settings|calin_threshold': '2',
    })
    // A text inside a conditional inside one instance of a repeat, which
    // Galaxy names by its position; the instance before it as saved.
    expect(sentParameters()[2]).toMatchObject({
      'datasets_3|id_cond|id_select': 'identifier',
      'datasets_4|id_cond|id_select': 'manual',
      'datasets_4|id_cond|identifier': 'replicon-5',
    })
    // A text inside the case a conditional is on, inside a section.
    expect(sentParameters()[3]).toMatchObject({
      'advanced|conflict|duplicate_options': 'suffix_conflict',
      'advanced|conflict|suffix_pattern': '-#',
    })
    // The same tool in the next step, which nothing edited.
    expect(sentParameters()[4]).toMatchObject({ 'advanced|conflict|duplicate_options': 'keep_first' })
    // A float as typed, a multiple select as the list of the values chosen,
    // and a text that keeps the lines it was typed on.
    expect(sentParameters()[5]).toEqual({ evalue: '0.01', formats: ['gff', 'fasta'], notes: 'first line\nsecond line' })
  })

  it('shows the case a conditional was saved on, and does not let the reader switch it', async () => {
    const page = await mountPage()
    await chooseTheWorkflow(page)

    const fifthDataset = group(group(await stepWidgets(page, '2'), 'Dataset(s)'), '5: Dataset(s)')
    const testParameter = widget(fifthDataset, 'Label to use').element as HTMLSelectElement
    expect(testParameter.options[testParameter.selectedIndex]?.text.trim()).toBe('Manual')
    expect(testParameter.disabled).toBe(true)
  })

  /**
   * Galaxy sends `label: ''` for a parameter the tool declares without one,
   * as the `to_dict` doctest at `basic.py:218` shows at 26.1, and `title:
   * null` for a section or a repeat (`tools/__init__.py:2010` and `:1921` at
   * 26.1). Its form shows the name instead for a parameter and a section,
   * and from 26.1 for a conditional's test parameter. It shows a repeat's
   * title alone, which the second UI does not follow.
   */
  it('names a parameter, a section and a repeat the tool left untitled by their names', async () => {
    declaredParameter(fixture, '3', 'advanced', 'section').title = null
    const conflict = declaredParameter(fixture, '3', 'conflict', 'conditional')
    conflict.test_param = { ...conflict.test_param, label: '' }
    Object.assign(declaredParameter(fixture, '2', 'datasets', 'repeat'), { title: null })
    const page = await mountPage()
    await chooseTheWorkflow(page)

    widget(group(await stepWidgets(page, '3'), 'advanced'), 'duplicate_options')
    group(group(await stepWidgets(page, '2'), 'datasets'), '5: datasets')
  })

  // The case's other parameter is the control: the conditional does render
  // what its case saved.
  it('offers no widget for a parameter the revision saved nothing for', async () => {
    workflowSteps[3]!.tool_inputs.advanced = { conflict: { __current_case__: 0, duplicate_options: 'suffix_conflict' } }
    const page = await mountPage()
    await chooseTheWorkflow(page)

    const advanced = group(await stepWidgets(page, '3'), 'Advanced Options')
    const labels = advanced.findAll('label span').map(label => label.text())
    expect(labels).toContain('How should conflicts (or potential conflicts) be handled?')
    expect(labels).not.toContain('Use the following suffix pattern:')
  })
})
