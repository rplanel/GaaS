import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadNuxt } from '@nuxt/kit'
import { describe, expect, it } from 'vitest'
import { GALAXY_CACHE_MOUNT } from '../../src/runtime/server/utils/galaxyCacheMount'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtureDir = join(__dirname, '../fixtures/basic')

/**
 * #87, Q16. The cache behind the description endpoint is a Nitro storage
 * mount rather than an in-process map, because this package is distributed:
 * an LRU in one process is right for a single replica and wrong for anyone
 * running several. That makes the mount's options a module option, and this
 * is the check that a consumer can really set them.
 */
async function loadModuleConfig(galaxyOverrides: Record<string, unknown> = {}) {
  const nuxt = await loadNuxt({
    cwd: fixtureDir,
    dev: false,
    ready: false,
    overrides: {
      ssr: false,
      test: true,
      galaxy: galaxyOverrides,
    },
  })
  await nuxt.ready()
  const { nitro, runtimeConfig } = nuxt.options
  await nuxt.close()
  return { nitro, runtimeConfig }
}

describe('module cache configuration', () => {
  it('mounts the cache on the memory driver by default', async () => {
    const { nitro } = await loadModuleConfig()

    expect(nitro.storage?.[GALAXY_CACHE_MOUNT]).toEqual({ driver: 'memory' })
  })

  it('caches by default, and says so in the runtime config the endpoint reads', async () => {
    const { runtimeConfig } = await loadModuleConfig()

    expect(runtimeConfig.galaxy.cache).toEqual({ enabled: true })
  })

  it('lets a deployment with several replicas point the mount at Redis', async () => {
    const { nitro } = await loadModuleConfig({
      cache: { storage: { driver: 'redis', url: 'redis://localhost:6379' } },
    })

    expect(nitro.storage?.[GALAXY_CACHE_MOUNT]).toEqual({ driver: 'redis', url: 'redis://localhost:6379' })
  })

  it('lets a deployment turn the cache off, which is the only escape hatch there is', async () => {
    // No expiry and no runtime invalidation: Galaxy treats a tool's version
    // string as its identity, so a tool changed under a fixed version is an
    // upstream identity problem rather than one to paper over with a TTL.
    const { runtimeConfig, nitro } = await loadModuleConfig({ cache: { enabled: false } })

    expect(runtimeConfig.galaxy.cache).toEqual({ enabled: false })
    // still mounted, so turning it on again is a config change rather than a
    // different Nitro build
    expect(nitro.storage?.[GALAXY_CACHE_MOUNT]).toEqual({ driver: 'memory' })
  })
})
