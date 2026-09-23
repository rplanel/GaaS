import { and, eq } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { instances } from '../../db/schema/galaxy/instances'
import { users } from '../../db/schema/galaxy/users'
import { Drizzle } from '../drizzle'
import { takeUniqueOrNull } from './helper'

export class GetCurrentUserError extends Data.TaggedError('GetCurrentUserError')<{
  readonly message: string

}> { }

/**
 * The Galaxy service account this application runs as has no row.
 *
 * It is a deployment fault rather than anything a caller did — an unseeded
 * database, or a `GALAXY_URL`/`GALAXY_EMAIL` changed out from under the rows
 * that were seeded — so handlers leave it unmapped, which is the logged 500,
 * and say nothing more to the client.
 *
 * Raised by `getCurrentUserEffect` itself (#33). It used to answer `null` for
 * the missing row and every one of its three callers refused that `null`
 * with this failure, two of them with these exact words and the third under
 * `GetWorkflowError`, the tag for a workflow query that failed. Absence is
 * never a legitimate answer here, which is the test ADR 0002 sets for moving
 * the failure into the leaf: the callers had all already decided they could
 * not continue.
 */
export class GalaxyUserNotFoundError extends Data.TaggedError('GalaxyUserNotFoundError')<{
  readonly message: string
}> { }

/**
 * The failure above, with the two settings a reader needs to act on it.
 *
 * Exported for the tests that stand in for the leaf: a caller's test mocking
 * `getCurrentUserEffect` fails it with this, so the stand-in speaks the same
 * words production does.
 */
export function galaxyUserNotFound(url: string, email: string): GalaxyUserNotFoundError {
  return new GalaxyUserNotFoundError({
    message: `No Galaxy user registered for ${email} at ${url}`,
  })
}

/**
 * The Galaxy service account's row, or a named reason there is none (ADR
 * 0002). `takeUniqueOrNull` is the right reading of the query — a missing row
 * is one row, not a bug in the uniqueness assumption — and the `null` it
 * hands back is turned into the failure here, where the two settings that
 * explain it are still in scope, rather than at each caller.
 */
export function getCurrentUserEffect(url: string, email: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    const currentUser = yield* Effect.tryPromise({
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
    if (!currentUser) {
      return yield* Effect.fail(galaxyUserNotFound(url, email))
    }
    return currentUser
  })
}
