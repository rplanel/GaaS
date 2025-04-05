import { GalaxyFetch, getWorkflowEffect, runWithConfig } from 'blendtype'
import { Effect } from 'effect'
import { defineEventHandler, getRouterParam } from 'h3'
import { Drizzle } from '../../../utils/drizzle'
import { ServerSupabaseClient, ServerSupabaseUser } from '../../../utils/grizzle/supabase'

export default defineEventHandler(async (event) => {
  const workflowId = getRouterParam(event, 'workflowId')
  if (workflowId) {
    const program = Effect.gen(function* () {
      return yield* getWorkflowEffect(workflowId)
    })
    return program.pipe(
      Effect.provide(GalaxyFetch.Live),
      Effect.provide(Drizzle.Live),
      Effect.provide(ServerSupabaseUser.Live),
      Effect.provide(ServerSupabaseClient.Live),
      runWithConfig,
    )
  }
})
