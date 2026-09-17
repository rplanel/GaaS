import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadNuxt } from '@nuxt/kit'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtureDir = join(__dirname, '../fixtures/basic')

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
  const nitro = nuxt.options.nitro
  await nuxt.close()
  return nitro
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
