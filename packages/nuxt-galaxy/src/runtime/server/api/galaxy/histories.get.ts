import { getHistoryEffect, toGalaxyServiceUnavailable } from 'blendtype'
import { Data, Effect, Either } from 'effect'
import { defineEventHandler } from 'h3'
import { runGalaxyEffect } from '../../utils/evlog-effect'
import { useGalaxyLayer } from '../../utils/galaxy'
import { ServerSupabaseClient } from '../../utils/grizzle/supabase'
import { toHttpError } from '../../utils/httpError'

/**
 * The listing could not be read from the database.
 *
 * Nothing maps it, so it answers 500 and the reason goes to the log: a failed
 * query is this server's fault, and the caller has no use for a Postgres error
 * code.
 */
export class ListHistoriesError extends Data.TaggedError('ListHistoriesError')<{
  readonly message: string
}> { }

export default defineEventHandler(async (event) => {
  const program = Effect.gen(function* () {
    const createServerSupabaseClient = yield* ServerSupabaseClient
    const supabaseClient = yield* createServerSupabaseClient(event)
    const { error, data: historiesDb } = yield* Effect.promise(() => supabaseClient
      .schema('galaxy')
      .from('histories')
      .select())

    if (error) {
      return yield* Effect.fail(new ListHistoriesError({
        message: `supabase error: ${error.message}\ncode : ${error.code}`,
      }))
    }

    // no guard on `historiesDb`: supabase-js answers with a discriminated
    // union, so refusing `error` above narrows it to the row array rather than
    // leaving it nullable. The `if (historiesDb)` that used to wrap this block
    // could not be false, and falling off the end of it answered 200 with an
    // empty body. An empty table is `[]`, which `Effect.all` already gives.
    const effects = historiesDb.map((h) => {
      return getHistoryEffect(h.galaxy_id)
    })
    return yield* Effect.all(effects)
  })

  const result = await runGalaxyEffect(event, program.pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(ServerSupabaseClient.Live),
    Effect.provide(useGalaxyLayer()),
    Effect.either,
  ))

  return Either.match(result, {
    onLeft: error => toHttpError(event, error, 'galaxy histories'),
    onRight: value => value,
  })
})
