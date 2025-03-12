import type { Database } from '../../types/database'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { defineEventHandler, parseCookies } from 'h3'
import { useSupabaseCookie } from '../../app/composables/useSupabaseCookie'

export default defineEventHandler(async (event) => {
  const cookies = parseCookies(event)
  const { authCookieName } = useSupabaseCookie()

  const cookiesKeys = Object.keys(cookies)
  const hasAuthCookie = cookiesKeys.find(key => key.startsWith(authCookieName))
  // const hasCodeVerifier = cookiesKeys.find(key => key.endsWith('auth-token-code-verifier'))
  if (hasAuthCookie
  // && !hasCodeVerifier
  ) {
    const user = await serverSupabaseUser(event)
    const client = await serverSupabaseClient<Database>(event)
    event.context.supabase = { user, client }
  }
})
