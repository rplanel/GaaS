import { and, eq } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { instances } from '../../db/schema/galaxy/instances'
import { users } from '../../db/schema/galaxy/users'
import { Drizzle, useDrizzle } from '../drizzle'
import { takeUniqueOrNull } from './helper'

export async function getCurrentUser(url: string, email: string) {
  return useDrizzle().select().from(users).innerJoin(instances, eq(users.instanceId, instances.id)).where(and(
    eq(users.email, email),
    eq(instances.url, url),
  )).then(takeUniqueOrNull)
}

export class GetCurrentUserError extends Data.TaggedError('GetCurrentUserError')<{
  readonly message: string

}> { }

/**
 * The Galaxy service account this application runs as has no row.
 *
 * `getCurrentUserEffect` answers `null` for it, which every caller used to let
 * fall through as a success. It is a deployment fault rather than anything a
 * caller did — an unseeded database, or a `GALAXY_URL`/`GALAXY_EMAIL` changed
 * out from under the rows that were seeded — so callers map it to a 500 and
 * say nothing more to the client.
 *
 * One class shared by every guard that turns that `null` into a failure: the
 * cause and the answer are the same wherever it is raised, and a tag per call
 * site would only give the handler more names for one status.
 */
export class GalaxyUserNotFoundError extends Data.TaggedError('GalaxyUserNotFoundError')<{
  readonly message: string
}> { }

/**
 * The failure above, with the two settings a reader needs to act on it.
 *
 * Each guard still writes its own `Effect.fail` — that is the point of ADR
 * 0002, and this does not take the effect or hide the nullable the way the
 * rejected `orFail` helper would. It only keeps one wording of the reason.
 */
export function galaxyUserNotFound(url: string, email: string): GalaxyUserNotFoundError {
  return new GalaxyUserNotFoundError({
    message: `No Galaxy user registered for ${email} at ${url}`,
  })
}

export function getCurrentUserEffect(url: string, email: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .select()
        .from(users)
        .innerJoin(instances, eq(users.instanceId, instances.id))
        .where(and(
          eq(users.email, email),
          eq(instances.url, url),
        ))
        .then(takeUniqueOrNull),
      catch: error => new GetCurrentUserError({ message: `Error getting current user: ${error}` }),
    })
  })
}
