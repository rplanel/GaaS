import type { RoleType } from 'nuxt-galaxy'
import { jwtDecode } from 'jwt-decode'

/** The role claim Supabase puts on the access token. */
interface RoleClaim {
  readonly user_role?: RoleType
}

/**
 * Keep a page whose data only an administrator may read out of everyone
 * else's hands (#99).
 *
 * This exists because the server started refusing. `/api/galaxy/workflows`
 * lists the service account's entire Galaxy and is now `admin`-only, and
 * `/galaxy/workflows` read it without asking anyone's role: a signed-in
 * non-administrator got a 403 the page never looked at, so it drew an empty
 * list and said nothing was there. Refusing the navigation says the true
 * thing instead.
 *
 * The role is read from the access token rather than through `useUserRole`,
 * for two reasons. A route middleware has to decide now, and that composable
 * fills its ref from an `onAuthStateChange` callback, so it is `undefined` on
 * the first navigation and would refuse an administrator. And it decodes with
 * `@vueuse/integrations`, which this package does not depend on.
 *
 * The token is not trusted for anything but this. It decides what to *show*;
 * every endpoint behind the page checks the role again server-side, where the
 * claim is verified rather than read.
 */
export default defineNuxtRouteMiddleware(() => {
  const session = useSupabaseSession()
  const token = session.value?.access_token
  if (!token) {
    return navigateTo('/login')
  }

  let role: RoleType | undefined
  try {
    role = jwtDecode<RoleClaim>(token).user_role
  }
  catch {
    // A token this cannot read is a token this cannot find a role in, which
    // is the same answer as a role that is not `admin`.
    role = undefined
  }

  if (role !== 'admin') {
    return abortNavigation(createError({
      statusCode: 403,
      statusMessage: 'Administrators only',
    }))
  }
})
