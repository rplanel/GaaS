import type { GalaxyWorkflowsItem } from 'blendtype'
import type { VersionState } from 'nuxt-galaxy'
import { UApp } from '#components'
import { useToast } from '#imports'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import AdminWorkflowsPage from '../../app/pages/admin/workflows.vue'

/**
 * The registry the build would have generated from
 * `app/workflows/satelliteFinder/0.11/results.vue` and
 * `app/workflows/defenseFinder/results.vue`: one exact view, one name-level
 * view, and no app-wide one, so a version neither names has no view at all.
 */
vi.mock('#build/gaas/results-views.mjs', async () => {
  const { defineComponent, h } = await import('vue')
  const view = (text: string) => defineComponent({ setup: () => () => h('p', text) })
  return {
    resultsViews: [
      { rung: 'exact', name: 'satelliteFinder', version: '0.11', component: view('satellite view') },
      { rung: 'name-level', name: 'defenseFinder', component: view('defense view') },
    ],
  }
})

/** The role the signed-in user carries, as the JWT claim reports it. */
const userRole = ref<string | undefined>('admin')

mockNuxtImport('useUserRole', () => () => ({ userRole }))
mockNuxtImport('useSupabaseClient', () => () => ({} as never))

/** Only the fields the page reads off a Galaxy stored workflow are filled in. */
function galaxyWorkflow(id: string, name: string, tags: string[], overrides: Partial<GalaxyWorkflowsItem> = {}): GalaxyWorkflowsItem {
  return {
    id,
    name,
    tags,
    number_of_steps: 3,
    create_time: new Date('2026-09-01T10:00:00Z'),
    ...overrides,
  } as unknown as GalaxyWorkflowsItem
}

/**
 * What Galaxy lists for the account GaaS runs as, in Galaxy's own order: two
 * stored workflows with no version yet first, one of them untagged, then the
 * two that have versions. Tags are no longer required for a row.
 */
const GALAXY_WORKFLOWS = [
  galaxyWorkflow('wf-untagged', 'Untagged', []),
  galaxyWorkflow('wf-cas', 'Cas Finder', ['name:casFinder', 'version:1.0']),
  galaxyWorkflow('wf-satellite', 'Satellite Finder', ['name:satelliteFinder', 'version:0.11']),
  galaxyWorkflow('wf-defense', 'Defense Finder', ['name:defenseFinder', 'version:2.0.0']),
  // hidden in Galaxy's own list, which the proxy asks for too: it carries a
  // version, so it keeps a row here and says why Galaxy's list omits it
  galaxyWorkflow('wf-hidden', 'Hidden Finder', [], { hidden: true }),
  // hidden and with no version: the shape Galaxy hides by itself for a
  // workflow embedded as a step in another, which this page leaves out
  galaxyWorkflow('wf-subworkflow', 'Trim And QC', [], { hidden: true }),
]

mockNuxtImport('galaxyWorkflowsListQuery', () => () => ({
  key: ['test', 'galaxy', 'workflows'],
  query: async () => GALAXY_WORKFLOWS,
}))

/**
 * The revisions Galaxy lists for any stored workflow the dialog opens for:
 * four saves, the last the latest (#73). One mock for every id rather than a
 * `registerEndpoint` per stored workflow, since the harness matches a
 * registered path literally and three stored workflows open the dialog here.
 */
mockNuxtImport('galaxyWorkflowRevisionsQuery', () => ({ workflowId }: { workflowId: string }) => ({
  key: ['test', 'galaxy', 'revisions', workflowId],
  query: async () => [0, 1, 2, 3].map(version => ({ version, update_time: `2026-09-0${version + 1}T10:00:00`, steps: 3 })),
}))

/** The tool check of any revision of any stored workflow here: whole, three tools checked (#75). */
mockNuxtImport('galaxyRevisionToolsQuery', () => ({ workflowId, revision }: { workflowId: string, revision: number }) => ({
  key: ['test', 'galaxy', 'revisions', workflowId, 'tools', revision],
  query: async () => ({ missing: [], checked: 3 }),
}))

/**
 * The state of each version as Galaxy answers it (#76): runnable unless a
 * test says otherwise, per version id, and `failure` for a reading Galaxy
 * could not give. Keyed per test so that a mount reads its own cache entry.
 */
let versionStates: Record<number, VersionState | { failure: true }> = {}
let stateRun = 0

mockNuxtImport('versionStateQuery', () => ({ id }: { id: number }) => ({
  key: ['test', 'version-state', id, stateRun],
  query: async () => {
    const state = versionStates[id]
    if (state && 'failure' in state) {
      throw createError({ statusCode: 503, statusMessage: 'Galaxy service is unavailable' })
    }
    return state ?? { state: 'runnable' }
  },
}))

mockNuxtImport('instanceByUrlQuery', () => () => ({
  key: ['test', 'instance'],
  query: async () => ({ id: 1, name: 'Test Galaxy', url: 'https://galaxy.example.com' }),
}))

/** A version row as the list query serves it, reduced to what the page reads. */
function version(id: number, galaxyId: string, nameKey: string, label: string, revision: number) {
  return {
    id,
    galaxy_id: galaxyId,
    name: 'A workflow',
    name_key: nameKey,
    version_key: label,
    revision,
    revision_uuid: `uuid-${id}`,
    definition: null,
    published_at: '2026-09-20T10:00:00Z',
    published_by: 'owner-1',
    active: true,
    user_id: 1,
    annotation: null,
  }
}

/**
 * The versions published so far: two labels for the Satellite Finder stored
 * workflow, one of which an exact view names, and one for Defense Finder,
 * which its name-level view stands in for.
 */
mockNuxtImport('workflowsListQuery', () => () => ({
  key: ['test', 'db', 'workflows'],
  query: async () => [
    version(1, 'wf-satellite', 'satelliteFinder', '0.11', 3),
    version(2, 'wf-satellite', 'satelliteFinder', '0.10', 1),
    version(3, 'wf-defense', 'defenseFinder', '2.0.0', 0),
  ],
}))

/**
 * The versions as the admin page reads them, the users' three plus one for
 * the stored workflow Galaxy hides, retired ones
 * included (#71): fresh for every test, since the PATCH endpoints below flip
 * `active` in place, and keyed per test so that a mount reads its own cache
 * entry rather than the one the previous test's refetch filled.
 */
function publishedVersions() {
  return [
    version(1, 'wf-satellite', 'satelliteFinder', '0.11', 3),
    version(2, 'wf-satellite', 'satelliteFinder', '0.10', 1),
    version(3, 'wf-defense', 'defenseFinder', '2.0.0', 0),
    version(5, 'wf-hidden', 'hiddenFinder', '1.0', 0),
  ]
}
let adminVersions = publishedVersions()
let adminRun = 0

mockNuxtImport('adminWorkflowsListQuery', () => () => ({
  key: ['test', 'db', 'workflows', 'admin', adminRun],
  query: async () => adminVersions,
}))

/** The body of the last publish request that reached the endpoint. */
let lastBody: Record<string, unknown> | null = null
/** The sentence the endpoint refuses the next publish with, or none to accept it. */
let refuseWith: { statusCode: number, statusMessage: string } | null = null

registerEndpoint('/api/db/workflows', {
  method: 'POST',
  handler: async (event) => {
    lastBody = await readBody(event)
    if (refuseWith) {
      throw createError(refuseWith)
    }
    return version(4, String(lastBody!.galaxyId), String(lastBody!.name), String(lastBody!.label), 5)
  },
})

/** The page the running test mounted, taken down after it so its dialog and toasts do not outlive it. */
let mounted: Awaited<ReturnType<typeof mountPage>> | undefined

async function mountPage() {
  // attached to the body because the dialog and the toasts portal there, and
  // a portal needs a document to land in
  const wrapper = await mountSuspended({
    components: { UApp, AdminWorkflowsPage },
    template: '<UApp><AdminWorkflowsPage /></UApp>',
  }, { attachTo: document.body })
  mounted = wrapper
  return wrapper
}

type Page = Awaited<ReturnType<typeof mountPage>>

/** The table row for the stored workflow of that name, found by its name cell alone. */
function row(wrapper: Page, name: string) {
  return wrapper.findAll('tbody tr').find(candidate => candidate.find('[data-testid="workflow-name"]').text() === name)
}

/** The table row for the stored workflow of that name, or a failure naming it. */
function rowOf(wrapper: Page, name: string) {
  const found = row(wrapper, name)
  if (!found)
    throw new Error(`no row is rendered for "${name}"`)
  return found
}

/** The names of the stored workflows, in the order the table lists them. */
function listedNames(wrapper: Page) {
  return wrapper.findAll('tbody tr').map(candidate => candidate.find('[data-testid="workflow-name"]').text())
}

/** Each version on that row: its label and what the Results view badge beside it says. */
function versionsOf(wrapper: Page, name: string) {
  return rowOf(wrapper, name).findAll('[data-testid="workflow-version"]').map(entry => ({
    label: entry.find('[data-testid="version-label"]').text(),
    reading: entry.find('[data-testid="workflow-results-view"]').text(),
  }))
}

/** The publish dialog, wherever the modal portals it, or none while it is closed. */
function dialog() {
  return document.body.querySelector('[role="dialog"]')
}

/** An input of the open dialog, by the field it holds. */
function dialogInput(field: 'name' | 'label') {
  const input = dialog()?.querySelector<HTMLInputElement>(`input[name="${field}"]`)
  if (!input)
    throw new Error(`the dialog has no ${field} input`)
  return input
}

async function openDialogFor(wrapper: Page, name: string) {
  await rowOf(wrapper, name).find('[data-testid="publish-version"]').trigger('click')
  await vi.waitFor(() => expect(dialog()).not.toBeNull())
}

/** Type into a dialog input the way a person does, so the form sees the change. */
async function type(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
}

async function submitDialog() {
  const submit = dialog()?.querySelector<HTMLButtonElement>('[data-testid="publish-submit"]')
  if (!submit)
    throw new Error('the dialog has no publish button')
  // Publish stays disabled until the selected revision's tool check has come
  // back (#75), which the mocked query answers a tick after the dialog opens
  await vi.waitFor(() => expect(submit.disabled).toBe(false))
  submit.click()
}

beforeEach(() => {
  lastBody = null
  refuseWith = null
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  // toasts are app-wide state, so one raised here would be rendered by the
  // next test's mount as if that test had raised it
  useToast().clear()
  document.body.innerHTML = ''
})

/** The last retire or reactivate request that reached the endpoint: the version's id and the body. */
let lastActiveRequest: { id: number, body: Record<string, unknown> } | null = null
/** The sentence the endpoint refuses the next retire or reactivate with, or none to accept it. */
let refuseActiveWith: { statusCode: number, statusMessage: string } | null = null

// the endpoint registry matches whole URLs, so each version's route is registered on its own
for (const id of [1, 2, 3]) {
  registerEndpoint(`/api/db/workflows/${id}`, {
    method: 'PATCH',
    handler: async (event) => {
      const body = await readBody(event)
      lastActiveRequest = { id, body }
      if (refuseActiveWith) {
        throw createError(refuseActiveWith)
      }
      const row = adminVersions.find(candidate => candidate.id === id)!
      row.active = Boolean(body.active)
      return row
    },
  })
}

beforeEach(() => {
  adminVersions = publishedVersions()
  adminRun += 1
  lastActiveRequest = null
  refuseActiveWith = null
})

/** The ids the delete endpoint was asked for, in order. */
let deleteRequests: number[] = []
/** The sentence the endpoint refuses the next delete with, or none to accept it. */
let refuseDeleteWith: { statusCode: number, statusMessage: string } | null = null

// the endpoint registry matches whole URLs, so each version's route is registered on its own (#72)
for (const id of [1, 2, 3]) {
  registerEndpoint(`/api/db/workflows/${id}`, {
    method: 'DELETE',
    handler: () => {
      deleteRequests.push(id)
      if (refuseDeleteWith) {
        throw createError(refuseDeleteWith)
      }
      const row = adminVersions.find(candidate => candidate.id === id)!
      adminVersions = adminVersions.filter(candidate => candidate.id !== id)
      return row
    },
  })
}

beforeEach(() => {
  deleteRequests = []
  refuseDeleteWith = null
})

/** The version of a stored workflow Galaxy no longer lists (#76), when a test adds it. */
const GONE_VERSION_ID = 9

// the version whose stored workflow is gone can still be retired from the page
registerEndpoint(`/api/db/workflows/${GONE_VERSION_ID}`, {
  method: 'PATCH',
  handler: async (event) => {
    const body = await readBody(event)
    lastActiveRequest = { id: GONE_VERSION_ID, body }
    const row = adminVersions.find(candidate => candidate.id === GONE_VERSION_ID)!
    row.active = Boolean(body.active)
    return row
  },
})

beforeEach(() => {
  versionStates = {}
  stateRun += 1
})

describe('admin workflows', () => {
  // The first mount is the only cold-cache one in this file (the query cache is
  // shared by every mount), so the load-on-entry path is proven here.
  it('lists every stored workflow of the account, published ones first, tags or not', async () => {
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(row(wrapper, 'Untagged')).toBeDefined())

    expect(listedNames(wrapper)).toEqual(['Satellite Finder', 'Defense Finder', 'Hidden Finder', 'Untagged', 'Cas Finder'])
  })

  // Galaxy hides a stored workflow to keep it out of its own list, and does
  // it by itself for one embedded as a step in another, so most hidden ones
  // are pieces of other workflows that nobody would publish. A hidden one
  // that already carries a version is the case worth a row: it stays
  // publishable and says why Galaxy's list omits it, rather than reading as
  // a stored workflow Galaxy no longer has. Absent from Galaxy altogether is
  // what the vanished rows below are for.
  it('keeps a hidden stored workflow that carries a version, and leaves out the hidden ones that carry none', async () => {
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(row(wrapper, 'Hidden Finder')).toBeDefined())

    expect(rowOf(wrapper, 'Hidden Finder').find('[data-testid="workflow-hidden"]').text()).toBe('hidden in Galaxy')
    expect(rowOf(wrapper, 'Hidden Finder').find('[data-testid="publish-version"]').exists()).toBe(true)
    expect(row(wrapper, 'Trim And QC')).toBeUndefined()
    expect(wrapper.findAll('[data-testid="workflow-hidden"]')).toHaveLength(1)
  })

  it('lists each published version on its row with its results view reading', async () => {
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder')).toBeDefined())

    expect(versionsOf(wrapper, 'Satellite Finder')).toEqual([
      { label: '0.11', reading: 'exact' },
      { label: '0.10', reading: 'none' },
    ])
    expect(versionsOf(wrapper, 'Defense Finder')).toEqual([{ label: '2.0.0', reading: 'fallback' }])
    expect(versionsOf(wrapper, 'Cas Finder')).toEqual([])
    expect(rowOf(wrapper, 'Cas Finder').find('[data-testid="workflow-no-version"]').exists()).toBe(true)
  })

  // ADR 0004 removed the retagged workflow: a version is what GaaS published,
  // and what Galaxy tags now is at most a pre-fill, so no column reads it and
  // no row compares the two.
  it('says nothing about tags moving, and its columns speak of versions, not of activation', async () => {
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder')).toBeDefined())

    expect(wrapper.find('[data-testid="workflow-tag-drift"]').exists()).toBe(false)
    const headers = wrapper.findAll('thead th').map(cell => cell.text())
    expect(headers).toContain('Versions')
    expect(headers).not.toContain('Activated')
    expect(headers).not.toContain('Version')
    expect(wrapper.text()).not.toMatch(/activat|retag/i)
  })

  describe('the publish dialog', () => {
    it('pre-fills the name and the label from the tags of a stored workflow with no version yet, both editable', async () => {
      const wrapper = await mountPage()
      await vi.waitFor(() => expect(row(wrapper, 'Cas Finder')).toBeDefined())

      await openDialogFor(wrapper, 'Cas Finder')

      expect(dialogInput('name').value).toBe('casFinder')
      expect(dialogInput('name').disabled).toBe(false)
      expect(dialogInput('label').value).toBe('1.0')
      expect(dialog()!.querySelector('[data-testid="publish-revision"]')!.textContent).toMatch(/latest/i)
    })

    it('locks the name to the lineage once the stored workflow has a version', async () => {
      const wrapper = await mountPage()
      await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder')).toBeDefined())

      await openDialogFor(wrapper, 'Satellite Finder')

      expect(dialogInput('name').value).toBe('satelliteFinder')
      expect(dialogInput('name').disabled).toBe(true)
    })

    it('leaves both to be typed when the stored workflow carries no tags', async () => {
      // Galaxy's display name is never a pre-fill: it usually cannot name a directory
      const wrapper = await mountPage()
      await vi.waitFor(() => expect(row(wrapper, 'Untagged')).toBeDefined())

      await openDialogFor(wrapper, 'Untagged')

      expect(dialogInput('name').value).toBe('')
      expect(dialogInput('name').disabled).toBe(false)
      expect(dialogInput('label').value).toBe('')
    })

    it('publishes the typed name and label for the stored workflow, and says so', async () => {
      const wrapper = await mountPage()
      await vi.waitFor(() => expect(row(wrapper, 'Untagged')).toBeDefined())
      await openDialogFor(wrapper, 'Untagged')

      await type(dialogInput('name'), 'crisprFinder')
      await type(dialogInput('label'), '4.2')
      await submitDialog()

      // the latest listed revision travels with the body, so the row pins what was on screen (#73)
      await vi.waitFor(() => expect(lastBody).toEqual({ galaxyId: 'wf-untagged', name: 'crisprFinder', label: '4.2', revision: 3 }))
      await vi.waitFor(() => expect(document.body.textContent).toContain('Version published'))
      await vi.waitFor(() => expect(dialog()).toBeNull())
    })

    it('shows a refusal\'s sentence in the dialog and leaves it open to fix', async () => {
      refuseWith = { statusCode: 409, statusMessage: 'Version "0.11" of "satelliteFinder" already exists.' }
      const wrapper = await mountPage()
      await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder')).toBeDefined())
      await openDialogFor(wrapper, 'Satellite Finder')

      await submitDialog()

      await vi.waitFor(() => expect(dialog()?.querySelector('[data-testid="publish-refusal"]')?.textContent).toContain('Version "0.11" of "satelliteFinder" already exists.'))
      expect(dialog()).not.toBeNull()
      expect(document.body.textContent).not.toContain('Version published')
    })
  })

  // #71, ADR 0004. Active means startable by users and nothing else; the
  // switch beside each version is where an administrator retires it and
  // makes it active again. The page reads every version, retired ones
  // included, which is why it has a list query of its own.
  describe('the Active switch beside each version', () => {
    /** The switch of that version on that row, found by the label beside it. */
    function switchOf(wrapper: Page, name: string, label: string) {
      const entry = rowOf(wrapper, name)
        .findAll('[data-testid="workflow-version"]')
        .find(candidate => candidate.find('[data-testid="version-label"]').text() === label)
      if (!entry)
        throw new Error(`no version "${label}" is listed for "${name}"`)
      return entry.find('[role="switch"]')
    }

    it('lists every version with a switch reading its state, retired ones included, and reads their results view as before', async () => {
      adminVersions[0]!.active = false
      const wrapper = await mountPage()
      await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder')).toBeDefined())

      expect(switchOf(wrapper, 'Satellite Finder', '0.11').attributes('aria-checked')).toBe('false')
      expect(switchOf(wrapper, 'Satellite Finder', '0.10').attributes('aria-checked')).toBe('true')
      expect(switchOf(wrapper, 'Defense Finder', '2.0.0').attributes('aria-checked')).toBe('true')
      expect(rowOf(wrapper, 'Satellite Finder').text()).toContain('Active')
      // the match is made from the name and the label, never from the flag,
      // so a retired version's past analyses keep the view they had
      expect(versionsOf(wrapper, 'Satellite Finder')).toEqual([
        { label: '0.11', reading: 'exact' },
        { label: '0.10', reading: 'none' },
      ])
      expect(wrapper.text()).not.toMatch(/deactivat|inactive|unpublish/i)
    })

    it('retires a version: asks the server for active false, says so, and the switch reads retired once the list refetched', async () => {
      const wrapper = await mountPage()
      await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder')).toBeDefined())

      await switchOf(wrapper, 'Satellite Finder', '0.10').trigger('click')

      await vi.waitFor(() => expect(lastActiveRequest).toEqual({ id: 2, body: { active: false } }))
      await vi.waitFor(() => expect(document.body.textContent).toContain('Version retired'))
      expect(document.body.textContent).toContain('satelliteFinder 0.10')
      await vi.waitFor(() => expect(switchOf(wrapper, 'Satellite Finder', '0.10').attributes('aria-checked')).toBe('false'))
      expect(switchOf(wrapper, 'Satellite Finder', '0.11').attributes('aria-checked')).toBe('true')
    })

    it('makes a retired version active again the same way', async () => {
      adminVersions[1]!.active = false
      const wrapper = await mountPage()
      await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder')).toBeDefined())

      await switchOf(wrapper, 'Satellite Finder', '0.10').trigger('click')

      await vi.waitFor(() => expect(lastActiveRequest).toEqual({ id: 2, body: { active: true } }))
      await vi.waitFor(() => expect(document.body.textContent).toContain('Version active again'))
      await vi.waitFor(() => expect(switchOf(wrapper, 'Satellite Finder', '0.10').attributes('aria-checked')).toBe('true'))
    })

    it('shows the server\'s sentence when it refuses, and leaves the switch as it was', async () => {
      refuseActiveWith = { statusCode: 404, statusMessage: 'No workflow 2 is available' }
      const wrapper = await mountPage()
      await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder')).toBeDefined())

      await switchOf(wrapper, 'Satellite Finder', '0.10').trigger('click')

      await vi.waitFor(() => expect(lastActiveRequest).toEqual({ id: 2, body: { active: false } }))
      await vi.waitFor(() => expect(document.body.textContent).toContain('Version not retired'))
      expect(document.body.textContent).toContain('No workflow 2 is available')
      expect(document.body.textContent).not.toContain('Version retired')
      expect(switchOf(wrapper, 'Satellite Finder', '0.10').attributes('aria-checked')).toBe('true')
    })
  })

  // #72, ADR 0004. The mistaken publish: a version no analysis references can
  // be deleted, after a confirmation that names it. The database refuses a
  // version with analyses, and the administrator reads that retiring is the
  // alternative.
  describe('the Delete control beside each version', () => {
    /** The Delete control of that version on that row, found by the label beside it. */
    function deleteControlOf(wrapper: Page, name: string, label: string) {
      const entry = rowOf(wrapper, name)
        .findAll('[data-testid="workflow-version"]')
        .find(candidate => candidate.find('[data-testid="version-label"]').text() === label)
      if (!entry)
        throw new Error(`no version "${label}" is listed for "${name}"`)
      return entry.find('[data-testid="version-delete"]')
    }

    function confirmButton() {
      const found = dialog()?.querySelector<HTMLButtonElement>('[data-testid="delete-confirm"]')
      if (!found)
        throw new Error('the dialog has no delete button')
      return found
    }

    it('lists a Delete control beside every version', async () => {
      const wrapper = await mountPage()
      await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder')).toBeDefined())

      expect(deleteControlOf(wrapper, 'Satellite Finder', '0.11').exists()).toBe(true)
      expect(deleteControlOf(wrapper, 'Satellite Finder', '0.10').exists()).toBe(true)
      expect(deleteControlOf(wrapper, 'Defense Finder', '2.0.0').exists()).toBe(true)
    })

    it('asks for confirmation naming the version, and sends nothing until confirmed or when cancelled', async () => {
      const wrapper = await mountPage()
      await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder')).toBeDefined())

      await deleteControlOf(wrapper, 'Satellite Finder', '0.10').trigger('click')
      await vi.waitFor(() => expect(dialog()).not.toBeNull())

      expect(dialog()!.textContent).toContain('satelliteFinder')
      expect(dialog()!.textContent).toContain('0.10')
      expect(deleteRequests).toEqual([])

      dialog()!.querySelector<HTMLButtonElement>('[data-testid="delete-cancel"]')!.click()

      await vi.waitFor(() => expect(dialog()).toBeNull())
      expect(deleteRequests).toEqual([])
      expect(versionsOf(wrapper, 'Satellite Finder')).toHaveLength(2)
    })

    it('deletes the version once confirmed, says so, and the version is gone once the list refetched', async () => {
      const wrapper = await mountPage()
      await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder')).toBeDefined())

      await deleteControlOf(wrapper, 'Satellite Finder', '0.10').trigger('click')
      await vi.waitFor(() => expect(dialog()).not.toBeNull())
      confirmButton().click()

      await vi.waitFor(() => expect(deleteRequests).toEqual([2]))
      await vi.waitFor(() => expect(document.body.textContent).toContain('Version deleted'))
      expect(document.body.textContent).toContain('satelliteFinder 0.10')
      await vi.waitFor(() => expect(versionsOf(wrapper, 'Satellite Finder')).toEqual([{ label: '0.11', reading: 'exact' }]))
      await vi.waitFor(() => expect(dialog()).toBeNull())
    })

    it('shows the server\'s sentence pointing at retiring when the version has analyses, deletes nothing, and stays open', async () => {
      refuseDeleteWith = { statusCode: 409, statusMessage: 'Version "0.10" of "satelliteFinder" has analyses and cannot be deleted; retire it instead.' }
      const wrapper = await mountPage()
      await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder')).toBeDefined())

      await deleteControlOf(wrapper, 'Satellite Finder', '0.10').trigger('click')
      await vi.waitFor(() => expect(dialog()).not.toBeNull())
      confirmButton().click()

      await vi.waitFor(() => expect(dialog()?.querySelector('[data-testid="delete-refusal"]')?.textContent).toContain('has analyses and cannot be deleted; retire it instead.'))
      expect(dialog()).not.toBeNull()
      expect(document.body.textContent).not.toContain('Version deleted')
      expect(versionsOf(wrapper, 'Satellite Finder')).toHaveLength(2)
    })
  })

  // #76, ADR 0004. Beside each version, its state read live from Galaxy:
  // runnable, tools missing, missing in Galaxy, revision mismatch. A
  // reading, never stored; nothing is retired from it, the administrator
  // reads it and decides. A stored workflow Galaxy no longer lists keeps a
  // row for its versions, so they can be retired from here.
  describe('the state of each version', () => {
    /** The version entry of that label on that row. */
    function entryOf(wrapper: Page, name: string, label: string) {
      const entry = rowOf(wrapper, name)
        .findAll('[data-testid="workflow-version"]')
        .find(candidate => candidate.find('[data-testid="version-label"]').text() === label)
      if (!entry)
        throw new Error(`no version "${label}" is listed for "${name}"`)
      return entry
    }

    /** What the state badge of that version says once the reading arrived. */
    async function stateOf(wrapper: Page, name: string, label: string) {
      const badge = () => entryOf(wrapper, name, label).find('[data-testid="version-state"]')
      await vi.waitFor(() => expect(badge().text()).not.toBe('checking'))
      return badge().text()
    }

    it('reads every version\'s state beside it, runnable when Galaxy holds everything the version pinned', async () => {
      const wrapper = await mountPage()
      await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder')).toBeDefined())

      expect(await stateOf(wrapper, 'Satellite Finder', '0.11')).toBe('runnable')
      expect(await stateOf(wrapper, 'Satellite Finder', '0.10')).toBe('runnable')
      expect(await stateOf(wrapper, 'Defense Finder', '2.0.0')).toBe('runnable')
      // the reading changes nothing else the row says
      expect(versionsOf(wrapper, 'Satellite Finder')).toEqual([
        { label: '0.11', reading: 'exact' },
        { label: '0.10', reading: 'none' },
      ])
    })

    it('names the missing tools of a version in the details of its badge', async () => {
      versionStates[1] = {
        state: 'tools-missing',
        missingTools: [{ toolId: 'toolshed.g2.bx.psu.edu/repos/iuc/foo/foo/1.2.3+galaxy0', toolVersion: '1.2.3+galaxy0' }],
      }
      const wrapper = await mountPage()
      await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder')).toBeDefined())

      expect(await stateOf(wrapper, 'Satellite Finder', '0.11')).toBe('tools missing')
      expect(await stateOf(wrapper, 'Satellite Finder', '0.10')).toBe('runnable')

      await entryOf(wrapper, 'Satellite Finder', '0.11').find('[data-testid="version-state"]').trigger('click')

      await vi.waitFor(() => expect(document.body.querySelector('[data-testid="version-state-details"]')?.textContent).toContain('toolshed.g2.bx.psu.edu/repos/iuc/foo/foo/1.2.3+galaxy0'))
    })

    it('lists a version whose stored workflow Galaxy no longer lists first, named from its snapshot, without Publish, reading missing in Galaxy', async () => {
      adminVersions.push({ ...version(GONE_VERSION_ID, 'wf-gone', 'goneFinder', '1.0', 2), name: 'Gone Finder' })
      versionStates[GONE_VERSION_ID] = { state: 'missing-in-galaxy' }
      const wrapper = await mountPage()
      await vi.waitFor(() => expect(row(wrapper, 'Gone Finder')).toBeDefined())

      expect(listedNames(wrapper)).toEqual(['Gone Finder', 'Satellite Finder', 'Defense Finder', 'Hidden Finder', 'Untagged', 'Cas Finder'])
      expect(rowOf(wrapper, 'Gone Finder').find('[data-testid="publish-version"]').exists()).toBe(false)
      expect(rowOf(wrapper, 'Satellite Finder').find('[data-testid="publish-version"]').exists()).toBe(true)
      // what Galaxy says about a stored workflow, blank when Galaxy no longer says anything
      const cells = (name: string) => rowOf(wrapper, name).findAll('td').map(cell => cell.text())
      expect(cells('Satellite Finder')[2]).toBe('3')
      expect(cells('Gone Finder')[2]).toBe('')
      expect(cells('Gone Finder')[3]).toBe('')
      expect(versionsOf(wrapper, 'Gone Finder')).toEqual([{ label: '1.0', reading: 'none' }])
      expect(await stateOf(wrapper, 'Gone Finder', '1.0')).toBe('missing in Galaxy')
    })

    it('lets a version whose stored workflow is gone be retired from its row', async () => {
      adminVersions.push({ ...version(GONE_VERSION_ID, 'wf-gone', 'goneFinder', '1.0', 2), name: 'Gone Finder' })
      versionStates[GONE_VERSION_ID] = { state: 'missing-in-galaxy' }
      const wrapper = await mountPage()
      await vi.waitFor(() => expect(row(wrapper, 'Gone Finder')).toBeDefined())

      const toggle = () => entryOf(wrapper, 'Gone Finder', '1.0').find('[role="switch"]')
      expect(toggle().attributes('aria-checked')).toBe('true')
      await toggle().trigger('click')

      await vi.waitFor(() => expect(lastActiveRequest).toEqual({ id: GONE_VERSION_ID, body: { active: false } }))
      await vi.waitFor(() => expect(document.body.textContent).toContain('Version retired'))
      await vi.waitFor(() => expect(toggle().attributes('aria-checked')).toBe('false'))
    })

    it('says a version was not checked when Galaxy could not answer, and reads nothing else into it', async () => {
      versionStates[3] = { failure: true }
      const wrapper = await mountPage()
      await vi.waitFor(() => expect(row(wrapper, 'Defense Finder')).toBeDefined())

      expect(await stateOf(wrapper, 'Defense Finder', '2.0.0')).toBe('not checked')
      expect(await stateOf(wrapper, 'Satellite Finder', '0.11')).toBe('runnable')
      expect(wrapper.text()).not.toMatch(/health|status|broken|outdated/i)
    })
  })
})
