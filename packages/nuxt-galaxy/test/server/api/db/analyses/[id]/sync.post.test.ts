import { Context, Effect, Layer } from 'effect'
import { useLogger } from 'evlog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRequestLogger } from '../../../../setup'

const mockSupabaseUser = {
  id: 'owner-uuid-1',
  email: 'user@example.com',
}

function createMockEvent() {
  return {
    path: '/api/db/analyses/1/sync',
    method: 'POST',
    node: { res: {} },
  } as any
}

let singleReturnValue: { data: { id: number, owner_id: string } | null, error: { message: string } | null } = {
  data: { id: 1, owner_id: 'owner-uuid-1' },
  error: null,
}

const mockSupabaseClient = {
  schema: vi.fn(() => mockSupabaseClient),
  from: vi.fn(() => mockSupabaseClient),
  select: vi.fn(() => mockSupabaseClient),
  eq: vi.fn(() => mockSupabaseClient),
  single: vi.fn(() => Promise.resolve(singleReturnValue)),
}

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

class ForbiddenError extends Error {
  readonly _tag = 'ForbiddenError'
  constructor(opts: { message: string }) {
    super(opts.message)
  }
}

// Define mock service classes at top-level (before vi.mock hoisting)
class MockDrizzle extends Context.Tag('@nuxt-galaxy/Drizzle')<MockDrizzle, any>() {
  static readonly Live = Layer.succeed(MockDrizzle, {})
}

class MockServerSupabaseClient extends Context.Tag('@nuxt-galaxy/ServerSupabaseClient')<MockServerSupabaseClient, any>() {
  static readonly Live = Layer.succeed(MockServerSupabaseClient, () => Effect.succeed(mockSupabaseClient))
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
vi.mock('../../../../../../src/runtime/server/utils/galaxy', () => ({
  useGalaxyLayer: vi.fn(() => Layer.empty),
}))

// Mock drizzle
vi.mock('../../../../../../src/runtime/server/utils/drizzle', () => ({
  Drizzle: MockDrizzle,
}))

// Mock supabase
vi.mock('../../../../../../src/runtime/server/utils/grizzle/supabase', () => ({
  ServerSupabaseClient: MockServerSupabaseClient,
  ServerSupabaseClaims: MockServerSupabaseClaims,
  getSupabaseUser: vi.fn(() => Effect.succeed(mockSupabaseUser)),
  GetSupabaseUserError,
  ForbiddenError,
}))

// Mock Nitro runTask
vi.mock('nitropack/runtime/task', () => ({
  runTask: vi.fn(() => Promise.resolve({ result: { synced: 1, failed: 0, skipped: 0, errors: [] } })),
}))

// Mock h3
vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    getRouterParam: vi.fn((_event: unknown, param: string) => {
      if (param === 'id' || param === 'analysisId')
        return '1'
      return undefined
    }),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  singleReturnValue = {
    data: { id: 1, owner_id: 'owner-uuid-1' },
    error: null,
  }
})

describe('post /api/db/analyses/:id/sync', () => {
  it('returns 202 queued for owner', async () => {
    const { runTask } = await import('nitropack/runtime/task')
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/[id]/sync.post')).default
    const result = await handler(createMockEvent())

    expect(result).toEqual({ analysisId: 1, status: 'queued', task: 'galaxy:sync-analyses' })
    expect(runTask).toHaveBeenCalledTimes(1)
    expect(runTask).toHaveBeenCalledWith('galaxy:sync-analyses', { payload: { analysisId: 1 } })
    expect(requestLog.info).toHaveBeenCalledWith(expect.stringContaining('sync queued'), expect.objectContaining({ analysisId: 1, userId: 'owner-uuid-1' }))
  })

  it('returns 404 when analysis is missing', async () => {
    singleReturnValue = { data: null, error: { message: 'Analysis not found' } }

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/[id]/sync.post')).default

    await expect(handler(createMockEvent())).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Analysis not found',
    })
  })

  it('returns 403 when caller is not the owner', async () => {
    singleReturnValue = { data: { id: 1, owner_id: 'other-owner' }, error: null }

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/[id]/sync.post')).default

    await expect(handler(createMockEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Forbidden',
    })
  })

  it('returns 404 when route id is not numeric', async () => {
    const h3 = await import('h3')
    vi.mocked(h3.getRouterParam).mockReturnValueOnce('abc')

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/[id]/sync.post')).default

    await expect(handler(createMockEvent())).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Analysis not found',
    })
  })

  it('returns 401 when user is unauthenticated', async () => {
    const supabaseMock = await import('../../../../../../src/runtime/server/utils/grizzle/supabase')
    const getSupabaseUserSpy = supabaseMock.getSupabaseUser as ReturnType<typeof vi.fn>
    getSupabaseUserSpy.mockReturnValueOnce(Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' })))

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/[id]/sync.post')).default

    await expect(handler(createMockEvent())).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })

    // Restore
    getSupabaseUserSpy.mockReturnValue(Effect.succeed(mockSupabaseUser))
  })

  it('answers 503 when Galaxy is unavailable, as its siblings do', async () => {
    // this handler pipes `toGalaxyServiceUnavailable`, so Galaxy being down is
    // a live outcome here — it used to arrive as a 500 because the fold had no
    // branch for the tag
    const supabaseMock = await import('../../../../../../src/runtime/server/utils/grizzle/supabase')
    const getSupabaseUserSpy = supabaseMock.getSupabaseUser as ReturnType<typeof vi.fn>
    getSupabaseUserSpy.mockReturnValueOnce(
      Effect.fail(new GalaxyServiceUnavailable({ message: 'Galaxy service is unavailable' })),
    )

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/[id]/sync.post')).default

    await expect(handler(createMockEvent())).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Galaxy service is unavailable',
    })

    // Restore
    getSupabaseUserSpy.mockReturnValue(Effect.succeed(mockSupabaseUser))
  })

  it('still records which analysis it was when it answers 500', async () => {
    // this fold logs more than the others do; sharing the tail must not cost
    // it the one field that says which analysis failed
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    const supabaseMock = await import('../../../../../../src/runtime/server/utils/grizzle/supabase')
    const getSupabaseUserSpy = supabaseMock.getSupabaseUser as ReturnType<typeof vi.fn>
    getSupabaseUserSpy.mockReturnValueOnce(Effect.fail(new Error('db connection lost')))

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/[id]/sync.post')).default

    await expect(handler(createMockEvent())).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    })
    expect(requestLog.error).toHaveBeenCalledWith(
      'sync analysis handler failed',
      expect.objectContaining({ analysisId: 1 }),
    )

    // Restore
    getSupabaseUserSpy.mockReturnValue(Effect.succeed(mockSupabaseUser))
  })

  it('enqueues runTask each time the handler is called', async () => {
    const { runTask } = await import('nitropack/runtime/task')
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/[id]/sync.post')).default

    await handler(createMockEvent())
    await handler(createMockEvent())

    expect(runTask).toHaveBeenCalledTimes(2)
    expect(runTask).toHaveBeenNthCalledWith(1, 'galaxy:sync-analyses', { payload: { analysisId: 1 } })
    expect(runTask).toHaveBeenNthCalledWith(2, 'galaxy:sync-analyses', { payload: { analysisId: 1 } })
  })
})
