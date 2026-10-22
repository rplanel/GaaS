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

/**
 * The days the calendar offers, in the order it renders them. The popover is
 * teleported, so it is reached through the document rather than the wrapper.
 * Days outside the visible month, and days the calendar refuses, are left out.
 */
function selectableDays(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-reka-calendar-cell-trigger][data-value]')]
    .filter(cell => !cell.hasAttribute('data-disabled') && !cell.hasAttribute('data-outside-view'))
}

async function openCalendar(wrapper: VueWrapper) {
  await wrapper.find('[data-testid="usage-preset-custom"]').trigger('click')
  await vi.waitFor(() => {
    expect(selectableDays().length).toBeGreaterThan(0)
  })
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

    // a bookmark of this must still mean "last 7 days" next month. The default
    // 1s `vi.waitFor` window is no longer enough: under nuxt 4.6 and
    // vue-router 5.4, the first programmatic navigation after `mountSuspended`
    // can take seconds, and under a loaded suite run it lands just past it.
    await vi.waitFor(() => {
      expect(query(wrapper).range).toBe('7d')
    }, { timeout: 5000 })
    expect(query(wrapper).from).toBeUndefined()
  })

  it('restores the view a URL describes', async () => {
    const wrapper = await mountFilter('/?range=all')

    expect(query(wrapper).range).toBe('all')
    expect(wrapper.find('[data-testid="usage-preset-custom"]').text()).toContain('Custom')
  })

  // Picking days is not driven from here: reka-ui's calendar does not advance
  // its selection under synthetic events in happy-dom, so a click-through would
  // assert the harness rather than the component. What the click resolves to is
  // `rangeFromSelection`, unit-tested beside the composable; what the calendar
  // offers is asserted below.

  it('offers no day in the future, because usage cannot have happened yet', async () => {
    const wrapper = await mountFilter('/?range=7d')
    await openCalendar(wrapper)

    const todayUtc = new Date().toISOString().slice(0, 10)
    const future = [...document.querySelectorAll<HTMLElement>('[data-reka-calendar-cell-trigger][data-value]')]
      .filter(cell => cell.dataset.value! > todayUtc)

    expect(future.length).toBeGreaterThan(0)
    expect(future.every(cell => cell.hasAttribute('data-disabled'))).toBe(true)
  })

  it('names the range it was given in words rather than as stamps', async () => {
    const wrapper = await mountFilter('/?from=2026-08-01&to=2026-08-31')

    const label = wrapper.find('[data-testid="usage-preset-custom"]').text()
    // read as the days they are in UTC, which is what the buckets count
    expect(label).toContain('1 Aug 2026')
    expect(label).toContain('31 Aug 2026')
  })

  it('treats an empty bound in the URL as no range at all', async () => {
    const wrapper = await mountFilter('/?from=')

    // otherwise the view claims a custom range while the query asks for all time
    expect(wrapper.find('[data-testid="usage-preset-custom"]').text()).toContain('Custom')
  })

  it('says which range is in force, for a reader who cannot see the colour', async () => {
    const wrapper = await mountFilter('/?range=all')

    expect(wrapper.find('[data-testid="usage-preset-all"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('[data-testid="usage-preset-7d"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.find('[data-testid="usage-preset-custom"]').attributes('aria-pressed')).toBe('false')
  })
})
