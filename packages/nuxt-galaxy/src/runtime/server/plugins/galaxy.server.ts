import { createError, useRuntimeConfig } from '#imports'
import { initializeGalaxyClient } from 'blendtype'
import { defineNitroPlugin } from 'nitropack/runtime'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', () => {
    const { public: { galaxy: { url } }, galaxy: { apiKey } } = useRuntimeConfig()
    if (!url) {
      throw createError('Galaxy URL is not configured in the runtime config.')
    }
    if (!apiKey) {
      throw createError('Galaxy API key is not configured in the runtime config.')
    }
    initializeGalaxyClient({ apiKey, url })
  })
})
