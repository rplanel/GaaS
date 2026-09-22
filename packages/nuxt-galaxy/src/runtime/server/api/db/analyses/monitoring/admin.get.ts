import type { AnalysisMonitoringStats } from '../../../../../types/nuxt-galaxy'
import { Effect, Exit, Layer } from 'effect'
import { defineEventHandler } from 'h3'
import { Drizzle } from '../../../../utils/drizzle'
import { runGalaxyEffect } from '../../../../utils/evlog-effect'
import { getAllAnalysisMonitoringStats } from '../../../../utils/grizzle/analysisMonitoring'
import { getSupabaseUser, GetSupabaseUserError, requireRole, ServerSupabaseClient } from '../../../../utils/grizzle/supabase'
import { toHttpError } from '../../../../utils/httpError'
import { readUsageRequest } from '../../../../utils/usageFilters'

export default defineEventHandler(async (event): Promise<AnalysisMonitoringStats> => {
  // read before any work is done, so a malformed range or bucket width costs a
  // round trip and nothing more
  const { filters, granularity } = readUsageRequest(event)

  const program = Effect.gen(function* () {
    const user = yield* getSupabaseUser(event)
    if (!user || typeof user.id !== 'string' || user.id.length === 0) {
      return yield* Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' }))
    }
    yield* requireRole(user, 'admin')
    return yield* getAllAnalysisMonitoringStats(filters, granularity)
  })

  const result = await runGalaxyEffect(
    event,
    program.pipe(
      Effect.provide(Layer.mergeAll(Drizzle.Live, ServerSupabaseClient.Live)),
      Effect.exit,
    ),
  )

  return Exit.match(result, {
    onFailure: cause => toHttpError(event, cause, 'analysis monitoring admin'),
    onSuccess: value => value,
  })
})
