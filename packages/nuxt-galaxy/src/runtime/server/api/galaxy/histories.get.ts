import { getHistoryEffect, toGalaxyServiceUnavailable } from 'blendtype'
import { Effect } from 'effect'
import { defineEventHandler } from 'h3'
import { runGalaxyEffect } from '../../utils/evlog-effect'
import { useGalaxyLayer } from '../../utils/galaxy'
import { ServerSupabaseClient } from '../../utils/grizzle/supabase'

export default defineEventHandler(async (event) => {
  const program = Effect.gen(function* () {
    const createServerSupabaseClient = yield* ServerSupabaseClient
    const supabaseClient = yield* createServerSupabaseClient(event)
    const { error, data: historiesDb } = yield* Effect.promise(() => supabaseClient
      .schema('galaxy')
      .from('histories')
      .select())

    if (error) {
      return yield* Effect.fail(new Error(`supabase error: ${error.message}\ncode : ${error.code}`))
    }

    if (historiesDb) {
      const effects = historiesDb.map((h) => {
        return getHistoryEffect(h.galaxy_id)
      })
      return yield* Effect.all(effects)
    }
  })

  return runGalaxyEffect(event, program.pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(ServerSupabaseClient.Live),
    Effect.provide(useGalaxyLayer()),
  ))
})
