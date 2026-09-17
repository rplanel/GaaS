import { toGalaxyServiceUnavailable } from 'blendtype'
import { Data, Effect, Either, Layer } from 'effect'
import { useLogger } from 'evlog'
import { createError, defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { runTask } from 'nitropack/runtime/task'
import { Drizzle } from '../../../../utils/drizzle'
import { runGalaxyEffect } from '../../../../utils/evlog-effect'
import { useGalaxyLayer } from '../../../../utils/galaxy'
import { ForbiddenError, getSupabaseUser, GetSupabaseUserError, ServerSupabaseClaims, ServerSupabaseClient } from '../../../../utils/grizzle/supabase'

export class NotFoundError extends Data.TaggedError('NotFoundError')<{
  readonly message: string
}> {}

export default defineEventHandler(async (event) => {
  const analysisId = getRouterParam(event, 'id')
  if (!analysisId)
    return undefined

  const parsedAnalysisId = Number.parseInt(analysisId, 10)
  if (Number.isNaN(parsedAnalysisId)) {
    throw createError({ statusCode: 404, statusMessage: 'Analysis not found' })
  }

  const program = Effect.gen(function* () {
    const supabaseUser = yield* getSupabaseUser(event)
    if (!supabaseUser?.id) {
      return yield* Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' }))
    }

    const createSupabase = yield* ServerSupabaseClient
    const supabase = yield* createSupabase(event)

    const { data: analysis, error } = yield* Effect.tryPromise(() =>
      supabase.schema('galaxy').from('analyses').select('id, owner_id').eq('id', parsedAnalysisId).single(),
    )

    if (error || !analysis) {
      return yield* Effect.fail(new NotFoundError({ message: 'Analysis not found' }))
    }

    if (analysis.owner_id !== supabaseUser.id) {
      return yield* Effect.fail(new ForbiddenError({ message: 'Forbidden' }))
    }

    return { userId: supabaseUser.id }
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
      if (error._tag === 'NotFoundError') {
        throw createError({ statusCode: 404, statusMessage: 'Analysis not found' })
      }
      if (error._tag === 'ForbiddenError') {
        throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
      }
      const log = useLogger(event)
      log.error('sync analysis handler failed', {
        errorTag: error._tag,
        message: (error as { message?: string }).message ?? String(error),
        analysisId: parsedAnalysisId,
      })
      throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
    },
    onRight: (value) => {
      const log = useLogger(event)
      log.info('sync queued', { analysisId: parsedAnalysisId, userId: value.userId })
      setResponseStatus(event, 202, 'Accepted')
      // Intentionally not awaited — the scheduled task owns execution.
      runTask('galaxy:sync-analyses', { payload: { analysisId: parsedAnalysisId } })
        .catch(err => log.error('sync task failed to start', { analysisId: parsedAnalysisId, error: (err as Error).message }))
      return { analysisId: parsedAnalysisId, status: 'queued', task: 'galaxy:sync-analyses' }
    },
  })
})
