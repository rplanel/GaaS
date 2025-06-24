import { useRuntimeConfig } from '#imports'
import { getWorkflows, initializeGalaxyClient } from 'blendtype'
import { defineEventHandler } from 'h3'

export default defineEventHandler(async () => {
  const { public: { galaxy: { url } }, galaxy: { apiKey } } = useRuntimeConfig()
  initializeGalaxyClient({ apiKey, url })

  return getWorkflows()
})
