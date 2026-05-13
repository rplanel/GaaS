import type { GalaxyHealth } from '../../../types/nuxt-galaxy'
import { useRuntimeConfig } from '#imports'
import { Effect } from 'effect'
import { defineEventHandler } from 'h3'
import { Drizzle } from '../../utils/drizzle'
import { checkGalaxyHealthEffect } from '../../utils/health'

export default defineEventHandler(async (): Promise<GalaxyHealth> => {
  const { public: { galaxy: { url } } } = useRuntimeConfig()

  const result = await checkGalaxyHealthEffect().pipe(
    Effect.provide(Drizzle.Live),
    Effect.catchAll(() => Effect.succeed({
      status: 'down' as const,
      maintenance: null,
    })),
    Effect.runPromise,
  )

  return {
    status: result.status,
    url,
    maintenance: result.maintenance,
  }
})
