import { useRuntimeConfig } from '#imports'
import { initializeGalaxyClient } from 'blendtype'
import { defineNitroPlugin } from 'nitropack/runtime'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', () => {
    const { public: { galaxy: { url } }, galaxy: { apiKey } } = useRuntimeConfig()
    initializeGalaxyClient({ apiKey, url })
  })
})
