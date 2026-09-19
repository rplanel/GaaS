import type { H3Event } from 'h3'
import { Context, Effect, Layer } from 'effect'
import { useLogger } from 'evlog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRequestLogger } from '../../../../setup'

class GetSupabaseUserError extends Error {
  readonly _tag = 'GetSupabaseUserError'
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

class AdminRoleCheckError extends Error {
  readonly _tag = 'AdminRoleCheckError'
  constructor(opts: { message: string }) {
    super(opts.message)
  }
}

// API-02: the admin endpoint returns the full all-users AnalysisMonitoringStats
// composite (base counts + successRate + perWorkflow + trend), not just counts.
const ADMIN_STATS = {
  total: 12,
  success: 5,
  error: 4,
  cancelled: 2,
  pending: 1,
  successRate: 5 / 9,
  perWorkflow: [
    { workflowId: 1, name: 'Workflow A', version: '1.0', total: 5, success: 3, error: 2, cancelled: 0, pending: 0, successRate: 3 / 5 },
  ],
  trend: [
    { bucket: '2026-08-10', total: 5, success: 3, error: 2, cancelled: 0, pending: 0, successRate: 3 / 5 },
  ],
}

const mockGetSupabaseUser = vi.fn<(event: H3Event) => Effect.Effect<{ id?: string } | null, GetSupabaseUserError, never>>(
  () => Effect.succeed({ id: 'user-id' }),
)

// API-04: the admin gate is the shared requireRole(user, role) helper. Mock it so
// a role grant succeeds (Effect.void) and a non-admin match yields ForbiddenError.
const mockRequireRole = vi.fn<(user: { id: string }, role: string) => Effect.Effect<void, ForbiddenError | AdminRoleCheckError, never>>(
  () => Effect.void,
)

const mockGetAllAnalysisMonitoringStats = vi.fn((_filters?: unknown) => Effect.succeed(ADMIN_STATS))

const mockDrizzle = {
  select: vi.fn(),
}

class MockDrizzle extends Context.Tag('@nuxt-galaxy/Drizzle')<MockDrizzle, typeof mockDrizzle>() {
  static readonly Live = Layer.succeed(MockDrizzle, mockDrizzle)
}

class MockServerSupabaseClient extends Context.Tag('@nuxt-galaxy/ServerSupabaseClient')<MockServerSupabaseClient, any>() {
  static readonly Live = Layer.succeed(MockServerSupabaseClient, () => Effect.succeed({}))
}

vi.mock('../../../../../../src/runtime/server/utils/drizzle.js', () => ({
  Drizzle: MockDrizzle,
}))

vi.mock('../../../../../../src/runtime/server/utils/grizzle/supabase.js', () => ({
  ServerSupabaseClient: MockServerSupabaseClient,
  getSupabaseUser: mockGetSupabaseUser,
  requireRole: mockRequireRole,
  GetSupabaseUserError,
  ForbiddenError,
  AdminRoleCheckError,
}))

vi.mock('../../../../../../src/runtime/server/utils/grizzle/analysisMonitoring.js', () => ({
  getAllAnalysisMonitoringStats: mockGetAllAnalysisMonitoringStats,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('get /api/db/analyses/monitoring/admin', () => {
  it('should return the full all-users AnalysisMonitoringStats composite for admin users', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    mockGetSupabaseUser.mockReturnValueOnce(Effect.succeed({ id: 'user-id' }))

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/monitoring/admin.get')).default
    const result = await handler({ path: '/api/db/analyses/monitoring/admin', method: 'GET' } as any)

    // API-04: the admin gate is enforced via requireRole(user, 'admin') before stats.
    expect(mockRequireRole).toHaveBeenCalledTimes(1)
    expect(mockRequireRole).toHaveBeenCalledWith({ id: 'user-id' }, 'admin')

    // API-02: full composite shape (counts + successRate + perWorkflow + trend)
    expect(result).toEqual(ADMIN_STATS)
    expect(result).toMatchObject({
      total: 12,
      success: 5,
      error: 4,
      cancelled: 2,
      pending: 1,
      successRate: 5 / 9,
    })
    expect(result.perWorkflow).toHaveLength(1)
    expect(result.trend).toHaveLength(1)

    expect(useLogger).toHaveBeenCalledWith(expect.anything())
    expect(requestLog.set).toHaveBeenCalledWith({ handler: '/api/db/analyses/monitoring/admin', method: 'GET' })
  })

  it('should reject non-admin users with 403', async () => {
    mockRequireRole.mockReturnValueOnce(Effect.fail(new ForbiddenError({ message: 'Forbidden: admin role required' })))
    mockGetSupabaseUser.mockReturnValueOnce(Effect.succeed({ id: 'user-id' }))

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/monitoring/admin.get')).default

    await expect(handler({} as any)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Forbidden: admin role required',
    })
    expect(mockGetAllAnalysisMonitoringStats).not.toHaveBeenCalled()
  })

  it('should reject unauthenticated users with 401', async () => {
    mockGetSupabaseUser.mockReturnValueOnce(Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' })))

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/monitoring/admin.get')).default

    await expect(handler({} as any)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  })

  it('should reject unauthenticated users when user is null with 401', async () => {
    mockGetSupabaseUser.mockReturnValueOnce(Effect.succeed(null))

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/monitoring/admin.get')).default

    await expect(handler({} as any)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  })

  it('should reject users missing an id with 401', async () => {
    mockGetSupabaseUser.mockReturnValueOnce(Effect.succeed({}))

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/monitoring/admin.get')).default

    await expect(handler({} as any)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  })

  it('should log cause and fail with 500 when the admin role check query is rejected', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)

    // requireRole wraps the gate query in tryPromise -> AdminRoleCheckError on rejection -> 500.
    mockRequireRole.mockReturnValueOnce(Effect.fail(new AdminRoleCheckError({ message: 'Failed to verify admin role: connection lost' })))
    mockGetSupabaseUser.mockReturnValueOnce(Effect.succeed({ id: 'user-id' }))

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/monitoring/admin.get')).default

    await expect(handler({ path: '/api/db/analyses/monitoring/admin', method: 'GET' } as any)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    })
    expect(requestLog.error).toHaveBeenCalledWith('analysis monitoring admin handler failed', expect.objectContaining({ cause: expect.stringContaining('connection lost') }))
  })
})

describe('get /api/db/analyses/monitoring/admin, over a range', () => {
  it('hands the requested range down to the query, the last day included whole', async () => {
    vi.mocked(useLogger).mockReturnValue(createMockRequestLogger())

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/monitoring/admin.get')).default
    await handler({ path: '/api/db/analyses/monitoring/admin?from=2026-08-01&to=2026-08-31', method: 'GET' } as any)

    expect(mockGetAllAnalysisMonitoringStats).toHaveBeenCalledWith({
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-09-01T00:00:00.000Z'),
    }, 'day')
  })

  it('asks for all time when no range is given', async () => {
    vi.mocked(useLogger).mockReturnValue(createMockRequestLogger())

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/monitoring/admin.get')).default
    await handler({ path: '/api/db/analyses/monitoring/admin', method: 'GET' } as any)

    expect(mockGetAllAnalysisMonitoringStats).toHaveBeenCalledWith({}, 'day')
  })

  it.each([
    ['malformed', '?to=31-08-2026'],
    ['reversed', '?from=2026-09-02&to=2026-09-01'],
  ])('rejects a %s range with 400 and asks the database for nothing', async (_label, query) => {
    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/monitoring/admin.get')).default

    await expect(handler({ path: `/api/db/analyses/monitoring/admin${query}`, method: 'GET' } as any))
      .rejects
      .toMatchObject({ statusCode: 400 })
    expect(mockGetAllAnalysisMonitoringStats).not.toHaveBeenCalled()
  })
})

describe('get /api/db/analyses/monitoring/admin, at a granularity', () => {
  it.each(['day', 'week', 'month'] as const)('buckets by %s when asked to', async (granularity) => {
    vi.mocked(useLogger).mockReturnValue(createMockRequestLogger())

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/monitoring/admin.get')).default
    await handler({ path: `/api/db/analyses/monitoring/admin?granularity=${granularity}`, method: 'GET' } as any)

    expect(mockGetAllAnalysisMonitoringStats).toHaveBeenCalledWith({}, granularity)
  })

  it('buckets by day when no granularity is given', async () => {
    vi.mocked(useLogger).mockReturnValue(createMockRequestLogger())

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/monitoring/admin.get')).default
    await handler({ path: '/api/db/analyses/monitoring/admin?to=2026-08-31', method: 'GET' } as any)

    expect(mockGetAllAnalysisMonitoringStats).toHaveBeenCalledWith(
      { to: new Date('2026-09-01T00:00:00.000Z') },
      'day',
    )
  })

  it('rejects an unknown granularity with 400, before the admin gate and the database', async () => {
    vi.mocked(useLogger).mockReturnValue(createMockRequestLogger())

    const handler = (await import('../../../../../../src/runtime/server/api/db/analyses/monitoring/admin.get')).default

    await expect(handler({ path: '/api/db/analyses/monitoring/admin?granularity=fortnight', method: 'GET' } as any))
      .rejects
      .toMatchObject({ statusCode: 400 })
    expect(mockRequireRole).not.toHaveBeenCalled()
    expect(mockGetAllAnalysisMonitoringStats).not.toHaveBeenCalled()
  })
})
