import { beforeEach, describe, expect, it, vi } from 'vitest'

// Reset the module-level singleton between tests
let galaxyModule: typeof import('../../../src/runtime/server/utils/galaxy')

describe('useGalaxyLayer', () => {
  beforeEach(async () => {
    vi.resetModules()
    // Re-import to reset the singleton
    galaxyModule = await import('../../../src/runtime/server/utils/galaxy')
  })

  it('should return a Layer', () => {
    const layer = galaxyModule.useGalaxyLayer()
    expect(layer).toBeDefined()
  })

  it('should return the same layer instance on subsequent calls (singleton)', () => {
    const layer1 = galaxyModule.useGalaxyLayer()
    const layer2 = galaxyModule.useGalaxyLayer()
    expect(layer1).toBe(layer2)
  })
})
