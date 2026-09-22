import { toGalaxyServiceUnavailable } from 'blendtype'
import { Data, Effect, Exit, Layer } from 'effect'
import { useLogger } from 'evlog'
import { createError, defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { runTask } from 'nitropack/runtime/task'
import { Drizzle } from '../../../../utils/drizzle'
import { runGalaxyEffect } from '../../../../utils/evlog-effect'
import { useGalaxyLayer } from '../../../../utils/galaxy'
import { ForbiddenError, getSupabaseUser, GetSupabaseUserError, ServerSupabaseClaims, ServerSupabaseClient } from '../../../../utils/grizzle/supabase'
import { toHttpError } from '../../../../utils/httpError'

export class NotFoundError extends Data.TaggedError('NotFoundError')<{
  readonly message: string
}> {}

export default defineEventHandler(async (event) => {
  const analysisId = getRouterParam(event, 'id')
  // No guard for an absent or empty id: `Number.parseInt` turns both into
  // `NaN`, which the check below already answers with a 404. Returning
  // `undefined` here only hid that answer behind an empty 200.
  const parsedAnalysisId = Number.parseInt(analysisId ?? '', 10)
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
      Effect.exit,
    ),
  )

  return Exit.match(result, {
    // both messages below are already what the errors carry, so folding the
    // tail leaves every status and body on this endpoint unchanged
    onFailure: cause => toHttpError(event, cause, 'sync analysis', {
      statuses: { NotFoundError: 404 },
      context: { analysisId: parsedAnalysisId },
    }),
    onSuccess: (value) => {
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
