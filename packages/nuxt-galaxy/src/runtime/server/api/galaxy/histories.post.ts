import { useRuntimeConfig } from '#imports'
import { createHistory, initializeGalaxyClient } from 'blendtype'

import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const { public: { galaxy: { url } }, galaxy: { apiKey } } = useRuntimeConfig()

  const body = await readBody(event)
  initializeGalaxyClient({ apiKey, url })

  return createHistory(body.name)
})
