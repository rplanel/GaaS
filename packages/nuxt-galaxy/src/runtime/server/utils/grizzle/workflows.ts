import { useRuntimeConfig } from '#imports'
import { and, eq } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { workflows } from '../../db/schema/galaxy/workflows'
import { Drizzle } from '../drizzle'
import { takeUniqueOrThrow } from './helper'
import { getCurrentUserEffect } from './user'

// eslint-disable-next-line unicorn/throw-new-error
export class GetWorkflowError extends Data.TaggedError('GetWorkflowError')<{
  readonly message: string
}> {}

export function getWorkflowEffect(workflowId: number) {
  const { public: { galaxy: { url } }, galaxy: { email } } = useRuntimeConfig()
  return Effect.gen(function* () {
    const currentUser = yield* getCurrentUserEffect(url, email)
    const useDrizzle = yield* Drizzle
    if (currentUser) {
      return yield* Effect.tryPromise({
        try: () => useDrizzle
          .select()
          .from(workflows)
          .where(
            and(
              eq(workflows.userId, currentUser.user.id),
              eq(workflows.id, workflowId),
            ),
          )
          .then(takeUniqueOrThrow),
        catch: () => new GetWorkflowError({ message: 'Error getting workflow' }),
      })
    }
  })
}
