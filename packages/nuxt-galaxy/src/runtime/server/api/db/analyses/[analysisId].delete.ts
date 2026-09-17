import { toGalaxyServiceUnavailable } from 'blendtype'
import { Cause, Effect, Either, Layer } from 'effect'
import { useLogger } from 'evlog'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { Drizzle } from '../../../utils/drizzle'
import { runGalaxyEffect } from '../../../utils/evlog-effect'
import { useGalaxyLayer } from '../../../utils/galaxy'
import { deleteAnalysis } from '../../../utils/grizzle/analyses'
import { getSupabaseUser, GetSupabaseUserError, ServerSupabaseClaims, ServerSupabaseClient } from '../../../utils/grizzle/supabase'

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
    onLeft: (error) => {
      if (error._tag === 'GetSupabaseUserError') {
        throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
      }
      const log = useLogger(event)
      log.error('delete analysis handler failed', { cause: Cause.pretty(Cause.fail(error)) })
      throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
    },
    onRight: value => value,
  })
})
