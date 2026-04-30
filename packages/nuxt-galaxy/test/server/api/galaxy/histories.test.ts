import { Context, Effect, Layer } from 'effect'
import { describe, expect, it, vi } from 'vitest'

const mockGalaxyHistories = [
  { id: 'galaxy-h-1', name: 'History 1', state: 'ok' },
  { id: 'galaxy-h-2', name: 'History 2', state: 'ok' },
]

// Define mock service classes at top-level (before vi.mock hoisting)
class MockServerSupabaseClient extends Context.Tag('@nuxt-galaxy/ServerSupabaseClient')<MockServerSupabaseClient, any>() {
  static readonly Live = Layer.succeed(MockServerSupabaseClient, (_event: any) => {
    return Effect.succeed({
      schema: () => ({
        from: () => ({
          select: () => Promise.resolve({
            data: [
              { galaxy_id: 'galaxy-h-1' },
              { galaxy_id: 'galaxy-h-2' },
            ],
            error: null,
          }),
        }),
      }),
    })
  })
}

// Mock blendtype
vi.mock('blendtype', () => ({
  getHistoryEffect: vi.fn((galaxyId: string) => {
    const histories: Record<string, unknown> = {
      'galaxy-h-1': { id: 'galaxy-h-1', name: 'History 1', state: 'ok' },
      'galaxy-h-2': { id: 'galaxy-h-2', name: 'History 2', state: 'ok' },
    }
    return Effect.succeed(histories[galaxyId])
  }),
  toGalaxyServiceUnavailable: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  makeGalaxyLayer: vi.fn(() => ({})),
}))

// Mock galaxy utility
vi.mock('../../../../src/runtime/server/utils/galaxy', () => ({
  useGalaxyLayer: vi.fn(() => Layer.empty),
}))

// Mock supabase
vi.mock('../../../../src/runtime/server/utils/grizzle/supabase', () => ({
  ServerSupabaseClient: MockServerSupabaseClient,
}))

describe('get /api/galaxy/histories', () => {
  it('should fetch histories from Supabase and resolve each from Galaxy', async () => {
    const handler = (await import('../../../../src/runtime/server/api/galaxy/histories.get')).default

    const mockEvent = {
      node: { req: {}, res: {} },
      context: {},
    }

    const result = await handler(mockEvent as any)

    expect(result).toEqual(mockGalaxyHistories)
  })
})
