import { describe, expect, it } from 'vitest'
import { GALAXY_CACHE_MOUNT } from '../../src/runtime/server/utils/galaxyCacheMount'
import { withFixtureNuxt } from './loadFixture'

/**
 * #87, Q16. The cache behind the description endpoint is a Nitro storage
 * mount rather than an in-process map, because this package is distributed:
 * an LRU in one process is right for a single replica and wrong for anyone
 * running several. That makes the mount's options a module option, and this
 * is the check that a consumer can really set them.
 */
async function loadModuleConfig(galaxyOverrides: Record<string, unknown> = {}) {
  return withFixtureNuxt(
    options => ({ nitro: options.nitro, runtimeConfig: options.runtimeConfig }),
    { galaxy: galaxyOverrides },
  )
}

/**
 * One load per distinct configuration, shared by the tests that ask about
 * it.
 *
 * `@nuxt/content` is a module dependency of this one, and its `close` hook
 * drops its content tables from a SQLite database the fixture never builds.
 * Enough load/close cycles across the suite and that rejection lands
 * unhandled, failing the run with every test passing — so a load is worth
 * making only once per question (#87).
 */
const loaded = new Map<string, ReturnType<typeof loadModuleConfig>>()

function moduleConfig(galaxyOverrides: Record<string, unknown> = {}) {
  const key = JSON.stringify(galaxyOverrides)
  const already = loaded.get(key)
  if (already) {
    return already
  }
  const loading = loadModuleConfig(galaxyOverrides)
  loaded.set(key, loading)
  return loading
}

describe('module cache configuration', () => {
  it('mounts the cache on the memory driver by default', async () => {
    const { nitro } = await moduleConfig()

    expect(nitro.storage?.[GALAXY_CACHE_MOUNT]).toEqual({ driver: 'memory' })
  })

  it('caches by default, and says so in the runtime config the endpoint reads', async () => {
    const { runtimeConfig } = await moduleConfig()

    expect(runtimeConfig.galaxy.cache).toEqual({ enabled: true })
  })

  it('lets a deployment with several replicas point the mount at Redis', async () => {
    const { nitro } = await moduleConfig({
      cache: { storage: { driver: 'redis', url: 'redis://localhost:6379' } },
    })

    expect(nitro.storage?.[GALAXY_CACHE_MOUNT]).toEqual({ driver: 'redis', url: 'redis://localhost:6379' })
  })

  it('lets a deployment turn the cache off, which is the only escape hatch there is', async () => {
    // No expiry and no runtime invalidation: Galaxy treats a tool's version
    // string as its identity, so a tool changed under a fixed version is an
    // upstream identity problem rather than one to paper over with a TTL.
    const { runtimeConfig, nitro } = await moduleConfig({ cache: { enabled: false } })

    expect(runtimeConfig.galaxy.cache).toEqual({ enabled: false })
    // still mounted, so turning it on again is a config change rather than a
    // different Nitro build
    expect(nitro.storage?.[GALAXY_CACHE_MOUNT]).toEqual({ driver: 'memory' })
  })
})
