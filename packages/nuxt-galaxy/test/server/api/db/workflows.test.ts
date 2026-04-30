import { Context, Effect, Layer } from 'effect'
import { describe, expect, it, vi } from 'vitest'

const mockInsertedWorkflow = [{ id: 1, name: 'Test Workflow', galaxy_id: 'galaxy-wf-1' }]

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
}))

// Mock insertWorkflow
vi.mock('../../../../src/runtime/server/utils/grizzle/workflows', () => ({
  insertWorkflow: vi.fn(() => Effect.succeed(mockInsertedWorkflow)),
}))

// Mock h3
vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    readBody: vi.fn(() => Promise.resolve({
      galaxyId: 'galaxy-wf-1',
      userId: 1,
    })),
  }
})

describe('post /api/db/workflows', () => {
  it('should read body and insert workflow', async () => {
    const handler = (await import('../../../../src/runtime/server/api/db/workflows.post')).default

    const result = await handler({} as any)

    expect(result).toEqual(mockInsertedWorkflow)
  })
})
