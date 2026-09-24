import type { GalaxyWorkflowsItem } from 'blendtype'
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
function galaxyWorkflow(id: string, name: string, tags: string[]): GalaxyWorkflowsItem {
  return {
    id,
    name,
    tags,
    number_of_steps: 3,
    create_time: new Date('2026-09-01T10:00:00Z'),
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
  return wrapper.findAll('tbody tr').find(candidate => candidate.find('td').text() === name)
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
  return wrapper.findAll('tbody tr').map(candidate => candidate.find('td').text())
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

describe('admin workflows', () => {
  // The first mount is the only cold-cache one in this file (the query cache is
  // shared by every mount), so the load-on-entry path is proven here.
  it('lists every stored workflow of the account, published ones first, tags or not', async () => {
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(row(wrapper, 'Untagged')).toBeDefined())

    expect(listedNames(wrapper)).toEqual(['Satellite Finder', 'Defense Finder', 'Untagged', 'Cas Finder'])
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

      await vi.waitFor(() => expect(lastBody).toEqual({ galaxyId: 'wf-untagged', name: 'crisprFinder', label: '4.2' }))
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
})
