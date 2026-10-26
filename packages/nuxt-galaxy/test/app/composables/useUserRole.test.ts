import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../src/runtime/types/database'
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { useUserRole } from '../../../src/runtime/app/composables/useUserRole'

/**
 * #192. The role comes from the access token's `user_role` claim. The client
 * is faked only where the composable meets it, `auth.onAuthStateChange`, and
 * the token is built by hand: the composable decodes, it never verifies.
 */

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void | Promise<void>

function fakeSupabase() {
  let listener: AuthListener | undefined
  const supabase = {
    auth: {
      onAuthStateChange: (callback: AuthListener) => {
        listener = callback
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
    },
  } as unknown as SupabaseClient<Database>
  /** Hand the listener a session carrying `accessToken`, as a sign-in does. */
  const signIn = async (accessToken: string) => {
    await listener?.('SIGNED_IN', { access_token: accessToken } as Session)
  }
  return { supabase, signIn }
}

/** A token as Supabase signs it. Only the payload is read, so any signature will do. */
function tokenWith(claims: Record<string, unknown>): string {
  const part = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(claims)}.signature`
}

describe('useUserRole', () => {
  it('reads the role from the access token a session carries', async () => {
    const { supabase, signIn } = fakeSupabase()
    const { userRole } = useUserRole(supabase)

    await signIn(tokenWith({ sub: 'user-1', role: 'authenticated', user_role: 'admin' }))

    expect(userRole.value).toBe('admin')
  })

  it('leaves the role undefined, and throws nothing, when the token cannot be decoded', async () => {
    const { supabase, signIn } = fakeSupabase()
    const { userRole } = useUserRole(supabase)

    await expect(signIn('not-a-token')).resolves.toBeUndefined()

    expect(userRole.value).toBeUndefined()
  })

  it('clears a role read earlier when the next token cannot be decoded', async () => {
    const { supabase, signIn } = fakeSupabase()
    const { userRole } = useUserRole(supabase)
    await signIn(tokenWith({ user_role: 'admin' }))
    expect(userRole.value).toBe('admin')

    await signIn('not-a-token')

    expect(userRole.value).toBeUndefined()
  })
})
