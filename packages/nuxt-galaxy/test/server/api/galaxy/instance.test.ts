import { describe, expect, it, vi } from 'vitest'

// Mock blendtype
vi.mock('blendtype', () => ({
  getVersion: vi.fn(() => Promise.resolve({
    version_major: '23',
    version_minor: '1',
  })),
  makeGalaxyLayer: vi.fn(() => ({})),
}))

// Mock the galaxy utility
vi.mock('../../../../src/runtime/server/utils/galaxy', () => ({
  useGalaxyLayer: vi.fn(() => ({})),
}))

describe('gET /api/galaxy/instance', () => {
  it('should return instance URL and version info', async () => {
    const handler = (await import('../../../../src/runtime/server/api/galaxy/instance.get')).default

    const result = await handler({} as any)

    expect(result).toEqual({
      url: 'https://galaxy.example.com',
      version_major: '23',
      version_minor: '1',
    })
  })
})
