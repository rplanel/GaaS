import { Effect, Exit, Layer } from 'effect'
import { defineEventHandler } from 'h3'
import { Drizzle } from '../utils/drizzle'
import { runGalaxyEffect } from '../utils/evlog-effect'
import { accessForPath, isGalaxyApiPath } from '../utils/galaxyAccess'
import { getSupabaseUser, GetSupabaseUserError, requireRole, ServerSupabaseClient } from '../utils/grizzle/supabase'
import { toHttpError } from '../utils/httpError'

/**
 * The one check that stands in front of every `/api/galaxy/*` endpoint (#99).
 *
 * It is a Nitro **server middleware** rather than a call each handler makes,
 * because the gap it closes was not a handler that forgot: all nine proxies
 * answered without a session, and the ninth did so by matching the posture of
 * the eight beside it. A check a handler has to remember is a check the tenth
 * proxy will be written without. This one a new proxy inherits, and
 * `accessForPath` hands it the strictest level until someone says otherwise,
 * so inheriting it is safe rather than merely likely.
 *
 * `@nuxtjs/supabase`'s `redirectOptions` does not cover this and never did:
 * the module registers it with `addPlugin`, so it is a **Nuxt app plugin**
 * that guards page navigation and never runs for a Nitro `/api/**` request.
 *
 * Denials are not logged here. Every request already emits a wide event
 * carrying `path`, `method` and `status`, and the two denials are told apart
 * by the status alone — 401 is no session, 403 is a session without the
 * `admin` role. A line saying so again would be noise. `toHttpError` still
 * logs what is genuinely this server's fault, such as a role query the
 * database refused.
 */
export default defineEventHandler(async (event) => {
  // Middleware runs for every request, so the cheap string test comes first
  // and everything that is not ours leaves immediately.
  if (!isGalaxyApiPath(event.path)) {
    return
  }

  const access = accessForPath(event.path)
  if (access === 'open') {
    return
  }

  const program = Effect.gen(function* () {
    const user = yield* getSupabaseUser(event)
    // Two ways to have no session, folded into the one answer: `getUser`
    // rejects when the request carries no credentials, and the same call can
    // answer `null` without an error. Neither is a caller this endpoint has
    // anything to say to.
    if (!user || typeof user.id !== 'string' || user.id.length === 0) {
      return yield* Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' }))
    }
    // `access` is the role name, not a stand-in for one: `GalaxyRouteAccess`
    // spells its strictest level `'admin'` precisely so this passes straight
    // through with no table in between to disagree with.
    if (access === 'admin') {
      yield* requireRole(user, access)
    }
  })

  const result = await runGalaxyEffect(event, program.pipe(
    Effect.provide(Layer.mergeAll(Drizzle.Live, ServerSupabaseClient.Live)),
    Effect.exit,
  ))

  return Exit.match(result, {
    // `GetSupabaseUserError` becomes 401 and `ForbiddenError` 403, both from
    // `toHttpError`'s shared table, so the guard cannot answer either of them
    // differently from the `/api/db` handlers that already raise them. A role
    // query the database refused is neither, and takes the logged 500.
    onFailure: cause => toHttpError(event, cause, 'galaxy access guard'),
    // Nothing, deliberately: a middleware that returns a value *is* the
    // response, and this one has no answer of its own to give. Returning
    // `undefined` is what lets the request carry on to its handler.
    onSuccess: () => undefined,
  })
})
