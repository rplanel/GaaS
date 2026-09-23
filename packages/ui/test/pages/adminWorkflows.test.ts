import type { GalaxyWorkflowsItem } from 'blendtype'
import { UApp } from '#components'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import AdminWorkflowsPage from '../../app/pages/admin/workflows.vue'

/**
 * The registry the build would have generated from
 * `app/workflows/satelliteFinder/0.11/results.vue` and
 * `app/workflows/defenseFinder/results.vue`: one exact view, one name-level
 * view, and no app-wide one, so a workflow neither names has no view at all.
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

/** Only the fields the page reads off a Galaxy workflow are filled in. */
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
 * What Galaxy lists: a workflow each results view covers, one no view covers,
 * one whose tag differs from the exact view's directory in case only, one
 * without tags, which the page leaves out altogether, and one activated as
 * version `0.10` and tagged `0.11` in Galaxy since.
 */
const GALAXY_WORKFLOWS = [
  galaxyWorkflow('wf-exact', 'Satellite Finder', ['name:satelliteFinder', 'version:0.11']),
  galaxyWorkflow('wf-name-level', 'Defense Finder', ['name:defenseFinder', 'version:2.0.0+galaxy1']),
  galaxyWorkflow('wf-none', 'Satellite Finder, older', ['name:satelliteFinder', 'version:0.10']),
  galaxyWorkflow('wf-case', 'Satellite Finder, lowercase tag', ['name:satellitefinder', 'version:0.11']),
  galaxyWorkflow('wf-untagged', 'Untagged', []),
  galaxyWorkflow('wf-retagged', 'Satellite Finder, retagged', ['name:satelliteFinder', 'version:0.11']),
]

mockNuxtImport('galaxyWorkflowsListQuery', () => () => ({
  key: ['test', 'galaxy', 'workflows'],
  query: async () => GALAXY_WORKFLOWS,
}))

mockNuxtImport('instanceByUrlQuery', () => () => ({
  key: ['test', 'instance'],
  query: async () => ({ id: 1, name: 'Test Galaxy', url: 'https://galaxy.example.com' }),
}))

/**
 * The rows activation wrote, with the keys it stored: the exact-view workflow,
 * whose tags have not moved since, and the retagged one, stored as
 * `satelliteFinder/0.10` while Galaxy now tags it `0.11`. The column has to
 * answer for the workflows that have no row too.
 */
mockNuxtImport('workflowsListQuery', () => () => ({
  key: ['test', 'db', 'workflows'],
  query: async () => [
    { id: 1, name: 'Satellite Finder', galaxy_id: 'wf-exact', name_key: 'satelliteFinder', version_key: '0.11', definition: null },
    { id: 2, name: 'Satellite Finder, retagged', galaxy_id: 'wf-retagged', name_key: 'satelliteFinder', version_key: '0.10', definition: null },
  ],
}))

async function mountPage() {
  return mountSuspended({
    components: { UApp, AdminWorkflowsPage },
    template: '<UApp><AdminWorkflowsPage /></UApp>',
  })
}

type Page = Awaited<ReturnType<typeof mountPage>>

/** The table row for the workflow of that name, found by its name cell alone. */
function row(wrapper: Page, name: string) {
  return wrapper.findAll('tbody tr').find(candidate => candidate.find('td').text() === name)
}

/** The table row for the workflow of that name, or a failure naming it. */
function rowOf(wrapper: Page, name: string) {
  const found = row(wrapper, name)
  if (!found)
    throw new Error(`no row is rendered for "${name}"`)
  return found
}

/** What the "Results view" column says on that workflow's row. */
function resultsViewReadingOf(wrapper: Page, name: string) {
  return rowOf(wrapper, name).find('[data-testid="workflow-results-view"]').text()
}

/** What the row says about tags that moved since activation, or nothing when they did not. */
function tagDriftOf(wrapper: Page, name: string) {
  const drift = rowOf(wrapper, name).find('[data-testid="workflow-tag-drift"]')
  return drift.exists() ? drift.text() : undefined
}

describe('admin workflows', () => {
  // The first mount is the only cold-cache one in this file (the query cache is
  // shared by every mount), so the load-on-entry path is proven here.
  it('says for each tagged workflow whether its results view is exact, a fallback or none', async () => {
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder')).toBeDefined())

    expect(resultsViewReadingOf(wrapper, 'Satellite Finder')).toBe('exact')
    expect(resultsViewReadingOf(wrapper, 'Defense Finder')).toBe('fallback')
    expect(resultsViewReadingOf(wrapper, 'Satellite Finder, older')).toBe('none')
  })

  // The column and the results page run the same match, so a tag spelled in
  // another case than the directory reads none here exactly as it shows the
  // generic view there (ADR 0003).
  it('reads none for a tag that differs from the view directory in case only', async () => {
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder, lowercase tag')).toBeDefined())

    expect(resultsViewReadingOf(wrapper, 'Satellite Finder, lowercase tag')).toBe('none')
  })

  it('answers for workflows that are not activated yet, and leaves untagged ones out', async () => {
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(row(wrapper, 'Defense Finder')).toBeDefined())

    expect(resultsViewReadingOf(wrapper, 'Defense Finder')).toBe('fallback')
    expect(row(wrapper, 'Untagged')).toBeUndefined()
  })

  // Every analysis of an activated workflow is matched with the keys stored at
  // activation, so once a row is activated the column reads those keys: the
  // exact view for the live `0.11` tag is one no analysis of it will ever reach.
  it('reads an activated workflow from the keys stored at activation, not from its live tags', async () => {
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder, retagged')).toBeDefined())

    expect(resultsViewReadingOf(wrapper, 'Satellite Finder, retagged')).toBe('none')
    // The control: the same live tags with stored keys that did not move are picked up.
    expect(resultsViewReadingOf(wrapper, 'Satellite Finder')).toBe('exact')
  })

  // Before activation there is no stored key, so the live tags are all the
  // column can answer from, and they are what activation will store.
  it('reads a workflow not yet activated from its live tags', async () => {
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder, older')).toBeDefined())

    expect(resultsViewReadingOf(wrapper, 'Satellite Finder, older')).toBe('none')
    expect(resultsViewReadingOf(wrapper, 'Defense Finder')).toBe('fallback')
    expect(tagDriftOf(wrapper, 'Satellite Finder, older')).toBeUndefined()
  })

  it('says on the row when an activated workflow was retagged since, naming the stored and the live values', async () => {
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(row(wrapper, 'Satellite Finder, retagged')).toBeDefined())

    const drift = tagDriftOf(wrapper, 'Satellite Finder, retagged')
    expect(drift).toContain('satelliteFinder/0.10')
    expect(drift).toContain('satelliteFinder/0.11')
    // The control: an activated workflow whose tags have not moved has nothing to say.
    expect(tagDriftOf(wrapper, 'Satellite Finder')).toBeUndefined()
  })
})
