import { UApp } from '#components'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import AdminIndexPage from '../../app/pages/admin/index.vue'

/** The role the signed-in user carries, as the JWT claim reports it. */
const userRole = ref<string | undefined>('admin')

mockNuxtImport('useUserRole', () => () => ({ userRole }))
mockNuxtImport('useSupabaseClient', () => () => ({} as never))

async function mountPage() {
  return mountSuspended({
    components: { UApp, AdminIndexPage },
    template: '<UApp><AdminIndexPage /></UApp>',
  })
}

describe('admin index', () => {
  it('offers an administrator a way through to global usage', async () => {
    userRole.value = 'admin'

    const wrapper = await mountPage()

    expect(wrapper.html()).toContain('/admin/usage')
    expect(wrapper.text()).toContain('Usage')
  })

  it('offers a non-admin the permission alert instead of the cards', async () => {
    userRole.value = 'user'

    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('You don\'t have the admin permission')
    expect(wrapper.html()).not.toContain('/admin/usage')
  })
})
