/**
 * The state badge the analyses list and the jobs accordion both draw (#90).
 *
 * Mounted rather than left to `galaxyStateLook`'s own suite because the
 * defect was in the template, not the map: `v-if="currentState"` was true
 * for `{ icon: '', color: '' }`, so twelve states rendered an empty icon and
 * the fallback that would have said something never ran.
 */

import type { GalaxyState, InvocationState } from 'blendtype'
import { UApp } from '#components'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { GalaxyStates, InvocationStates } from 'blendtype'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import GalaxyStatus from '../../app/components/galaxy/GalaxyStatus.vue'
import { galaxyStateLook } from '../../app/utils/galaxyStateLook'

const EVERY_STATE = [...new Set<GalaxyState | InvocationState>([...GalaxyStates, ...InvocationStates])]

let mounted: { unmount: () => void } | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

async function mountStatus(props: Record<string, unknown>) {
  const wrapper = await mountSuspended(defineComponent({
    setup: () => () => h(UApp, () => h(GalaxyStatus, props)),
  }))
  mounted = wrapper
  return wrapper
}

describe('galaxyStatus', () => {
  it.each(EVERY_STATE)('draws %s rather than an empty icon', async (state) => {
    const wrapper = await mountStatus({ state })

    const status = wrapper.find('[data-testid="galaxy-status"]')
    expect(status.exists()).toBe(true)
    // The state in words, on the element itself: a reader without colour
    // vision, and a reader hovering it, both get the same answer.
    expect(status.attributes('aria-label')).toBe(galaxyStateLook(state).word)
    // And an icon that names something.
    expect(status.find('[class*="i-"]').exists()).toBe(true)
  })

  it.each(EVERY_STATE)('never prints Galaxy\'s own identifier for %s', async (state) => {
    const wrapper = await mountStatus({ state })

    expect(wrapper.text()).not.toContain(state)
  })

  it('draws nothing at all when there is no state to draw', async () => {
    // A job row that has not arrived yet, which the jobs accordion asks
    // about before the analysis has loaded.
    const wrapper = await mountStatus({ state: undefined })

    expect(wrapper.find('[data-testid="galaxy-status"]').exists()).toBe(false)
  })
})
