import { useRuntimeConfig } from '#imports'
import * as bt from 'blendtype'
import { Effect, Layer } from 'effect'
import { defineEventHandler, readBody } from 'h3'
import { Drizzle } from '../../utils/drizzle'
import { ServerSupabaseClaims, ServerSupabaseClient } from '../../utils/grizzle/supabase'
import { insertWorkflow } from '../../utils/grizzle/workflows'

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
    const finalLayer = Layer.mergeAll(
      ServerSupabaseClient.Live,
      ServerSupabaseClaims.Live,
      bt.GalaxyFetch.Live,
      Drizzle.Live,
    )

    return insertWorkflow(galaxyId, url, email, event).pipe(
      Effect.provide(finalLayer),
      bt.runWithConfig,
    )
  },
)
