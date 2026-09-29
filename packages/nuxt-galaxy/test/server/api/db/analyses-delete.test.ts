import { Context, Effect, Layer } from 'effect'
import { useLogger } from 'evlog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRequestLogger } from '../../setup'

const mockSupabaseUser = {
  id: 'owner-uuid-1',
  email: 'user@example.com',
}

const mockDeleteResult = [{ id: 1 }]

class GetSupabaseUserError extends Error {
  readonly _tag = 'GetSupabaseUserError'
  constructor(opts: { message: string }) {
    super(opts.message)
  }
}

class GalaxyServiceUnavailable extends Error {
  readonly _tag = 'GalaxyServiceUnavailable'
  constructor(opts: { message: string }) {
    super(opts.message)
  }
}

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
vi.mock('blendtype', async () => ({
  // The real tag, not a stand-in: `evlog-effect` builds a Layer keyed on it.
  BlendTypeLogger: (await vi.importActual<typeof import('blendtype')>('blendtype')).BlendTypeLogger,
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
  GetSupabaseUserError,
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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('delete /api/db/analyses/:analysisId', () => {
  it('should delete an analysis and return the result', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    const handler = (await import('../../../../src/runtime/server/api/db/analyses/[analysisId].delete')).default

    const result = await handler({ path: '/api/db/analyses/1', method: 'DELETE' } as any)

    expect(result).toEqual(mockDeleteResult)
    expect(useLogger).toHaveBeenCalledWith(expect.anything())
    expect(requestLog.set).toHaveBeenCalledWith({ handler: '/api/db/analyses/1', method: 'DELETE' })
  })

  // `analysisId` is the final segment, so an empty one never matches the
  // route. A non-numeric one does, and used to reach `deleteAnalysis(NaN, …)`
  // and put the `NaN` in front of the database.
  it('refuses an analysisId that is not a number, before doing any work', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    const h3 = await import('h3')
    const getRouterParamSpy = h3.getRouterParam as ReturnType<typeof vi.fn>
    getRouterParamSpy.mockReturnValue('abc')

    const analyses = await import('../../../../src/runtime/server/utils/grizzle/analyses')
    const handler = (await import('../../../../src/runtime/server/api/db/analyses/[analysisId].delete')).default

    await expect(handler({} as any)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Analysis not found',
    })
    expect(analyses.deleteAnalysis).not.toHaveBeenCalled()
    expect(useLogger).not.toHaveBeenCalled()

    // Restore
    getRouterParamSpy.mockImplementation((_event: unknown, param: string) => {
      if (param === 'analysisId')
        return '1'
      return undefined
    })
  })

  it('should reject unauthenticated users with 401', async () => {
    const supabaseMock = await import('../../../../src/runtime/server/utils/grizzle/supabase')
    const getSupabaseUserSpy = supabaseMock.getSupabaseUser as ReturnType<typeof vi.fn>
    getSupabaseUserSpy.mockReturnValueOnce(Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' })))

    const handler = (await import('../../../../src/runtime/server/api/db/analyses/[analysisId].delete')).default

    await expect(handler({} as any)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })

    // Restore
    getSupabaseUserSpy.mockReturnValue(Effect.succeed(mockSupabaseUser))
  })

  it('refuses a request whose user lookup succeeds with no user', async () => {
    // #7: `getSupabaseUser` returns `authUser.user`, which Supabase types as
    // `User | null`, so "no user" arrives as a *success* carrying null rather
    // than as a failure. The handler used to branch on `if (supabaseUser?.id)`
    // with no else and fall off the end, which resolved this destructive
    // endpoint successfully without deleting or refusing anything.
    const supabaseMock = await import('../../../../src/runtime/server/utils/grizzle/supabase')
    const getSupabaseUserSpy = supabaseMock.getSupabaseUser as ReturnType<typeof vi.fn>
    getSupabaseUserSpy.mockReturnValueOnce(Effect.succeed(null))

    const analysesMock = await import('../../../../src/runtime/server/utils/grizzle/analyses')
    const deleteAnalysisSpy = analysesMock.deleteAnalysis as ReturnType<typeof vi.fn>

    const handler = (await import('../../../../src/runtime/server/api/db/analyses/[analysisId].delete')).default

    await expect(handler({} as any)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
    expect(deleteAnalysisSpy).not.toHaveBeenCalled()

    // Restore
    getSupabaseUserSpy.mockReturnValue(Effect.succeed(mockSupabaseUser))
  })

  it('refuses a request whose user has an empty id', async () => {
    // the other half of #7's "null or has no id"
    const supabaseMock = await import('../../../../src/runtime/server/utils/grizzle/supabase')
    const getSupabaseUserSpy = supabaseMock.getSupabaseUser as ReturnType<typeof vi.fn>
    getSupabaseUserSpy.mockReturnValueOnce(Effect.succeed({ id: '', email: 'nobody@example.com' }))

    const analysesMock = await import('../../../../src/runtime/server/utils/grizzle/analyses')
    const deleteAnalysisSpy = analysesMock.deleteAnalysis as ReturnType<typeof vi.fn>

    const handler = (await import('../../../../src/runtime/server/api/db/analyses/[analysisId].delete')).default

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 401 })
    expect(deleteAnalysisSpy).not.toHaveBeenCalled()

    // Restore
    getSupabaseUserSpy.mockReturnValue(Effect.succeed(mockSupabaseUser))
  })

  it('answers 503 when Galaxy is unavailable, as its siblings do', async () => {
    // this handler pipes `toGalaxyServiceUnavailable`, so Galaxy being down is
    // a live outcome here — it used to arrive as a 500 because the fold had no
    // branch for the tag
    const analysesMock = await import('../../../../src/runtime/server/utils/grizzle/analyses')
    const deleteAnalysisSpy = analysesMock.deleteAnalysis as ReturnType<typeof vi.fn>
    deleteAnalysisSpy.mockReturnValueOnce(
      Effect.fail(new GalaxyServiceUnavailable({ message: 'Galaxy service is unavailable' })),
    )

    const handler = (await import('../../../../src/runtime/server/api/db/analyses/[analysisId].delete')).default

    await expect(handler({ path: '/api/db/analyses/1', method: 'DELETE' } as any)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Galaxy service is unavailable',
    })

    // Restore
    deleteAnalysisSpy.mockReturnValue(Effect.succeed(mockDeleteResult))
  })

  it('should log cause and return 500 on unexpected errors', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    const analysesMock = await import('../../../../src/runtime/server/utils/grizzle/analyses')
    const deleteAnalysisSpy = analysesMock.deleteAnalysis as ReturnType<typeof vi.fn>
    deleteAnalysisSpy.mockReturnValueOnce(Effect.fail(new Error('db connection lost')))

    const handler = (await import('../../../../src/runtime/server/api/db/analyses/[analysisId].delete')).default

    await expect(handler({ path: '/api/db/analyses/1', method: 'DELETE' } as any)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    })
    expect(requestLog.error).toHaveBeenCalledWith('delete analysis handler failed', expect.objectContaining({ cause: expect.stringContaining('db connection lost') }))

    // Restore
    deleteAnalysisSpy.mockReturnValue(Effect.succeed(mockDeleteResult))
  })
})
