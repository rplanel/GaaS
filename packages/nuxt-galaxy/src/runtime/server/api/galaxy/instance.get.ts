import type { GalaxyVersion } from 'blendtype'
import type { GalaxyInstanceDetails } from '../../../types/nuxt-galaxy'
import { useRuntimeConfig } from '#imports'
import { getVersion } from 'blendtype'
import { defineEventHandler } from 'h3'

export default defineEventHandler(async (): Promise<GalaxyInstanceDetails> => {
  const { public: { galaxy: { url } } } = useRuntimeConfig()
  const version: GalaxyVersion = await getVersion()
  return { url, ...version }
})
