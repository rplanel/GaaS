import { and, gte, lte } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { maintenanceWindows } from '../../db/schema/galaxy/maintenanceWindows'
import { Drizzle } from '../drizzle'

export class GetMaintenanceWindowError extends Data.TaggedError('GetMaintenanceWindowError')<{
  readonly message: string
}> {}

export function getActiveMaintenanceEffect() {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .select()
        .from(maintenanceWindows)
        .where(and(
          lte(maintenanceWindows.startAt, new Date()),
          gte(maintenanceWindows.endAt, new Date()),
        ))
        .limit(1),
      catch: error => new GetMaintenanceWindowError({
        message: `Error querying maintenance windows: ${error}`,
      }),
    })
  })
}
