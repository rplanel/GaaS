import { Context, Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

/** The query string of the request under test; `{}` is a request with none. */
const mocks = vi.hoisted(() => ({
  getQuery: vi.fn((): Record<string, unknown> => ({})),
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
    getQuery: mocks.getQuery,
  }
})

describe('get /api/galaxy/workflows/:workflowId', () => {
  beforeEach(() => {
    mocks.getQuery.mockReturnValue({})
  })

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
    expect(result.error?.message).toBeDefined()
    expect(result.data).toBeUndefined()
  })

  // #48. Galaxy answers `GET /api/workflows/{id}` with the latest revision
  // unless `version` names one, and the form built its inputs from this
  // proxy while the server compared the datamap against, and now invokes,
  // the activated revision. The proxy forwards the one it is asked for.
  describe('the revision the caller asks for', () => {
    it('forwards a revision index to Galaxy', async () => {
      mocks.getQuery.mockReturnValue({ version: '3' })
      const bt = await import('blendtype')
      const getWorkflowEffectSpy = bt.getWorkflowEffect as ReturnType<typeof vi.fn>
      getWorkflowEffectSpy.mockReturnValue(Effect.succeed(mockWorkflow))

      const handler = (await import('../../../../src/runtime/server/api/galaxy/workflows/[workflowId].get')).default
      const result = await handler({} as any)

      expect(getWorkflowEffectSpy).toHaveBeenLastCalledWith('galaxy-workflow-1', 3)
      expect(result.data).toEqual(mockWorkflow)
    })

    it('asks for the latest when no revision is named, as before', async () => {
      const bt = await import('blendtype')
      const getWorkflowEffectSpy = bt.getWorkflowEffect as ReturnType<typeof vi.fn>
      getWorkflowEffectSpy.mockReturnValue(Effect.succeed(mockWorkflow))

      const handler = (await import('../../../../src/runtime/server/api/galaxy/workflows/[workflowId].get')).default
      await handler({} as any)

      expect(getWorkflowEffectSpy).toHaveBeenLastCalledWith('galaxy-workflow-1', undefined)
    })

    // Galaxy's `get_internal_version` indexes a list, so anything but a
    // non-negative integer is refused here rather than handed to Galaxy to
    // answer for; the form only ever sends the row's `revision`, so a
    // caller reaching this has a bug worth being told about.
    it.each([
      ['a word', 'abc'],
      ['a negative index', '-1'],
      ['a fraction', '1.5'],
    ])('refuses %s with 400 before asking Galaxy', async (_label, version) => {
      mocks.getQuery.mockReturnValue({ version })
      const bt = await import('blendtype')
      const getWorkflowEffectSpy = bt.getWorkflowEffect as ReturnType<typeof vi.fn>
      getWorkflowEffectSpy.mockClear()

      const handler = (await import('../../../../src/runtime/server/api/galaxy/workflows/[workflowId].get')).default

      await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 400 })
      expect(getWorkflowEffectSpy).not.toHaveBeenCalled()
    })
  })
})
