import type { GalaxyWorkflowsItem } from 'blendtype'
import { UApp } from '#components'
import { useToast } from '#imports'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import PublishVersionModal from '../../app/components/admin/PublishVersionModal.vue'

/**
 * What Galaxy lists for the stored workflow, oldest first (ADR 0004, #73):
 * three saves, each carrying its own 0-based index as `version`. Revision 2
 * is the latest.
 */
const REVISIONS = [
  { version: 0, update_time: '2026-09-01T10:00:00', steps: 3 },
  { version: 1, update_time: '2026-09-10T08:30:00', steps: 4 },
  { version: 2, update_time: '2026-09-20T16:45:00', steps: 4 },
]

/** A stored workflow whose revisions Galaxy lists. */
const LISTED = 'wf-listed'
/** A stored workflow whose revisions cannot be listed, Galaxy being down. */
const UNLISTED = 'wf-unlisted'

/** Only the fields the dialog reads off a Galaxy stored workflow are filled in. */
function galaxyWorkflow(id: string): GalaxyWorkflowsItem {
  return { id, name: 'Satellite Finder', tags: ['name:satelliteFinder', 'version:0.12'] } as unknown as GalaxyWorkflowsItem
}

// the proxy answers the by-id proxy's envelope: the list under `data`, or an
// error under `error` with a 200, as `runGalaxyEffect` sends it
registerEndpoint(`/api/galaxy/workflows/${LISTED}/versions`, () => ({ data: REVISIONS, error: undefined }))
registerEndpoint(`/api/galaxy/workflows/${UNLISTED}/versions`, () => ({
  data: undefined,
  error: { message: 'GalaxyServiceUnavailable', statusMessage: 'Galaxy Service @ https://galaxy.example.com is unavailable', statusCode: 503 },
}))

/** The body of the last publish request that reached the endpoint. */
let lastBody: Record<string, unknown> | null = null

registerEndpoint('/api/db/workflows', {
  method: 'POST',
  handler: async (event) => {
    lastBody = await readBody(event)
    if (lastBody === null) {
      throw createError({ statusCode: 400, statusMessage: 'no body' })
    }
    return { id: 9, galaxy_id: lastBody.galaxyId, name_key: lastBody.name, version_key: lastBody.label, revision: lastBody.revision ?? 2, active: true }
  },
})

/** The dialog the running test mounted, taken down after it so its portal does not outlive it. */
let mounted: Awaited<ReturnType<typeof mountDialog>> | undefined

async function mountDialog({ workflowId, publishedVersions = [], lineageName }: {
  workflowId: string
  publishedVersions?: { revision: number, label: string }[]
  lineageName?: string
}) {
  const wrapper = await mountSuspended({
    components: { UApp, PublishVersionModal },
    setup: () => ({
      open: ref(true),
      workflow: galaxyWorkflow(workflowId),
      publishedVersions,
      lineageName,
    }),
    template: `<UApp><PublishVersionModal v-model:open="open" :workflow="workflow" :published-versions="publishedVersions" :lineage-name="lineageName" /></UApp>`,
  }, { attachTo: document.body })
  mounted = wrapper
  return wrapper
}

/** The dialog, wherever the modal portals it, or none while it is closed. */
function dialog() {
  return document.body.querySelector('[role="dialog"]')
}

/** Each revision the picker lists, in the order listed: its words, whether it is selected, whether it can be. */
function listedRevisions() {
  const items = dialog()?.querySelectorAll('[data-testid="publish-revisions"] [data-slot="item"]') ?? []
  return [...items].map((item) => {
    const radio = item.querySelector<HTMLButtonElement>('[role="radio"]')
    if (!radio)
      throw new Error('a listed revision has no radio')
    // the label and the description are two elements with no space between
    // them in the DOM, so they are read apart and joined with one
    const words = ['[data-slot="label"]', '[data-slot="description"]']
      .map(slot => item.querySelector(slot)?.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    return {
      text: words.join(' '),
      selected: radio.getAttribute('aria-checked') === 'true',
      disabled: radio.disabled,
    }
  })
}

/** Wait for Galaxy's list to arrive in the picker. */
async function revisionsListed() {
  await vi.waitFor(() => expect(listedRevisions()).toHaveLength(REVISIONS.length))
  return listedRevisions()
}

/** Choose a revision the way a person does: by clicking its radio. */
async function choose(revision: number) {
  const radios = dialog()?.querySelectorAll<HTMLButtonElement>('[data-testid="publish-revisions"] [role="radio"]') ?? []
  const radio = [...radios].find(candidate => candidate.getAttribute('value') === String(revision))
  if (!radio)
    throw new Error(`no radio lists revision ${revision}`)
  radio.click()
  await nextTick()
}

function summary() {
  return dialog()?.querySelector('[data-testid="publish-revision"]')?.textContent ?? ''
}

function submitButton() {
  const submit = dialog()?.querySelector<HTMLButtonElement>('[data-testid="publish-submit"]')
  if (!submit)
    throw new Error('the dialog has no publish button')
  return submit
}

beforeEach(() => {
  lastBody = null
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  useToast().clear()
  document.body.innerHTML = ''
})

describe('the publish dialog\'s revision picker', () => {
  it('lists the revisions in Galaxy\'s order with index, save time and step count, the latest selected', async () => {
    await mountDialog({ workflowId: LISTED })

    const listed = await revisionsListed()

    expect(listed.map(item => item.text)).toEqual([
      'Revision 0 Sep 1, 10:00 · 3 steps',
      'Revision 1 Sep 10, 08:30 · 4 steps',
      'Revision 2, the latest Sep 20, 16:45 · 4 steps',
    ])
    expect(listed.map(item => item.selected)).toEqual([false, false, true])
    expect(listed.every(item => !item.disabled)).toBe(true)
    expect(summary()).toMatch(/Revision 2, the latest/)
  })

  it('disables the revisions already published, shows their label, and selects the newest that is not', async () => {
    // labels are not ordered, so the latest can carry one while an older
    // revision does not; a default that could only be refused is no default
    await mountDialog({
      workflowId: LISTED,
      lineageName: 'satelliteFinder',
      publishedVersions: [{ revision: 2, label: '0.11' }, { revision: 0, label: '0.9' }],
    })

    const listed = await revisionsListed()

    expect(listed.map(item => item.disabled)).toEqual([true, false, true])
    expect(listed[0]!.text).toBe('Revision 0 Sep 1, 10:00 · 3 steps · published as 0.9')
    expect(listed[2]!.text).toBe('Revision 2, the latest Sep 20, 16:45 · 4 steps · published as 0.11')
    expect(listed[1]!.text).not.toContain('published as')
    expect(listed.map(item => item.selected)).toEqual([false, true, false])
    expect(summary()).toMatch(/Revision 1, older than the latest \(2\)/)
  })

  it('publishes an older unpublished revision when it is chosen, naming it in the body', async () => {
    await mountDialog({ workflowId: LISTED })
    await revisionsListed()

    await choose(0)
    expect(listedRevisions().map(item => item.selected)).toEqual([true, false, false])
    expect(summary()).toMatch(/Revision 0, older than the latest \(2\)/)

    submitButton().click()

    await vi.waitFor(() => expect(lastBody).toEqual({ galaxyId: LISTED, name: 'satelliteFinder', label: '0.12', revision: 0 }))
    await vi.waitFor(() => expect(dialog()).toBeNull())
  })

  it('sends no revision when the latest is the one chosen, so the body is the one it sent before', async () => {
    // absent means the latest, which is what the default selection says; the
    // server exports the latest when none is named
    await mountDialog({ workflowId: LISTED })
    await revisionsListed()

    submitButton().click()

    await vi.waitFor(() => expect(lastBody).toEqual({ galaxyId: LISTED, name: 'satelliteFinder', label: '0.12' }))
  })

  it('says the revisions could not be listed and publishes nothing when Galaxy is down', async () => {
    await mountDialog({ workflowId: UNLISTED })

    await vi.waitFor(() => expect(dialog()?.querySelector('[data-testid="publish-revisions-error"]')).not.toBeNull())
    expect(dialog()!.querySelector('[data-testid="publish-revisions-error"]')!.textContent).toContain('could not be listed')
    expect(listedRevisions()).toHaveLength(0)
    expect(submitButton().disabled).toBe(true)

    submitButton().click()
    await nextTick()
    expect(lastBody).toBeNull()
  })
})
