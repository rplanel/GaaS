import type { GalaxyTool } from 'blendtype'
import type { GalaxyCacheStore } from '../../../src/runtime/server/utils/galaxyCache'
import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  makeGalaxyCache,
  noGalaxyCache,
  toolCacheKey,
  useGalaxyCache,
} from '../../../src/runtime/server/utils/galaxyCache'
import { GALAXY_CACHE_MOUNT } from '../../../src/runtime/server/utils/galaxyCacheMount'
import { resetMockStorages } from '../setup'

/**
 * #87, Q15 and Q16. The cache behind the description endpoint: what a key is
 * made of, and what happens when the store underneath says no.
 *
 * The keys are the whole point of the file. Two deployments may share one
 * Redis, a built-in tool id carries no toolshed path to tell them apart, and
 * nothing here ever expires — so a key that collides is a wrong answer
 * served for ever.
 */

const GALAXY = 'https://galaxy.example.com'
const FOO = 'toolshed.g2.bx.psu.edu/repos/iuc/foo/foo/1.2.3+galaxy0'

const aTool = { model_class: 'Tool', id: FOO, name: 'foo', version: '1.2.3+galaxy0' } as unknown as GalaxyTool

/** A store that answers, so a round trip can be watched end to end. */
function mapStore(): GalaxyCacheStore & { items: Map<string, unknown> } {
  const items = new Map<string, unknown>()
  return {
    items,
    getItem: async (key: string) => items.get(key) ?? null,
    setItem: async (key: string, value: unknown) => {
      items.set(key, value)
    },
  }
}

describe('cache keys', () => {
  it('names the Galaxy a tool came from, its id, and the version served', () => {
    expect(toolCacheKey(GALAXY, 'Cut1', '1.0.2')).toContain('Cut1')
    expect(toolCacheKey(GALAXY, 'Cut1', '1.0.2')).not.toBe(toolCacheKey('https://other.example.com', 'Cut1', '1.0.2'))
  })

  it('tells two versions of one tool apart', () => {
    expect(toolCacheKey(GALAXY, FOO, '1.2.3+galaxy0')).not.toBe(toolCacheKey(GALAXY, FOO, '1.3.0'))
  })

  it('names the tool family, so an older build\'s workflow entry cannot answer a tool read', () => {
    // #88 made the workflow half a local database read, so nothing writes a
    // `workflow|` key any more — but a store shared with an older build of
    // this package still holds them, and nothing here ever expires. The
    // prefix is what keeps an unprefixed key from naming one of them.
    expect(toolCacheKey(GALAXY, 'wf-7', '3').startsWith('tool|')).toBe(true)
  })

  it('survives unstorage normalising the key', () => {
    // `normalizeKey` truncates at the first `?`, turns `/` into `:` and
    // collapses runs of `:`. A Galaxy URL and a toolshed guid carry both
    // separators, so an unencoded key could lose its tail or collide with
    // another; encoding each part first puts that out of reach.
    const key = toolCacheKey(GALAXY, FOO, '1.2.3+galaxy0')
    expect(key).not.toContain('/')
    expect(key).not.toContain('?')
    expect(key).not.toContain(':')
  })
})

describe('makeGalaxyCache', () => {
  it('reads back what it wrote', async () => {
    const cache = makeGalaxyCache(mapStore())

    await Effect.runPromise(cache.writeTool(GALAXY, FOO, '1.2.3+galaxy0', aTool))

    expect(await Effect.runPromise(cache.tool(GALAXY, FOO, '1.2.3+galaxy0'))).toEqual(aTool)
  })

  it('answers a miss with undefined rather than null', async () => {
    const cache = makeGalaxyCache(mapStore())

    expect(await Effect.runPromise(cache.tool(GALAXY, FOO, '1.2.3+galaxy0'))).toBeUndefined()
  })

  it('treats a store that threw as a miss, not as a failed request', async () => {
    const cache = makeGalaxyCache({
      getItem: async () => { throw new Error('redis is down') },
      setItem: async () => { throw new Error('redis is down') },
    })

    expect(await Effect.runPromise(cache.tool(GALAXY, FOO, '1.2.3+galaxy0'))).toBeUndefined()
    await expect(Effect.runPromise(cache.writeTool(GALAXY, FOO, '1.2.3+galaxy0', aTool))).resolves.toBeUndefined()
  })
})

describe('noGalaxyCache', () => {
  it('remembers nothing, so every read is a miss', async () => {
    await Effect.runPromise(noGalaxyCache.writeTool(GALAXY, FOO, '1.2.3+galaxy0', aTool))

    expect(await Effect.runPromise(noGalaxyCache.tool(GALAXY, FOO, '1.2.3+galaxy0'))).toBeUndefined()
  })
})

describe('useGalaxyCache', () => {
  beforeEach(() => {
    resetMockStorages()
    vi.clearAllMocks()
  })

  it('uses the module\'s storage mount', async () => {
    const { useStorage } = await import('#imports') as unknown as { useStorage: ReturnType<typeof vi.fn> }

    const cache = useGalaxyCache(true)
    await Effect.runPromise(cache.writeTool(GALAXY, FOO, '1.2.3+galaxy0', aTool))

    expect(useStorage).toHaveBeenCalledWith(GALAXY_CACHE_MOUNT)
    expect(await Effect.runPromise(useGalaxyCache(true).tool(GALAXY, FOO, '1.2.3+galaxy0'))).toEqual(aTool)
  })

  it('remembers nothing, and never touches the mount, when the deployment turned the cache off', async () => {
    const { useStorage } = await import('#imports') as unknown as { useStorage: ReturnType<typeof vi.fn> }

    const cache = useGalaxyCache(false)
    await Effect.runPromise(cache.writeTool(GALAXY, FOO, '1.2.3+galaxy0', aTool))

    expect(useStorage).not.toHaveBeenCalled()
    expect(await Effect.runPromise(cache.tool(GALAXY, FOO, '1.2.3+galaxy0'))).toBeUndefined()
  })
})
