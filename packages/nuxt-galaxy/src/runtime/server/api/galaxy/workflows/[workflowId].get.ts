import { useRuntimeConfig } from '#imports'
import * as bt from 'blendtype'
import { Cause, Effect, Option } from 'effect'
import { defineEventHandler, getRouterParam } from 'h3'
import { Drizzle } from '../../../utils/drizzle'
import { runGalaxyEffect } from '../../../utils/evlog-effect'
import { useGalaxyLayer } from '../../../utils/galaxy'
import { ServerSupabaseClaims, ServerSupabaseClient } from '../../../utils/grizzle/supabase'

export default defineEventHandler(async (event) => {
  const { public: { galaxy: { url } } } = useRuntimeConfig()

  const workflowId = getRouterParam(event, 'workflowId')
  if (workflowId) {
    const program = Effect.gen(function* () {
      return yield* bt.getWorkflowEffect(workflowId)
    })

    return runGalaxyEffect(event, program.pipe(
      bt.toGalaxyServiceUnavailable,
      Effect.provide(useGalaxyLayer()),
      Effect.provide(Drizzle.Live),
      Effect.provide(ServerSupabaseClaims.Live),
      Effect.provide(ServerSupabaseClient.Live),
      Effect.matchCause({
        onFailure: (cause) => {
          const optionFailure = Cause.failureOption(cause)
          const failureValue = Option.getOrNull(optionFailure)
          if (failureValue?._tag === 'GalaxyServiceUnavailable') {
            return { error: { message: Cause.pretty(cause), statusMessage: `Galaxy Service @ ${url} is unavailable`, statusCode: 503 }, data: undefined }
          }
          return { error: { message: Cause.pretty(cause) }, data: undefined }
        },
        onSuccess: (value) => {
          return { error: undefined, data: value }
        },
      }),
    ))
  }
  return { error: new Error('Workflow ID is required'), data: undefined }
})
