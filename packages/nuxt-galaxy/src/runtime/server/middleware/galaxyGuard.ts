import { Effect, Exit, Layer } from 'effect'
import { useLogger } from 'evlog'
import { defineEventHandler } from 'h3'
import { Drizzle } from '../utils/drizzle'
import { runGalaxyEffect } from '../utils/evlog-effect'
import { accessForPath, isGalaxyApiPath } from '../utils/galaxyAccess'
import { getSupabaseUser, GetSupabaseUserError, requireRole, ServerSupabaseClient } from '../utils/grizzle/supabase'
import { toHttpError } from '../utils/httpError'

/**
 * The one check that stands in front of every `/api/galaxy/*` endpoint (#99).
 *
 * A Nitro **server middleware** rather than a call each handler makes: a
 * check a handler has to remember is a check the next proxy is written
 * without, which is how the gap arose — `galaxyAccess.ts` tells that story.
 * This one a new proxy inherits, and `accessForPath` hands it the strictest
 * level until someone says otherwise, so inheriting it is safe rather than
 * merely likely.
 *
 * `@nuxtjs/supabase`'s `redirectOptions` does not cover this and never did:
 * the module registers it with `addPlugin`, so it is a **Nuxt app plugin**
 * that guards page navigation and never runs for a Nitro `/api/**` request.
 *
 * No denial *message* is logged: the wide event already carries `path`,
 * `method` and `status`, the two refusals are told apart by the status alone
 * — 401 is no session, 403 is a session without the `admin` role — and evlog
 * already rates a 4xx `error`, which is where `LOGGING-SPEC.md` files an auth
 * failure. A line repeating that would be noise. What the event cannot
 * reconstruct is *who* was refused, so the fields that spec lists for a
 * server route are set instead: `handler`, and `user.id` once there is a user
 * to name. Without it no query can answer who a 403 turned away.
 *
 * `toHttpError` still logs what is genuinely this server's fault, such as a
 * role query the database refused.
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

  const log = useLogger(event)
  // A stable identifier, as the spec asks, rather than the path
  // `runGalaxyEffect` sets: every refusal this makes is the same event
  // whichever proxy was asked for. A request that passes is renamed by the
  // handler that serves it.
  log.set({ handler: 'galaxy:guard', galaxy: { access } })

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
    // Set before the role is checked, so a 403 carries the user it refused
    // and not only the fact of a refusal.
    log.set({ user: { id: user.id } })
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
