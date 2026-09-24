import type { VersionState, WorkflowRow } from 'nuxt-galaxy'
import { UApp } from '#components'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VersionStateBadge from '../../app/components/admin/VersionStateBadge.vue'

/**
 * #76, ADR 0004. Beside each version the admin page reads its state, live
 * from Galaxy: runnable, tools missing, missing in Galaxy, revision mismatch.
 * The badge is that reading; what it says for each answer of the endpoint,
 * and for no answer, is decided here.
 */

const FOO = 'toolshed.g2.bx.psu.edu/repos/iuc/foo/foo/1.2.3+galaxy0'
const BAR = 'toolshed.g2.bx.psu.edu/repos/iuc/bar/bar/2.0'
const PINNED = 'fa95ecd4-ed11-49e2-b3d6-8f178b807256'
const HELD = '0b7c9a2e-1111-4222-8333-444455556666'

/** A version row as the admin page lists it, reduced to what the badge reads. */
function version(id: number): WorkflowRow {
  return {
    id,
    galaxy_id: 'wf-satellite',
    name: 'Satellite Finder',
    name_key: 'satelliteFinder',
    version_key: '0.11',
    revision: 3,
    revision_uuid: PINNED,
    definition: null,
    published_at: '2026-09-20T10:00:00Z',
    published_by: 'owner-1',
    active: true,
    user_id: 1,
    annotation: null,
  } as WorkflowRow
}

/** What the endpoint answers for each version here, by id; one id per reading, since the cache is shared. */
const STATES: Record<number, VersionState> = {
  1: { state: 'runnable' },
  2: { state: 'tools-missing', missingTools: [{ toolId: FOO, toolVersion: '1.2.3+galaxy0' }, { toolId: BAR, toolVersion: '2.0' }] },
  3: { state: 'missing-in-galaxy' },
  4: { state: 'revision-mismatch', galaxyRevisionUuid: HELD },
  5: { state: 'revision-mismatch' },
  7: { state: 'runnable' },
}

/** How many times each version's state was asked for. */
const asked: Record<number, number> = {}

// a registered path is matched literally, so one endpoint per version
for (const id of [1, 2, 3, 4, 5, 7]) {
  registerEndpoint(`/api/db/workflows/${id}/state`, () => {
    asked[id] = (asked[id] ?? 0) + 1
    return STATES[id]
  })
}
// version 6: Galaxy is down, so the reading fails rather than guessing a state
registerEndpoint('/api/db/workflows/6/state', () => {
  asked[6] = (asked[6] ?? 0) + 1
  throw createError({ statusCode: 503, statusMessage: 'Galaxy service is unavailable' })
})

let mounted: Awaited<ReturnType<typeof mountBadge>> | undefined

async function mountBadge(id: number) {
  // attached to the body because the popover portals there
  const wrapper = await mountSuspended({
    components: { UApp, VersionStateBadge },
    setup: () => ({ version: version(id) }),
    template: '<UApp><VersionStateBadge :version="version" /></UApp>',
  }, { attachTo: document.body })
  mounted = wrapper
  return wrapper
}

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

type Badge = Awaited<ReturnType<typeof mountBadge>>

function stateBadge(wrapper: Badge) {
  return wrapper.find('[data-testid="version-state"]')
}

/** Wait for the reading to arrive and answer what the badge says. */
async function stateOf(wrapper: Badge) {
  await vi.waitFor(() => expect(stateBadge(wrapper).text()).not.toBe('checking'))
  return stateBadge(wrapper).text()
}

/** Open the badge's details, wherever the popover portals them. */
async function details(wrapper: Badge) {
  await stateBadge(wrapper).trigger('click')
  await vi.waitFor(() => expect(document.body.querySelector('[data-testid="version-state-details"]')).not.toBeNull())
  return document.body.querySelector('[data-testid="version-state-details"]')!.textContent!.replace(/\s+/g, ' ').trim()
}

describe('the state badge beside a version', () => {
  it('says checking until the reading arrives, then runnable', async () => {
    const wrapper = await mountBadge(1)

    expect(stateBadge(wrapper).text()).toBe('checking')
    expect(await stateOf(wrapper)).toBe('runnable')
  })

  it('says tools missing and names each tool and its version in the details', async () => {
    const wrapper = await mountBadge(2)

    expect(await stateOf(wrapper)).toBe('tools missing')
    const words = await details(wrapper)
    expect(words).toContain(`${FOO} 1.2.3+galaxy0`)
    expect(words).toContain(`${BAR} 2.0`)
    expect(words).toMatch(/pinned version/)
  })

  it('says missing in Galaxy, and that retiring is the remedy', async () => {
    const wrapper = await mountBadge(3)

    expect(await stateOf(wrapper)).toBe('missing in Galaxy')
    expect(await details(wrapper)).toMatch(/retir/i)
    // nothing is retired automatically: the badge only reads
    expect(wrapper.find('[role="switch"]').exists()).toBe(false)
  })

  it('says revision mismatch and shows the pinned uuid against the one Galaxy holds', async () => {
    const wrapper = await mountBadge(4)

    expect(await stateOf(wrapper)).toBe('revision mismatch')
    const words = await details(wrapper)
    expect(words).toContain(PINNED)
    expect(words).toContain(HELD)
  })

  it('says revision mismatch when the index names no revision any more', async () => {
    const wrapper = await mountBadge(5)

    expect(await stateOf(wrapper)).toBe('revision mismatch')
    expect(await details(wrapper)).toMatch(/no revision/i)
  })

  it('says not checked when the reading failed, with the reason in the details', async () => {
    const wrapper = await mountBadge(6)

    expect(await stateOf(wrapper)).toBe('not checked')
    expect(await details(wrapper)).toMatch(/could not be read/i)
  })

  it('reads the state again when asked, whatever the cache\'s age', async () => {
    const wrapper = await mountBadge(7)
    await stateOf(wrapper)
    expect(asked[7]).toBe(1)

    await wrapper.find('[data-testid="version-state-refresh"]').trigger('click')

    await vi.waitFor(() => expect(asked[7]).toBe(2))
  })

  it('uses the glossary\'s words and none of the ones it avoids', async () => {
    const wrapper = await mountBadge(3)
    await stateOf(wrapper)
    const words = `${wrapper.text()} ${await details(wrapper)}`

    expect(words).not.toMatch(/health|status|broken|outdated/i)
  })
})
