import { useRuntimeConfig } from '#imports'
import { GalaxyClient } from 'blendtype'
import { defineNitroPlugin } from 'nitropack/runtime'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const { public: { galaxy: { url } }, galaxy: { apiKey } } = useRuntimeConfig()
    const $galaxy = GalaxyClient.getInstance(apiKey, url)
    event.context.galaxy = $galaxy
  })
})
