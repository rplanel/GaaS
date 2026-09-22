import { toGalaxyServiceUnavailable } from 'blendtype'
import { Effect, Exit, Layer } from 'effect'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { Drizzle } from '../../../utils/drizzle'
import { runGalaxyEffect } from '../../../utils/evlog-effect'
import { useGalaxyLayer } from '../../../utils/galaxy'
import { deleteAnalysis } from '../../../utils/grizzle/analyses'
import { getSupabaseUser, GetSupabaseUserError, ServerSupabaseClaims, ServerSupabaseClient } from '../../../utils/grizzle/supabase'
import { toHttpError } from '../../../utils/httpError'

export default defineEventHandler(async (event) => {
  const analysisId = getRouterParam(event, 'analysisId')
  // `analysisId` is the last segment, so an empty one does not match the
  // route at all and never arrives here. A non-numeric one does, though:
  // `/api/db/analyses/abc` used to reach `deleteAnalysis(NaN, …)` and put
  // the `NaN` in front of the database. This is the answer its sibling
  // `[id]/sync.post.ts` already gives.
  const parsedAnalysisId = Number.parseInt(analysisId ?? '', 10)
  if (Number.isNaN(parsedAnalysisId)) {
    throw createError({ statusCode: 404, statusMessage: 'Analysis not found' })
  }

  const program = Effect.gen(function* () {
    const supabaseUser = yield* getSupabaseUser(event)
    if (!supabaseUser?.id) {
      return yield* Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' }))
    }
    return yield* deleteAnalysis(
      parsedAnalysisId,
      supabaseUser.id,
    )
  })

  const result = await runGalaxyEffect(
    event,
    program.pipe(
      toGalaxyServiceUnavailable,
      Effect.provide(Layer.mergeAll(Drizzle.Live, ServerSupabaseClient.Live, ServerSupabaseClaims.Live, useGalaxyLayer())),
      Effect.exit,
    ),
  )

  return Exit.match(result, {
    onFailure: cause => toHttpError(event, cause, 'delete analysis'),
    onSuccess: value => value,
  })
})
