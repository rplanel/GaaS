import { useRuntimeConfig } from '#imports'
import { toGalaxyServiceUnavailable } from 'blendtype'
import { Effect, Layer } from 'effect'
import { defineEventHandler, readBody } from 'h3'
import { Drizzle } from '../../utils/drizzle'
import { useGalaxyLayer } from '../../utils/galaxy'
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
      Drizzle.Live,
    )

    return insertWorkflow(galaxyId, url, email, event).pipe(
      toGalaxyServiceUnavailable,
      Effect.provide(finalLayer),
      Effect.provide(useGalaxyLayer()),
      Effect.runPromise,
    )
  },
)
