import { Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockVersion = { version_major: '23', version_minor: '1' }

/** What Galaxy answers. Set per test so one mock covers success and outage. */
let resolveVersion: () => Effect.Effect<unknown, unknown> = () => Effect.succeed(mockVersion)

// Mock blendtype. `getVersionEffect` is a value rather than a function, so it
// is a suspended effect here to stay variable per test, and
// `toGalaxyServiceUnavailable` is the identity so the real `.pipe` chain runs.
vi.mock('blendtype', async () => ({
  // The real tag, not a stand-in: `evlog-effect` builds a Layer keyed on it.
  BlendTypeLogger: (await vi.importActual<typeof import('blendtype')>('blendtype')).BlendTypeLogger,
  getVersionEffect: Effect.suspend(() => resolveVersion()),
  toGalaxyServiceUnavailable: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  makeGalaxyLayer: vi.fn(() => Layer.empty),
}))

// Mock the galaxy utility
vi.mock('../../../../src/runtime/server/utils/galaxy', () => ({
  useGalaxyLayer: vi.fn(() => Layer.empty),
}))

async function callHandler() {
  const handler = (await import('../../../../src/runtime/server/api/galaxy/instance.get')).default
  return handler({} as any)
}

describe('gET /api/galaxy/instance', () => {
  beforeEach(() => {
    resolveVersion = () => Effect.succeed(mockVersion)
  })

  it('should return instance URL and version info', async () => {
    expect(await callHandler()).toEqual({
      url: 'https://galaxy.example.com',
      version_major: '23',
      version_minor: '1',
    })
  })

  it('answers 503 rather than 500 when Galaxy is unavailable', async () => {
    resolveVersion = () => Effect.fail({
      _tag: 'GalaxyServiceUnavailable',
      message: 'Galaxy is unavailable',
    })

    await expect(callHandler()).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Galaxy is unavailable',
    })
  })
})
