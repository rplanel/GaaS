import type { VueWrapper } from '@vue/test-utils'
import { UApp } from '#components'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import UsageGranularityFilter from '../../app/components/usage/UsageGranularityFilter.vue'

/**
 * Mounted at `/` for the reason the range filter's tests are: the test
 * application has no session, and a protected path redirects to /login with
 * the query discarded. This control reads query parameters and nothing else.
 */
async function mountFilter(route: string) {
  return mountSuspended({
    components: { UApp, UsageGranularityFilter },
    template: '<UApp><UsageGranularityFilter /></UApp>',
  }, { route })
}

function query(wrapper: VueWrapper) {
  return (wrapper.vm.$router as unknown as { currentRoute: { value: { query: Record<string, string> } } })
    .currentRoute
    .value
    .query
}

describe('usage granularity filter', () => {
  it('is automatic until someone chooses, and says so in the URL by saying nothing', async () => {
    const wrapper = await mountFilter('/?range=30d')

    expect(wrapper.find('[data-testid="usage-granularity-auto"]').attributes('aria-pressed')).toBe('true')
    expect(query(wrapper).granularity).toBeUndefined()
  })

  it('names the width automatic settled on, so a reader knows what a bar means', async () => {
    const wrapper = await mountFilter('/?range=30d')

    // thirty days is inside the daily threshold
    expect(wrapper.find('[data-testid="usage-granularity-auto"]').text()).toContain('Auto (day)')
  })

  it('names months for all time, whose span only the server knows', async () => {
    const wrapper = await mountFilter('/?range=all')

    expect(wrapper.find('[data-testid="usage-granularity-auto"]').text()).toContain('Auto (month)')
  })

  it('writes an override to the URL when one is chosen', async () => {
    const wrapper = await mountFilter('/?range=30d')

    await wrapper.find('[data-testid="usage-granularity-week"]').trigger('click')

    await vi.waitFor(() => {
      expect(query(wrapper).granularity).toBe('week')
    })
    expect(wrapper.find('[data-testid="usage-granularity-auto"]').attributes('aria-pressed')).toBe('false')
  })

  it('restores the override a URL describes', async () => {
    const wrapper = await mountFilter('/?range=30d&granularity=month')

    expect(wrapper.find('[data-testid="usage-granularity-month"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('[data-testid="usage-granularity-day"]').attributes('aria-pressed')).toBe('false')
  })

  it('takes the override back out of the URL on returning to automatic', async () => {
    const wrapper = await mountFilter('/?range=30d&granularity=month')

    await wrapper.find('[data-testid="usage-granularity-auto"]').trigger('click')

    // absence is how automatic is written; an explicit "auto" token would be a
    // second way of saying the same thing
    await vi.waitFor(() => {
      expect(query(wrapper).granularity).toBeUndefined()
    })
    expect(query(wrapper).range).toBe('30d')
  })

  it('reads an unknown token as nothing chosen rather than as an error', async () => {
    const wrapper = await mountFilter('/?range=30d&granularity=hour')

    expect(wrapper.find('[data-testid="usage-granularity-auto"]').attributes('aria-pressed')).toBe('true')
  })

  it('keeps the range alone when the bucket width changes', async () => {
    const wrapper = await mountFilter('/?from=2026-08-01&to=2026-08-31')

    await wrapper.find('[data-testid="usage-granularity-week"]').trigger('click')

    await vi.waitFor(() => {
      expect(query(wrapper).granularity).toBe('week')
    })
    expect(query(wrapper).from).toBe('2026-08-01')
    expect(query(wrapper).to).toBe('2026-08-31')
  })
})
