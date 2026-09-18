import type { VueWrapper } from '@vue/test-utils'
import { UApp } from '#components'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import UsageRangeFilter from '../../app/components/usage/UsageRangeFilter.vue'

/**
 * Mounted at `/` because the test application has no session, and the Supabase
 * middleware answers a protected path with a redirect to /login that discards
 * the query. This control reads query parameters and nothing else, so the path
 * it sits on makes no difference to what is being tested.
 */
async function mountFilter(route: string) {
  return mountSuspended({
    components: { UApp, UsageRangeFilter },
    template: '<UApp><UsageRangeFilter /></UApp>',
  }, { route })
}

/** The rendered input, whether the test id landed on it or on its wrapper. */
function dateInput(wrapper: VueWrapper, testId: string) {
  const found = wrapper.find(`[data-testid="${testId}"]`)
  return found.element.tagName === 'INPUT' ? found : wrapper.find(`[data-testid="${testId}"] input`)
}

function query(wrapper: VueWrapper) {
  return (wrapper.vm.$router as unknown as { currentRoute: { value: { query: Record<string, string> } } })
    .currentRoute
    .value
    .query
}

describe('usage range filter', () => {
  it('writes the preset token to the URL, not the dates it resolved to today', async () => {
    const wrapper = await mountFilter('/')

    await wrapper.find('[data-testid="usage-preset-7d"]').trigger('click')

    // a bookmark of this must still mean "last 7 days" next month
    await vi.waitFor(() => {
      expect(query(wrapper).range).toBe('7d')
    })
    expect(query(wrapper).from).toBeUndefined()
  })

  it('restores the view a URL describes', async () => {
    const wrapper = await mountFilter('/?range=all')

    expect(query(wrapper).range).toBe('all')
    expect(wrapper.find('[data-testid="usage-preset-custom"]').text()).toContain('Custom')
  })

  it('names a custom range as absolute dates, and drops the preset token', async () => {
    const wrapper = await mountFilter('/?range=7d')

    await wrapper.find('[data-testid="usage-preset-custom"]').trigger('click')
    await dateInput(wrapper, 'usage-custom-from').setValue('2026-08-01')
    await dateInput(wrapper, 'usage-custom-to').setValue('2026-08-31')
    await wrapper.find('[data-testid="usage-custom-apply"]').trigger('click')

    await vi.waitFor(() => {
      expect(query(wrapper)).toEqual({ from: '2026-08-01', to: '2026-08-31' })
    })
  })

  it('shows the dates it was given rather than the word Custom', async () => {
    const wrapper = await mountFilter('/?from=2026-08-01&to=2026-08-31')

    expect(wrapper.find('[data-testid="usage-preset-custom"]').text()).toContain('2026-08-01 to 2026-08-31')
  })

  it('treats an empty bound in the URL as no range at all', async () => {
    const wrapper = await mountFilter('/?from=')

    // otherwise the view claims a custom range while the query asks for all time
    expect(wrapper.find('[data-testid="usage-preset-custom"]').text()).toContain('Custom')
  })

  it('refuses to apply a range that reads backwards', async () => {
    const wrapper = await mountFilter('/')

    await wrapper.find('[data-testid="usage-preset-custom"]').trigger('click')
    await dateInput(wrapper, 'usage-custom-from').setValue('2026-09-02')
    await dateInput(wrapper, 'usage-custom-to').setValue('2026-09-01')

    expect(wrapper.find('[data-testid="usage-custom-apply"]').attributes('disabled')).toBeDefined()
  })
})
