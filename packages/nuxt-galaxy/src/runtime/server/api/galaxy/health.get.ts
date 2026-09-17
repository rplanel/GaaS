import type { GalaxyHealth } from '../../../types/nuxt-galaxy'
import { useRuntimeConfig } from '#imports'
import { Effect } from 'effect'
import { defineEventHandler } from 'h3'
import { Drizzle } from '../../utils/drizzle'
import { runGalaxyEffect } from '../../utils/evlog-effect'
import { checkGalaxyHealthEffect } from '../../utils/health'

export default defineEventHandler(async (event): Promise<GalaxyHealth> => {
  const { public: { galaxy: { url } } } = useRuntimeConfig()

  const result = await runGalaxyEffect(event, checkGalaxyHealthEffect().pipe(
    Effect.provide(Drizzle.Live),
    Effect.catchAll(() => Effect.succeed({
      status: 'down' as const,
      maintenance: null,
    })),
  ))

  return {
    status: result.status,
    url,
    maintenance: result.maintenance,
  }
})
