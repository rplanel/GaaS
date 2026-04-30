import { Context, Effect, Layer } from 'effect'
import { describe, expect, it, vi } from 'vitest'

const mockWorkflow = {
  id: 'galaxy-workflow-1',
  name: 'Test Workflow',
  steps: {},
}

// Define mock service classes at top-level (before vi.mock hoisting)
class MockGalaxyServiceUnavailable extends Error {
  readonly _tag = 'GalaxyServiceUnavailable'
  constructor(opts: { message: string }) {
    super(opts.message)
  }
}

class MockHttpError extends Error {
  readonly _tag = 'HttpError'
  constructor(opts: { message: string }) {
    super(opts.message)
  }
}

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
  getWorkflowEffect: vi.fn(),
  toGalaxyServiceUnavailable: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  GalaxyServiceUnavailable: MockGalaxyServiceUnavailable,
  HttpError: MockHttpError,
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

// Mock h3
vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    getRouterParam: vi.fn((_event: unknown, param: string) => {
      if (param === 'workflowId')
        return 'galaxy-workflow-1'
      return undefined
    }),
  }
})

describe('get /api/galaxy/workflows/:workflowId', () => {
  it('should return { data, error: undefined } on success', async () => {
    const bt = await import('blendtype')
    const getWorkflowEffectSpy = bt.getWorkflowEffect as ReturnType<typeof vi.fn>
    getWorkflowEffectSpy.mockReturnValue(Effect.succeed(mockWorkflow))

    const handler = (await import('../../../../src/runtime/server/api/galaxy/workflows/[workflowId].get')).default
    const result = await handler({} as any)

    expect(result).toEqual({
      error: undefined,
      data: mockWorkflow,
    })
  })

  it('should return error object when workflowId is missing', async () => {
    const h3 = await import('h3')
    const getRouterParamSpy = h3.getRouterParam as ReturnType<typeof vi.fn>
    getRouterParamSpy.mockReturnValue(undefined)

    const handler = (await import('../../../../src/runtime/server/api/galaxy/workflows/[workflowId].get')).default
    const result = await handler({} as any)

    expect(result.error).toBeDefined()
    expect(result.data).toBeUndefined()

    // Restore
    getRouterParamSpy.mockImplementation((_event: unknown, param: string) => {
      if (param === 'workflowId')
        return 'galaxy-workflow-1'
      return undefined
    })
  })

  it('should return error with message when Effect fails with generic error', async () => {
    const bt = await import('blendtype')
    const getWorkflowEffectSpy = bt.getWorkflowEffect as ReturnType<typeof vi.fn>
    getWorkflowEffectSpy.mockReturnValue(Effect.fail(new Error('Something went wrong')))

    const handler = (await import('../../../../src/runtime/server/api/galaxy/workflows/[workflowId].get')).default
    const result = await handler({} as any)

    expect(result.error).toBeDefined()
    expect(result.error.message).toBeDefined()
    expect(result.data).toBeUndefined()
  })
})
