import type { AnalysisMonitoringStats } from '../../../../types/nuxt-galaxy'
import { Cause, Effect, Either, Layer } from 'effect'
import { useLogger } from 'evlog'
import { createError, defineEventHandler } from 'h3'
import { Drizzle } from '../../../utils/drizzle'
import { runGalaxyEffect } from '../../../utils/evlog-effect'
import { getAnalysisMonitoringStats } from '../../../utils/grizzle/analysisMonitoring'
import { getSupabaseUser, GetSupabaseUserError, ServerSupabaseClient } from '../../../utils/grizzle/supabase'
import { readUsageFilters } from '../../../utils/usageFilters'

export default defineEventHandler(async (event): Promise<AnalysisMonitoringStats> => {
  // read before any work is done, so a malformed range costs a round trip and
  // nothing more
  const filters = readUsageFilters(event)

  const program = Effect.gen(function* () {
    const supabaseUser = yield* getSupabaseUser(event)
    if (!supabaseUser || typeof supabaseUser.id !== 'string' || supabaseUser.id.length === 0) {
      return yield* Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' }))
    }
    return yield* getAnalysisMonitoringStats(supabaseUser.id, filters)
  })

  const result = await runGalaxyEffect(
    event,
    program.pipe(
      Effect.provide(Layer.mergeAll(Drizzle.Live, ServerSupabaseClient.Live)),
      Effect.either,
    ),
  )

  return Either.match(result, {
    onLeft: (error) => {
      if (error._tag === 'GetSupabaseUserError') {
        throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
      }
      const log = useLogger(event)
      log.error('analysis monitoring handler failed', { cause: Cause.pretty(Cause.fail(error)) })
      throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
    },
    onRight: value => value,
  })
})
