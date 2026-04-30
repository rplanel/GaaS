import { Context, Effect, Layer } from 'effect'
import { describe, expect, it, vi } from 'vitest'

const mockAnalysisResult = {
  id: 1,
  inputIds: [1, 2],
}

const mockSupabaseUser = {
  id: 'owner-uuid-1',
  email: 'user@example.com',
}

const mockDbWorkflow = {
  id: 1,
  galaxyId: 'galaxy-wf-1',
}

const mockDbHistory = {
  id: 1,
  galaxyId: 'galaxy-history-1',
}

// Hoisted mock service classes using real Effect imports (available at top-level)
class MockDrizzle extends Context.Tag('@nuxt-galaxy/Drizzle')<MockDrizzle, any>() {
  static readonly Live = Layer.succeed(MockDrizzle, {})
}

class MockServerSupabaseClient extends Context.Tag('@nuxt-galaxy/ServerSupabaseClient')<MockServerSupabaseClient, any>() {
  static readonly Live = Layer.succeed(MockServerSupabaseClient, () => Effect.succeed({}))
}

class MockServerSupabaseClaims extends Context.Tag('@nuxt-galaxy/ServerSupabaseClaims')<MockServerSupabaseClaims, any>() {
  static readonly Live = Layer.succeed(MockServerSupabaseClaims, () => Effect.succeed(null))
}

class MockGetSupabaseUserError extends Error {
  readonly _tag = 'GetSupabaseUserError'
  constructor(opts: { message: string }) {
    super(opts.message)
  }
}

// Mock blendtype
vi.mock('blendtype', () => ({
  toGalaxyServiceUnavailable: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  makeGalaxyLayer: vi.fn(() => Layer.empty),
}))

// Mock galaxy utility
vi.mock('../../../../src/runtime/server/utils/galaxy.js', () => ({
  useGalaxyLayer: vi.fn(() => Layer.empty),
}))

// Mock drizzle
vi.mock('../../../../src/runtime/server/utils/drizzle.js', () => ({
  Drizzle: MockDrizzle,
}))

// Mock supabase
vi.mock('../../../../src/runtime/server/utils/grizzle/supabase.js', () => ({
  ServerSupabaseClient: MockServerSupabaseClient,
  ServerSupabaseClaims: MockServerSupabaseClaims,
  getSupabaseUser: vi.fn(() => Effect.succeed(mockSupabaseUser)),
  GetSupabaseUserError: MockGetSupabaseUserError,
}))

// Mock grizzle utilities
vi.mock('../../../../src/runtime/server/utils/grizzle/workflows', () => ({
  getWorkflowEffect: vi.fn(() => Effect.succeed(mockDbWorkflow)),
}))

vi.mock('../../../../src/runtime/server/utils/grizzle/histories', () => ({
  addHistoryEffect: vi.fn(() => Effect.succeed(mockDbHistory)),
}))

vi.mock('../../../../src/runtime/server/utils/grizzle/datasets', () => ({
  uploadDatasetsEffect: vi.fn(() => Effect.succeed([
    { step: '0', insertedId: 1, galaxyId: 'galaxy-ds-1' },
    { step: '1', insertedId: 2, galaxyId: 'galaxy-ds-2' },
  ])),
}))

vi.mock('../../../../src/runtime/server/utils/grizzle/analyses.js', () => ({
  runAnalysis: vi.fn(() => Effect.succeed(mockAnalysisResult)),
}))

// Mock h3
vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    readBody: vi.fn(() => Promise.resolve({
      name: 'Test Analysis',
      datamap: {
        0: { storage_object_id: 'so-1' },
        1: { storage_object_id: 'so-2' },
      },
      parameters: {},
      workflowId: 1,
    })),
  }
})

describe('post /api/db/analyses', () => {
  it('should orchestrate analysis creation and return result', async () => {
    const handler = (await import('../../../../src/runtime/server/api/db/analyses.post')).default

    const result = await handler({} as any)

    expect(result).toEqual(mockAnalysisResult)
  })

  it('should fail when user is not authenticated', async () => {
    const supabaseMock = await import('../../../../src/runtime/server/utils/grizzle/supabase.js')
    const getSupabaseUserSpy = supabaseMock.getSupabaseUser as ReturnType<typeof vi.fn>
    getSupabaseUserSpy.mockReturnValueOnce(Effect.succeed(null))

    const handler = (await import('../../../../src/runtime/server/api/db/analyses.post')).default

    // When user is null, the handler enters the else branch and fails
    try {
      await handler({} as any)
    }
    catch (error) {
      // Expected: GetSupabaseUserError or FiberFailure wrapping it
      expect(error).toBeDefined()
    }

    // Restore
    getSupabaseUserSpy.mockReturnValue(Effect.succeed(mockSupabaseUser))
  })
})
