import { and, eq } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { instances } from '../../db/schema/galaxy/instances'
import { users } from '../../db/schema/galaxy/users'
import { Drizzle, useDrizzle } from '../drizzle'
import { takeUniqueOrThrow } from './helper'

export async function getCurrentUser(url: string, email: string) {
  return useDrizzle().select().from(users).innerJoin(instances, eq(users.instanceId, instances.id)).where(and(
    eq(users.email, email),
    eq(instances.url, url),
  )).then(takeUniqueOrThrow)
}

export class GetCurrentUserError extends Data.TaggedError('GetCurrentUserError')<{
  readonly message: string

}> { }

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
        .then(takeUniqueOrThrow),
      catch: error => new GetCurrentUserError({ message: `Error getting current user: ${error}` }),
    })
  })
}
