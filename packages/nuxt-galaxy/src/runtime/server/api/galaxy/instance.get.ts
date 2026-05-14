import type { GalaxyVersion } from 'blendtype'
import type { GalaxyInstanceDetails } from '../../../types/nuxt-galaxy'
import { useRuntimeConfig } from '#imports'
import { getVersionEffect, toGalaxyServiceUnavailable } from 'blendtype'
import { Effect } from 'effect'
import { defineEventHandler } from 'h3'
import { useGalaxyLayer } from '../../utils/galaxy'

export default defineEventHandler(async (): Promise<GalaxyInstanceDetails> => {
  const { public: { galaxy: { url } } } = useRuntimeConfig()
  const version: GalaxyVersion = await getVersionEffect.pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(useGalaxyLayer()),
    Effect.runPromise,
  )
  return { url, ...version }
})
