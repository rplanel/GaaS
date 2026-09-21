import { toGalaxyServiceUnavailable } from 'blendtype'
import { Effect, Either, Layer } from 'effect'
import { defineEventHandler, getRouterParam } from 'h3'
import { Drizzle } from '../../../utils/drizzle'
import { runGalaxyEffect } from '../../../utils/evlog-effect'
import { useGalaxyLayer } from '../../../utils/galaxy'
import { deleteAnalysis } from '../../../utils/grizzle/analyses'
import { getSupabaseUser, GetSupabaseUserError, ServerSupabaseClaims, ServerSupabaseClient } from '../../../utils/grizzle/supabase'
import { toHttpError } from '../../../utils/httpError'

export default defineEventHandler(async (event) => {
  const analysisId = getRouterParam(event, 'analysisId')
  if (!analysisId)
    return undefined

  const program = Effect.gen(function* () {
    const supabaseUser = yield* getSupabaseUser(event)
    if (!supabaseUser?.id) {
      return yield* Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' }))
    }
    return yield* deleteAnalysis(
      Number.parseInt(analysisId),
      supabaseUser.id,
    )
  })

  const result = await runGalaxyEffect(
    event,
    program.pipe(
      toGalaxyServiceUnavailable,
      Effect.provide(Layer.mergeAll(Drizzle.Live, ServerSupabaseClient.Live, ServerSupabaseClaims.Live, useGalaxyLayer())),
      Effect.either,
    ),
  )

  return Either.match(result, {
    onLeft: error => toHttpError(event, error, 'delete analysis'),
    onRight: value => value,
  })
})
