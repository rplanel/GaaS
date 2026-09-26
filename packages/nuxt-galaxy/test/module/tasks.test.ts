import { describe, expect, it } from 'vitest'
import { withFixtureNuxt } from './loadFixture'

/**
 * One load per distinct configuration, each with its own content database —
 * see `loadFixture`, which explains why both matter.
 */
const loaded = new Map<string, ReturnType<typeof loadNitroConfig>>()

function loadNitroConfig(galaxyOverrides: Record<string, unknown>) {
  return withFixtureNuxt(options => options.nitro, { galaxy: galaxyOverrides })
}

function loadModuleConfig(galaxyOverrides: Record<string, unknown> = {}) {
  const key = JSON.stringify(galaxyOverrides)
  const already = loaded.get(key)
  if (already) {
    return already
  }
  const loading = loadNitroConfig(galaxyOverrides)
  loaded.set(key, loading)
  return loading
}

describe('module task registration', () => {
  it('enables nitro experimental tasks', async () => {
    const nitro = await loadModuleConfig()
    expect(nitro.experimental?.tasks).toBe(true)
  })

  it('registers scheduled task every 30 seconds', async () => {
    const nitro = await loadModuleConfig()
    expect(nitro.scheduledTasks).toHaveProperty('*/30 * * * * *')
  })

  it('does not register legacy /sync route', async () => {
    const nitro = await loadModuleConfig()
    expect(nitro.handlers?.some((h: any) => h.route === '/sync')).toBeFalsy()
  })

  it('rejects non-positive syncBatchSize', async () => {
    await expect(loadModuleConfig({ syncBatchSize: 0 })).rejects.toThrow('syncBatchSize must be positive')
  })

  it('rejects negative syncMaxRetries', async () => {
    await expect(loadModuleConfig({ syncMaxRetries: -1 })).rejects.toThrow('syncMaxRetries must be non-negative')
  })

  it('rejects non-positive syncLockTtlSeconds', async () => {
    await expect(loadModuleConfig({ syncLockTtlSeconds: 0 })).rejects.toThrow('syncLockTtlSeconds must be positive')
  })

  it('rejects negative syncRetryBaseDelayMs', async () => {
    await expect(loadModuleConfig({ syncRetryBaseDelayMs: -1 })).rejects.toThrow('syncRetryBaseDelayMs must be non-negative')
  })

  it('rejects syncRetryMaxDelayMs less than syncRetryBaseDelayMs', async () => {
    await expect(loadModuleConfig({ syncRetryBaseDelayMs: 1000, syncRetryMaxDelayMs: 500 })).rejects.toThrow('syncRetryMaxDelayMs must be >= syncRetryBaseDelayMs')
  })
})
