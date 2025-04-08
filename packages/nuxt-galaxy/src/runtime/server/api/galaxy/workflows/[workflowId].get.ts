import { useRuntimeConfig } from '#imports'
import { GalaxyFetch, getWorkflowEffect, runWithConfigExit } from 'blendtype'
import { Cause, Effect, Exit, Option } from 'effect'
import { defineEventHandler, getRouterParam } from 'h3'
import { Drizzle } from '../../../utils/drizzle'
import { ServerSupabaseClient, ServerSupabaseUser } from '../../../utils/grizzle/supabase'

export default defineEventHandler(async (event) => {
  const { public: { galaxy: { url } } } = useRuntimeConfig()

  const workflowId = getRouterParam(event, 'workflowId')
  if (workflowId) {
    const program = Effect.gen(function* () {
      // return yield* Effect.fail(
      //   new GalaxyServiceUnavailable({
      //     message: `Galaxy service @ ${url} is unavailable`,
      //   }),
      // )
      return yield* getWorkflowEffect(workflowId)
    })
    const workflowExit = await program.pipe(
      Effect.provide(GalaxyFetch.Live),
      Effect.provide(Drizzle.Live),
      Effect.provide(ServerSupabaseUser.Live),
      Effect.provide(ServerSupabaseClient.Live),
      runWithConfigExit,
    )

    return Exit.match(workflowExit, {
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
    })
  }
  return { error: new Error('Workflow ID is required'), data: undefined }
})
