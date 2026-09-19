import type { H3Event } from 'h3'
import { Context, Effect, Layer } from 'effect'
import { useLogger } from 'evlog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRequestLogger } from '../../../setup'

class GetSupabaseUserError extends Error {
  readonly _tag = 'GetSupabaseUserError'
  constructor(opts: { message: string }) {
    super(opts.message)
  }
}

class GetAnalysisMonitoringStatsError extends Error {
  readonly _tag = 'GetAnalysisMonitoringStatsError'
  constructor(opts: { message: string }) {
    super(opts.message)
  }
}

// API-01: the self endpoint now returns the full AnalysisMonitoringStats composite
// (base counts + successRate + perWorkflow + trend), not just counts.
const SELF_STATS = {
  total: 5,
  success: 3,
  error: 1,
  cancelled: 0,
  pending: 1,
  successRate: 3 / 4,
  perWorkflow: [
    { workflowId: 1, name: 'Workflow A', version: '1.0', total: 5, success: 3, error: 1, cancelled: 0, pending: 1, successRate: 3 / 4 },
  ],
  trend: [
    { bucket: '2026-08-10', total: 5, success: 3, error: 1, cancelled: 0, pending: 1, successRate: 3 / 4 },
  ],
}

const mockGetSupabaseUser = vi.fn<(event: H3Event) => Effect.Effect<{ id?: string } | null, GetSupabaseUserError, never>>(
  () => Effect.succeed({ id: 'user-id' }),
)

const mockGetAnalysisMonitoringStats = vi.fn((_ownerId: string, _filters?: unknown) => Effect.succeed(SELF_STATS))

const mockDrizzle = {
  select: vi.fn(),
}

class MockDrizzle extends Context.Tag('@nuxt-galaxy/Drizzle')<MockDrizzle, typeof mockDrizzle>() {
  static readonly Live = Layer.succeed(MockDrizzle, mockDrizzle)
}

class MockServerSupabaseClient extends Context.Tag('@nuxt-galaxy/ServerSupabaseClient')<MockServerSupabaseClient, unknown>() {
  static readonly Live = Layer.succeed(MockServerSupabaseClient, () => Effect.succeed({}))
}

vi.mock('../../../../../src/runtime/server/utils/drizzle.js', () => ({
  Drizzle: MockDrizzle,
}))

// Self endpoint has NO role gate: the mock exports only what the handler imports
// (no requireRole / ForbiddenError).
vi.mock('../../../../../src/runtime/server/utils/grizzle/supabase.js', () => ({
  ServerSupabaseClient: MockServerSupabaseClient,
  getSupabaseUser: mockGetSupabaseUser,
  GetSupabaseUserError,
}))

vi.mock('../../../../../src/runtime/server/utils/grizzle/analysisMonitoring.js', () => ({
  getAnalysisMonitoringStats: mockGetAnalysisMonitoringStats,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('get /api/db/analyses/monitoring', () => {
  it('should return the full AnalysisMonitoringStats composite scoped to the session user', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)
    mockGetSupabaseUser.mockReturnValueOnce(Effect.succeed({ id: 'session-owner-id' }))

    const handler = (await import('../../../../../src/runtime/server/api/db/analyses/monitoring.get')).default
    const result = await handler({ path: '/api/db/analyses/monitoring', method: 'GET' } as H3Event)

    // API-01: full composite shape (counts + successRate + perWorkflow + trend)
    expect(result).toEqual(SELF_STATS)
    expect(result).toMatchObject({
      total: 5,
      success: 3,
      error: 1,
      cancelled: 0,
      pending: 1,
      successRate: 3 / 4,
    })
    expect(result.perWorkflow).toHaveLength(1)
    expect(result.trend).toHaveLength(1)

    // API-03: ownerId is derived from the server-side session user id, never client input.
    expect(mockGetAnalysisMonitoringStats).toHaveBeenCalledTimes(1)
    expect(mockGetAnalysisMonitoringStats).toHaveBeenCalledWith('session-owner-id', {}, 'day')

    expect(useLogger).toHaveBeenCalledWith(expect.anything())
    expect(requestLog.set).toHaveBeenCalledWith({ handler: '/api/db/analyses/monitoring', method: 'GET' })
  })

  it('should reject unauthenticated users with 401', async () => {
    mockGetSupabaseUser.mockReturnValueOnce(Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' })))

    const handler = (await import('../../../../../src/runtime/server/api/db/analyses/monitoring.get')).default

    await expect(handler({} as H3Event)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  })

  it('should reject null users with 401', async () => {
    mockGetSupabaseUser.mockReturnValueOnce(Effect.succeed(null))

    const handler = (await import('../../../../../src/runtime/server/api/db/analyses/monitoring.get')).default

    await expect(handler({} as H3Event)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  })

  it('should reject users missing an id with 401', async () => {
    mockGetSupabaseUser.mockReturnValueOnce(Effect.succeed({}))

    const handler = (await import('../../../../../src/runtime/server/api/db/analyses/monitoring.get')).default

    await expect(handler({} as H3Event)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  })

  it('should log cause and fail with 500 when the monitoring stats query fails', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    mockGetAnalysisMonitoringStats.mockReturnValueOnce(Effect.fail(new GetAnalysisMonitoringStatsError({ message: 'DB down' })))
    mockGetSupabaseUser.mockReturnValueOnce(Effect.succeed({ id: 'user-id' }))

    const handler = (await import('../../../../../src/runtime/server/api/db/analyses/monitoring.get')).default

    await expect(handler({ path: '/api/db/analyses/monitoring', method: 'GET' } as H3Event)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    })
    expect(requestLog.error).toHaveBeenCalledWith('analysis monitoring handler failed', expect.objectContaining({ cause: expect.stringContaining('DB down') }))
  })
})

describe('get /api/db/analyses/monitoring, over a range', () => {
  it('hands the requested range down to the query, the last day included whole', async () => {
    vi.mocked(useLogger).mockReturnValue(createMockRequestLogger())
    mockGetSupabaseUser.mockReturnValueOnce(Effect.succeed({ id: 'session-owner-id' }))

    const handler = (await import('../../../../../src/runtime/server/api/db/analyses/monitoring.get')).default
    await handler({ path: '/api/db/analyses/monitoring?from=2026-08-01&to=2026-08-31', method: 'GET' } as H3Event)

    expect(mockGetAnalysisMonitoringStats).toHaveBeenCalledWith('session-owner-id', {
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-09-01T00:00:00.000Z'),
    }, 'day')
  })

  it('asks for all time when no range is given', async () => {
    vi.mocked(useLogger).mockReturnValue(createMockRequestLogger())
    mockGetSupabaseUser.mockReturnValueOnce(Effect.succeed({ id: 'session-owner-id' }))

    const handler = (await import('../../../../../src/runtime/server/api/db/analyses/monitoring.get')).default
    await handler({ path: '/api/db/analyses/monitoring', method: 'GET' } as H3Event)

    expect(mockGetAnalysisMonitoringStats).toHaveBeenCalledWith('session-owner-id', {}, 'day')
  })

  it.each([
    ['malformed', '?from=yesterday'],
    ['reversed', '?from=2026-09-02&to=2026-09-01'],
  ])('rejects a %s range with 400 and asks the database for nothing', async (_label, query) => {
    const handler = (await import('../../../../../src/runtime/server/api/db/analyses/monitoring.get')).default

    await expect(handler({ path: `/api/db/analyses/monitoring${query}`, method: 'GET' } as H3Event))
      .rejects
      .toMatchObject({ statusCode: 400 })
    expect(mockGetAnalysisMonitoringStats).not.toHaveBeenCalled()
  })
})

describe('get /api/db/analyses/monitoring, at a granularity', () => {
  it.each(['day', 'week', 'month'] as const)('buckets by %s when asked to', async (granularity) => {
    vi.mocked(useLogger).mockReturnValue(createMockRequestLogger())
    mockGetSupabaseUser.mockReturnValueOnce(Effect.succeed({ id: 'session-owner-id' }))

    const handler = (await import('../../../../../src/runtime/server/api/db/analyses/monitoring.get')).default
    await handler({ path: `/api/db/analyses/monitoring?granularity=${granularity}`, method: 'GET' } as H3Event)

    expect(mockGetAnalysisMonitoringStats).toHaveBeenCalledWith('session-owner-id', {}, granularity)
  })

  it('buckets by day when no granularity is given', async () => {
    vi.mocked(useLogger).mockReturnValue(createMockRequestLogger())
    mockGetSupabaseUser.mockReturnValueOnce(Effect.succeed({ id: 'session-owner-id' }))

    const handler = (await import('../../../../../src/runtime/server/api/db/analyses/monitoring.get')).default
    await handler({ path: '/api/db/analyses/monitoring?from=2026-08-01', method: 'GET' } as H3Event)

    expect(mockGetAnalysisMonitoringStats).toHaveBeenCalledWith(
      'session-owner-id',
      { from: new Date('2026-08-01T00:00:00.000Z') },
      'day',
    )
  })

  it('rejects an unknown granularity with 400 and asks the database for nothing', async () => {
    vi.mocked(useLogger).mockReturnValue(createMockRequestLogger())

    const handler = (await import('../../../../../src/runtime/server/api/db/analyses/monitoring.get')).default

    await expect(handler({ path: '/api/db/analyses/monitoring?granularity=hour', method: 'GET' } as H3Event))
      .rejects
      .toMatchObject({ statusCode: 400 })
    expect(mockGetAnalysisMonitoringStats).not.toHaveBeenCalled()
  })

  it('says why a request was refused, so the wide event carries more than a 400', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    const handler = (await import('../../../../../src/runtime/server/api/db/analyses/monitoring.get')).default

    await expect(handler({ path: '/api/db/analyses/monitoring?granularity=hour', method: 'GET' } as H3Event))
      .rejects
      .toMatchObject({ statusCode: 400 })
    expect(requestLog.warn).toHaveBeenCalledWith(
      'usage statistics request rejected',
      { reason: expect.stringContaining('granularity') },
    )
  })
})
