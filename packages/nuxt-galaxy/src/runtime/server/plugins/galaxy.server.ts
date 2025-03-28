import { useRuntimeConfig } from '#imports'
import { GalaxyClient, initializeGalaxyClient } from 'blendtype'
import { defineNitroPlugin } from 'nitropack/runtime'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const { public: { galaxy: { url } }, galaxy: { apiKey } } = useRuntimeConfig()
    initializeGalaxyClient({ apiKey, url })

    const $galaxy = GalaxyClient.getInstance(apiKey, url)
    event.context.galaxy = $galaxy
  })
})
