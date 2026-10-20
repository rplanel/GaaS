/**
 * Sign-in in the second UI, the plain-HTML playground that imports only
 * `nuxt-galaxy` (ADR 0009, #164).
 *
 * The Supabase client is faked at the boundary, where the page meets it, so
 * what the test reads is what the page sent.
 */

import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '../pages/login.vue'

const { signInWithPassword } = vi.hoisted(() => ({ signInWithPassword: vi.fn() }))

mockNuxtImport('useSupabaseClient', () => () => ({ auth: { signInWithPassword } }) as never)

let mounted: { unmount: () => void } | undefined

// Unmounted after each test, so a previous mount's form or message cannot
// answer for the next one's.
afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
  signInWithPassword.mockReset()
})

/** Mounts the login page, types the email and password, and submits. */
async function signInOnThePage(email: string, password: string) {
  const wrapper = await mountSuspended(LoginPage, { route: '/login' })
  mounted = wrapper
  await wrapper.get('input[type="email"]').setValue(email)
  await wrapper.get('input[type="password"]').setValue(password)
  await wrapper.get('form').trigger('submit')
  return wrapper
}

describe('the playground\'s sign-in page', () => {
  it('signs in with the email and password typed', async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: 'user-1' }, session: {} }, error: null })

    await signInOnThePage('ada@example.org', 'analytical engine')

    expect(signInWithPassword).toHaveBeenCalledOnce()
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'ada@example.org', password: 'analytical engine' })
  })

  it('shows why Supabase refused a sign-in', async () => {
    // Supabase answers a refusal with a value, not a throw.
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { name: 'AuthApiError', status: 400, message: 'Invalid login credentials' },
    })

    const wrapper = await signInOnThePage('ada@example.org', 'difference engine')

    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').text()).toBe('Invalid login credentials'))
  })
})
