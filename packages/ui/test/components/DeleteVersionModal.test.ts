import type { WorkflowRow } from 'nuxt-galaxy'
import { UApp } from '#components'
import { useToast } from '#imports'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import DeleteVersionModal from '../../app/components/admin/DeleteVersionModal.vue'

/** The version the dialog is open for, reduced to what it reads. */
const VERSION = {
  id: 5,
  galaxy_id: 'wf-satellite',
  name: 'Satellite Finder',
  name_key: 'satelliteFinder',
  version_key: '0.10',
  revision: 1,
  revision_uuid: 'uuid-5',
  definition: null,
  published_at: '2026-09-20T10:00:00Z',
  published_by: 'owner-1',
  active: true,
  user_id: 1,
  annotation: null,
} as unknown as WorkflowRow

/** The ids the endpoint was asked to delete, in order. */
let deleted: number[] = []
/** The sentence the endpoint refuses the next delete with, or none to accept it. */
let refuseWith: { statusCode: number, statusMessage: string } | null = null

registerEndpoint(`/api/db/workflows/${VERSION.id}`, {
  method: 'DELETE',
  handler: () => {
    deleted.push(VERSION.id)
    if (refuseWith) {
      throw createError(refuseWith)
    }
    return VERSION
  },
})

/** The dialog the running test mounted, taken down after it so its portal does not outlive it. */
let mounted: { unmount: () => void } | undefined
/** What the dialog emitted as deleted, if anything. */
let emitted: WorkflowRow[] = []

async function mountDialog() {
  const open = ref(true)
  const wrapper = await mountSuspended({
    components: { UApp, DeleteVersionModal },
    setup: () => ({
      open,
      version: VERSION,
      onDeleted: (version: WorkflowRow) => emitted.push(version),
    }),
    template: `<UApp><DeleteVersionModal v-model:open="open" :version="version" @deleted="onDeleted" /></UApp>`,
  }, { attachTo: document.body })
  mounted = wrapper
  return { wrapper, open }
}

/** The dialog, wherever the modal portals it, or none while it is closed. */
function dialog() {
  return document.body.querySelector('[role="dialog"]')
}

function button(testId: 'delete-confirm' | 'delete-cancel') {
  const found = dialog()?.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)
  if (!found)
    throw new Error(`the dialog has no ${testId} button`)
  return found
}

beforeEach(() => {
  deleted = []
  emitted = []
  refuseWith = null
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  useToast().clear()
  document.body.innerHTML = ''
})

// #72, ADR 0004. The confirmation names the version before anything is
// deleted, and says what the alternative is for a version with analyses.
describe('the delete version dialog', () => {
  it('names the version by name and label, and sends nothing until confirmed', async () => {
    await mountDialog()
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    const words = dialog()!.textContent ?? ''
    expect(words).toContain('satelliteFinder')
    expect(words).toContain('0.10')
    expect(words).toMatch(/retire/i)
    expect(words).not.toMatch(/unpublish|deactivat|archiv/i)
    expect(deleted).toEqual([])
  })

  it('sends nothing and closes when cancelled', async () => {
    const { open } = await mountDialog()
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    button('delete-cancel').click()

    await vi.waitFor(() => expect(open.value).toBe(false))
    expect(deleted).toEqual([])
    expect(emitted).toEqual([])
  })

  it('deletes the version once confirmed, tells the page, and closes', async () => {
    const { open } = await mountDialog()
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    button('delete-confirm').click()

    await vi.waitFor(() => expect(deleted).toEqual([5]))
    await vi.waitFor(() => expect(emitted).toHaveLength(1))
    expect(emitted[0]).toMatchObject({ id: 5, version_key: '0.10' })
    await vi.waitFor(() => expect(open.value).toBe(false))
  })

  it('shows the server\'s sentence pointing at retiring when analyses reference the version, and stays open', async () => {
    refuseWith = { statusCode: 409, statusMessage: 'Version "0.10" of "satelliteFinder" has analyses and cannot be deleted; retire it instead.' }
    const { open } = await mountDialog()
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    button('delete-confirm').click()

    await vi.waitFor(() => expect(dialog()?.querySelector('[data-testid="delete-refusal"]')?.textContent).toContain('has analyses and cannot be deleted; retire it instead.'))
    expect(open.value).toBe(true)
    expect(emitted).toEqual([])
  })

  it('gives a 403 its own wording, since the database\'s would mislead', async () => {
    refuseWith = { statusCode: 403, statusMessage: 'Permission denied' }
    await mountDialog()
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    button('delete-confirm').click()

    await vi.waitFor(() => expect(dialog()?.querySelector('[data-testid="delete-refusal"]')?.textContent).toContain('You are not allowed to delete versions'))
    expect(emitted).toEqual([])
  })
})
