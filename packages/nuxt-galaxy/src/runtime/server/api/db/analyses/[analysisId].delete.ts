import { GalaxyFetch, runWithConfig } from 'blendtype'
import { Effect, Layer } from 'effect'
import { defineEventHandler, getRouterParam } from 'h3'
import { Drizzle } from '../../../utils/drizzle'
import { deleteAnalysis } from '../../../utils/grizzle/analyses'
import { ServerSupabaseClient, ServerSupabaseUser } from '../../../utils/grizzle/supabase'

export default defineEventHandler(
  async (event) => {
    const analysisId = (getRouterParam(event, 'analysisId'))

    // use getHistoryAnalysis(analysisId, ownerId) to get the analysis

    if (analysisId) {
      const program = Effect.gen(function* () {
        const createServerSupabaseUser = yield* ServerSupabaseUser
        const supabaseUser = yield* createServerSupabaseUser(event)
        if (supabaseUser) {
          return yield* deleteAnalysis(
            Number.parseInt(analysisId),
            supabaseUser.id,
          )
        }
      })
      const finalLayer = Layer.mergeAll(
        ServerSupabaseClient.Live,
        ServerSupabaseUser.Live,
        GalaxyFetch.Live,
        Drizzle.Live,
      )
      return program.pipe(
        Effect.provide(finalLayer),
        runWithConfig,
      )
      // try {
      //   const analysisDb = await useDrizzle()
      //     .select()
      //     .from(analyses)
      //     .innerJoin(histories, eq(analyses.historyId, histories.id))
      //     .where(eq(analyses.id, Number.parseInt(analysisId)))
      //     .then(takeUniqueOrThrow)

      //   // delete galaxy history
      //   await deleteHistory(analysisDb.histories.galaxyId)
      //   await useDrizzle()
      //     .delete(histories)
      //     .where(
      //       eq(histories.id, analysisDb.histories.id),
      //     )
      //     .returning()
      //   return analysisDb
      // }
      // catch (error) {
      //   throw createError({ statusMessage: getErrorMessage(error), statusCode: getStatusCode(error) })
      // }
    }
  },
)
