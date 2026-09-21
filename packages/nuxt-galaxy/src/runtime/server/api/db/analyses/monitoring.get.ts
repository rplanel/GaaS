import type { AnalysisMonitoringStats } from '../../../../types/nuxt-galaxy'
import { Effect, Either, Layer } from 'effect'
import { defineEventHandler } from 'h3'
import { Drizzle } from '../../../utils/drizzle'
import { runGalaxyEffect } from '../../../utils/evlog-effect'
import { getAnalysisMonitoringStats } from '../../../utils/grizzle/analysisMonitoring'
import { getSupabaseUser, GetSupabaseUserError, ServerSupabaseClient } from '../../../utils/grizzle/supabase'
import { toHttpError } from '../../../utils/httpError'
import { readUsageRequest } from '../../../utils/usageFilters'

export default defineEventHandler(async (event): Promise<AnalysisMonitoringStats> => {
  // read before any work is done, so a malformed range or bucket width costs a
  // round trip and nothing more
  const { filters, granularity } = readUsageRequest(event)

  const program = Effect.gen(function* () {
    const supabaseUser = yield* getSupabaseUser(event)
    if (!supabaseUser || typeof supabaseUser.id !== 'string' || supabaseUser.id.length === 0) {
      return yield* Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' }))
    }
    return yield* getAnalysisMonitoringStats(supabaseUser.id, filters, granularity)
  })

  const result = await runGalaxyEffect(
    event,
    program.pipe(
      Effect.provide(Layer.mergeAll(Drizzle.Live, ServerSupabaseClient.Live)),
      Effect.either,
    ),
  )

  return Either.match(result, {
    onLeft: error => toHttpError(event, error, 'analysis monitoring'),
    onRight: value => value,
  })
})
