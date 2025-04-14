import { useRuntimeConfig } from '#imports'
import { exportWorkflowEffect, GalaxyFetch, runWithConfig } from 'blendtype'
import { Effect, Layer } from 'effect'
import { defineEventHandler, readBody } from 'h3'
import { Drizzle } from '../../utils/drizzle'
import { ServerSupabaseClient, ServerSupabaseUser } from '../../utils/grizzle/supabase'
import { getCurrentUserEffect } from '../../utils/grizzle/user'

export default defineEventHandler<
  {
    body: {
      galaxyId: string
      userId: number

    }
  }
>(
  async (event) => {
    const body = await readBody(event)
    const { galaxyId } = body
    const { public: { galaxy: { url } }, galaxy: { email } } = useRuntimeConfig()

    const program = Effect.gen(function* () {
      const createServerSupabaseUser = yield* ServerSupabaseUser
      const supabaseUser = yield* createServerSupabaseUser(event)
      const createServerSupabaseClient = yield* ServerSupabaseClient
      const supabaseClient = yield* createServerSupabaseClient(event)
      if (supabaseUser) {
        const galaxyWorkflow = yield* exportWorkflowEffect(galaxyId)
        const galaxyUser = yield* getCurrentUserEffect(url, email)
        const definition = galaxyWorkflow as any

        if (galaxyUser) {
          const { error, data } = yield* Effect.promise(() => supabaseClient
            .schema('galaxy')
            .from('workflows')
            .insert({
              version: galaxyWorkflow.version,
              name: galaxyWorkflow.name,
              galaxy_id: galaxyId,
              user_id: galaxyUser.user.id,
              definition,
            })
            .select(),
          )
          if (error) {
            if (error.code === '42501') {
              return yield* Effect.fail(new Error('Permission denied'))
            }
            else {
              return yield* Effect.fail(new Error(`supabase error: ${error.message}\ncode : ${error.code}`))
            }
          }
          else {
            return data
          }
        }
      }
    })

    const finalLayer = Layer.mergeAll(
      ServerSupabaseClient.Live,
      ServerSupabaseUser.Live,
      GalaxyFetch.Live,
      Drizzle.Live,
    )
    return program.pipe(
      Effect.provide(finalLayer),
      runWithConfig,
    )
  },
)
