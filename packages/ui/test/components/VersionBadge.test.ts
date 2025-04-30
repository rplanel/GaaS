import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import VersionBadge from '../../app/components/VersionBadge.vue'

describe('versionBadge', () => {
  it('should render with version', async () => {
    const wrapper = await mountSuspended(VersionBadge, {
      props: {
        version: '1.0.0',
      },
    })

    expect(wrapper.text()).toContain('v1.0.0')
    expect(wrapper.findComponent({ name: 'UBadge' }).props('icon')).toBe('tabler:versions')
    expect(wrapper.findComponent({ name: 'UBadge' }).props('variant')).toBe('soft')
  })

  it('should render without version', async () => {
    const wrapper = await mountSuspended(VersionBadge, {
      props: {
        version: undefined,
      },
    })

    expect(wrapper.text()).toContain('v')
    expect(wrapper.findComponent({ name: 'UBadge' }).props('icon')).toBe('i-mdi:null')
    expect(wrapper.findComponent({ name: 'UBadge' }).props('variant')).toBe('soft')
  })
})
