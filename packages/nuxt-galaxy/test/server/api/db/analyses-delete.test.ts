import { Context, Effect, Layer } from 'effect'
import { describe, expect, it, vi } from 'vitest'

const mockSupabaseUser = {
  id: 'owner-uuid-1',
  email: 'user@example.com',
}

const mockDeleteResult = [{ id: 1 }]

// Define mock service classes at top-level (before vi.mock hoisting)
class MockDrizzle extends Context.Tag('@nuxt-galaxy/Drizzle')<MockDrizzle, any>() {
  static readonly Live = Layer.succeed(MockDrizzle, {})
}

class MockServerSupabaseClient extends Context.Tag('@nuxt-galaxy/ServerSupabaseClient')<MockServerSupabaseClient, any>() {
  static readonly Live = Layer.succeed(MockServerSupabaseClient, () => Effect.succeed({}))
}

class MockServerSupabaseClaims extends Context.Tag('@nuxt-galaxy/ServerSupabaseClaims')<MockServerSupabaseClaims, any>() {
  static readonly Live = Layer.succeed(MockServerSupabaseClaims, () => Effect.succeed(null))
}

// Mock blendtype
vi.mock('blendtype', () => ({
  toGalaxyServiceUnavailable: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  makeGalaxyLayer: vi.fn(() => Layer.empty),
}))

// Mock galaxy utility
vi.mock('../../../../src/runtime/server/utils/galaxy', () => ({
  useGalaxyLayer: vi.fn(() => Layer.empty),
}))

// Mock drizzle
vi.mock('../../../../src/runtime/server/utils/drizzle', () => ({
  Drizzle: MockDrizzle,
}))

// Mock supabase
vi.mock('../../../../src/runtime/server/utils/grizzle/supabase', () => ({
  ServerSupabaseClient: MockServerSupabaseClient,
  ServerSupabaseClaims: MockServerSupabaseClaims,
  getSupabaseUser: vi.fn(() => Effect.succeed(mockSupabaseUser)),
}))

// Mock analyses
vi.mock('../../../../src/runtime/server/utils/grizzle/analyses', () => ({
  deleteAnalysis: vi.fn(() => Effect.succeed(mockDeleteResult)),
}))

// Mock h3
vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    getRouterParam: vi.fn((_event: unknown, param: string) => {
      if (param === 'analysisId')
        return '1'
      return undefined
    }),
  }
})

describe('delete /api/db/analyses/:analysisId', () => {
  it('should delete an analysis and return the result', async () => {
    const handler = (await import('../../../../src/runtime/server/api/db/analyses/[analysisId].delete')).default

    const result = await handler({} as any)

    expect(result).toEqual(mockDeleteResult)
  })

  it('should return undefined when analysisId is missing', async () => {
    const h3 = await import('h3')
    const getRouterParamSpy = h3.getRouterParam as ReturnType<typeof vi.fn>
    getRouterParamSpy.mockReturnValue(undefined)

    const handler = (await import('../../../../src/runtime/server/api/db/analyses/[analysisId].delete')).default
    const result = await handler({} as any)

    expect(result).toBeUndefined()

    // Restore
    getRouterParamSpy.mockImplementation((_event: unknown, param: string) => {
      if (param === 'analysisId')
        return '1'
      return undefined
    })
  })
})
