import type { GalaxyWorkflow, WorkflowInput } from 'blendtype'
import type { IncomingMessage } from 'node:http'
import type { UploadedDatasetDb } from '../../app/components/galaxy/workflow/InvokeForm.vue'
import { UApp } from '#components'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import InvokeForm from '../../app/components/galaxy/workflow/InvokeForm.vue'

/** The status the analyses endpoint refuses the next submission with. */
let refuseWith: number | null = null
/** Whether it answers 200 with nothing in the body, as it did before #25. */
let serveEmptyBody = false

/** How many times the form actually asked the server to start an analysis. */
let requestsMade = 0
/** The body of the last submission that reached the endpoint. */
let lastBody: Record<string, unknown> | null = null

/** The Galaxy identifier the workflow row the form is started for carries. */
const GALAXY_WORKFLOW_ID = 'galaxy-wf-1'

/** The inputs the workflow declares, as Galaxy describes them. */
let workflowInputs: Record<string, WorkflowInput> = {}
/** The datamap of the analysis being copied, when the form is copying one. */
let storedDatamap: Record<string, UploadedDatasetDb> | null = null
/** Whether the query for the pickable datasets fails instead of answering. */
let datasetsUnavailable = false

/** The rows the dataset picker offers, distinctive enough to trace. */
const DATASETS = [
  { id: 1, dataset_name: 'reads.fastq', metadata: null, owner_id: 'owner-1', storage_object_id: 'so-reads' },
  { id: 2, dataset_name: 'genome.fasta', metadata: null, owner_id: 'owner-1', storage_object_id: 'so-genome' },
] satisfies UploadedDatasetDb[]

function anInput(label: string, uuid: string): WorkflowInput {
  return { label, value: '', uuid }
}

/**
 * What each of the three Supabase queries behind this form is answered with,
 * chosen by the relation it reads.
 */
function servedRows(relation: string) {
  switch (relation) {
    case 'workflows':
      return { id: 1, name: 'A workflow', galaxy_id: GALAXY_WORKFLOW_ID, definition: null }
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

/** Only the two fields the form reads off a Galaxy workflow are filled in. */
registerEndpoint(`/api/galaxy/workflows/${GALAXY_WORKFLOW_ID}`, () => ({
  data: { inputs: workflowInputs, steps: {} } as unknown as GalaxyWorkflow,
}))

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
 * The real endpoint's refusals, as `toHttpError` sends them: a status and
 * nothing the reader is expected to read. The status is set on the Node
 * response rather than through `createError` so this test does not reach for
 * `h3`, which is not a declared dependency of this package.
 */
registerEndpoint('/api/db/analyses', {
  method: 'POST',
  handler: (event) => {
    requestsMade += 1
    lastBody = submittedBody(event.node.req)
    if (refuseWith !== null) {
      event.node.res.statusCode = refuseWith
      return { statusCode: refuseWith, statusMessage: 'Refused' }
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
  const picker = form
    .findAllComponents({ name: 'USelectMenu' })
    .find(candidate => candidate.props('name') === `inputs.${stepId}`)
  if (!picker) {
    throw new Error(`no dataset picker is rendered for step ${stepId}`)
  }
  await picker.findComponent({ name: 'ComboboxRoot' }).setValue(dataset)
}

/** Name the analysis and ask for it, the way a reader does. */
async function submit(wrapper: Awaited<ReturnType<typeof mountForm>>) {
  await wrapper.find('input[name="name"]').setValue('My analysis')
  await wrapper.find('form').trigger('submit')
}

beforeEach(() => {
  refuseWith = null
  serveEmptyBody = false
  requestsMade = 0
  lastBody = null
  workflowInputs = {}
  storedDatamap = null
  datasetsUnavailable = false
})

// First in the file on purpose: the query for the dataset list is shared by
// every mount, so only the first one meets a cold cache and can observe it
// failing rather than being served an earlier test's answer.
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
