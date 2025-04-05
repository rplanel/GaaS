import { GalaxyFetch, getHistoryEffect, runWithConfig } from 'blendtype'
import { Effect } from 'effect'
import { defineEventHandler } from 'h3'
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
      Effect.fail(new Error(`supabase error: ${error.message}\ncode : ${error.code}`))
    }

    if (historiesDb) {
      const effects = historiesDb.map((h) => {
        return getHistoryEffect(h.galaxy_id)
      })
      return yield* Effect.all(effects)
    }
  })

  return program.pipe(
    Effect.provide(ServerSupabaseClient.Live),
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
  )
})
