import { GalaxyFetch, runWithConfig } from 'blendtype'
import { Effect, Layer } from 'effect'
import { defineEventHandler, getRouterParam } from 'h3'
import { Drizzle } from '../../../utils/drizzle'
import { deleteAnalysis } from '../../../utils/grizzle/analyses'
import { getSupabaseUser, ServerSupabaseClaims, ServerSupabaseClient } from '../../../utils/grizzle/supabase'

export default defineEventHandler(
  async (event) => {
    const analysisId = (getRouterParam(event, 'analysisId'))

    // use getHistoryAnalysis(analysisId, ownerId) to get the analysis

    if (analysisId) {
      const program = Effect.gen(function* () {
        const supabaseUser = yield* getSupabaseUser(event)
        if (supabaseUser?.id) {
          return yield* deleteAnalysis(
            Number.parseInt(analysisId),
            supabaseUser.id,
          )
        }
      })
      const finalLayer = Layer.mergeAll(
        ServerSupabaseClient.Live,
        ServerSupabaseClaims.Live,
        GalaxyFetch.Live,
        Drizzle.Live,
      )
      return program.pipe(
        Effect.provide(finalLayer),
        runWithConfig,
      )
    }
  },
)
