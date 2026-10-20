/**
 * The sign-in redirects every app on the UI layer runs with. They are the
 * layer's, not `nuxt-galaxy`'s, because the pages are (ADR 0009, #162).
 *
 * Read from the runtime config, which is where `@nuxtjs/supabase`'s redirect
 * plugin reads them, so these are the values sign-in actually runs with.
 */

import { useRuntimeConfig } from '#imports'
import { describe, expect, it } from 'vitest'

function redirectOptions() {
  return useRuntimeConfig().public.supabase.redirectOptions
}

describe('the UI layer\'s sign-in redirects', () => {
  it('sends a signed-out user to its login page, and back through its callback page', () => {
    expect(redirectOptions().login).toBe('/login')
    expect(redirectOptions().callback).toBe('/confirm')
  })

  it('saves the page the user was on to a cookie, which login and confirm read to send them back', () => {
    expect(redirectOptions().saveRedirectToCookie).toBe(true)
  })

  it('makes the landing page and the three sign-in pages its public pages', () => {
    expect(redirectOptions().exclude).toEqual(['/', '/login', '/signup', '/confirm'])
  })
})
