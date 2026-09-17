import { useRuntimeConfig } from '#imports'
import { initLogger } from 'evlog'
import { createFsDrain } from 'evlog/fs'
import { defineNitroPlugin } from 'nitropack/runtime'
import { registerEvlogFsDrain } from '../utils/evlog-drain'

export default defineNitroPlugin((nitroApp) => {
  const runtimeConfig = useRuntimeConfig()
  const file = runtimeConfig.galaxy?.logs?.file

  registerEvlogFsDrain(nitroApp, file)

  if (file) {
    const evlogConfig = (runtimeConfig.evlog ?? {}) as Record<string, any>
    initLogger({
      enabled: evlogConfig.enabled ?? true,
      env: evlogConfig.env,
      pretty: evlogConfig.pretty,
      minLevel: evlogConfig.minLevel,
      redact: evlogConfig.redact,
      drain: createFsDrain(file),
    })
  }
})
