import type { SupabaseClient } from '@supabase/supabase-js'
import type { JwtPayload } from 'jwt-decode'
import type { Ref } from 'vue'
import type { Database } from '../../types/database'
import type { RoleType } from '../../types/nuxt-galaxy'
import { jwtDecode } from 'jwt-decode'
import { ref } from 'vue'

interface JwtPayloadWithRole extends JwtPayload {
  user_role: RoleType
}

/**
 * A composable function to get the user role from the Supabase session.
 * It listens for authentication state changes and updates the user role accordingly.
 *
 * @param {SupabaseClient<Database>} supabase - The Supabase client instance.
 * @returns {{ userRole: Ref<string | undefined> }} An object containing the userRole ref.
 */
export function useUserRole(supabase: SupabaseClient<Database>): { userRole: Ref<string | undefined> } {
  const userRole = ref<string | undefined>(undefined)
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      try {
        userRole.value = jwtDecode<JwtPayloadWithRole>(session.access_token).user_role
      }
      catch {
        // A token that cannot be decoded names no role (#192).
        userRole.value = undefined
      }
    }
    // should not throw an error if no session is found,
    // just return undefined otherwise the app will not work
  })
  return { userRole }
}
