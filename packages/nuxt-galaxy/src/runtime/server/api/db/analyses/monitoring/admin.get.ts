import type { AnalysisMonitoringStats } from '../../../../../types/nuxt-galaxy'
import { Cause, Effect, Either, Layer } from 'effect'
import { useLogger } from 'evlog'
import { createError, defineEventHandler, getQuery } from 'h3'
import { Drizzle } from '../../../../utils/drizzle'
import { runGalaxyEffect } from '../../../../utils/evlog-effect'
import { getAllAnalysisMonitoringStats } from '../../../../utils/grizzle/analysisMonitoring'
import { getSupabaseUser, GetSupabaseUserError, requireRole, ServerSupabaseClient } from '../../../../utils/grizzle/supabase'
import { parseUsageFilters } from '../../../../utils/usageFilters'

export default defineEventHandler(async (event): Promise<AnalysisMonitoringStats> => {
  // read before any work is done, so a malformed range costs a round trip and
  // nothing more
  const filters = parseUsageFilters(getQuery(event))

  const program = Effect.gen(function* () {
    const user = yield* getSupabaseUser(event)
    if (!user || typeof user.id !== 'string' || user.id.length === 0) {
      return yield* Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' }))
    }
    yield* requireRole(user, 'admin')
    return yield* getAllAnalysisMonitoringStats(filters)
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
        throw createError({ statusCode: 401, statusMessage: error.message })
      }
      if (error._tag === 'ForbiddenError') {
        throw createError({ statusCode: 403, statusMessage: error.message })
      }
      const log = useLogger(event)
      log.error('analysis monitoring admin handler failed', { cause: Cause.pretty(Cause.fail(error)) })
      throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
    },
    onRight: value => value,
  })
})
