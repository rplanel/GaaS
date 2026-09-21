import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../../src/runtime/types/database'
import { GalaxyFetch } from 'blendtype'
import { Effect, Layer } from 'effect'
import { createRequestLogger } from 'evlog'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreateServiceRoleSupabaseClient = vi.hoisted(() => vi.fn())
const mockUseGalaxyLayer = vi.hoisted(() => vi.fn())
const mockSyncAnalysisEffect = vi.hoisted(() => vi.fn())
const mockCreateRequestLogger = vi.hoisted(() => vi.fn())
const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))

vi.mock('evlog', () => ({
  log: mockLog,
  createRequestLogger: mockCreateRequestLogger,
}))

vi.mock('nitropack/runtime/task', () => ({
  defineTask: vi.fn(task => task),
}))

vi.mock('../../../../src/runtime/server/utils/grizzle/supabase.js', () => ({
  createServiceRoleSupabaseClient: mockCreateServiceRoleSupabaseClient,
}))

vi.mock('../../../../src/runtime/server/utils/galaxy.js', () => ({
  useGalaxyLayer: mockUseGalaxyLayer,
}))

vi.mock('../../../../src/runtime/server/utils/grizzle/sync/analysis.js', () => ({
  syncAnalysisEffect: mockSyncAnalysisEffect,
}))

const mockGalaxyLayer = Layer.succeed(GalaxyFetch, (async () => ({})) as any)

const defaultSyncConfig = {
  lockTtlSeconds: 900,
  batchSize: 20,
  maxRetries: 3,
  retryBaseDelayMs: 200,
  retryMaxDelayMs: 2000,
}

interface MockSupabaseTaskConfig {
  singleResult?: { data: { id: number, owner_id: string } | null, error: { message: string } | null }
  pageResults?: Array<{ data: Array<{ id: number, owner_id: string }> | null, error: { message: string } | null }>
}

function createMockSupabaseForTask(config: MockSupabaseTaskConfig = {}) {
  const calls: Record<string, unknown[]> = {}
  let pageCallCount = 0

  const chain: Record<string, any> = {}

  const recordCall = (method: string, ...args: unknown[]) => {
    if (!calls[method])
      calls[method] = []
    calls[method].push(args)
    return chain
  }

  Object.assign(chain, {
    schema: vi.fn(() => chain),
    from: vi.fn((table: string) => recordCall('from', table)),
    select: vi.fn((columns: string) => recordCall('select', columns)),
    eq: vi.fn((column: string, value: unknown) => recordCall('eq', column, value)),
    or: vi.fn((filter: string) => recordCall('or', filter)),
    order: vi.fn((column: string, options?: unknown) => recordCall('order', column, options)),
    range: vi.fn((from: number, to: number) => {
      recordCall('range', from, to)
      const result = config.pageResults?.[pageCallCount++] ?? { data: [], error: null }
      return {
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(result)),
      }
    }),
    single: vi.fn(() => {
      recordCall('single')
      const result = config.singleResult ?? { data: null, error: null }
      return Promise.resolve(result)
    }),
  })

  return {
    mockClient: {
      schema: vi.fn(() => chain),
      from: vi.fn(() => chain),
    } as unknown as SupabaseClient<Database>,
    calls,
  }
}

async function loadTask() {
  const mod = await import('../../../../src/runtime/server/tasks/galaxy/sync-analyses')
  return mod.default
}

describe('galaxy:sync-analyses task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateRequestLogger.mockReturnValue({ emit: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
    mockLog.info.mockClear()
    mockLog.warn.mockClear()
    mockLog.error.mockClear()
    mockLog.debug.mockClear()
  })

  it('has correct meta', async () => {
    const task = await loadTask()
    expect(task.meta?.name).toBe('galaxy:sync-analyses')
  })

  it('creates a request logger for the task', async () => {
    const { mockClient } = createMockSupabaseForTask({
      pageResults: [{ data: [], error: null }],
    })
    mockCreateServiceRoleSupabaseClient.mockReturnValueOnce(Effect.succeed(mockClient))
    mockUseGalaxyLayer.mockReturnValueOnce(mockGalaxyLayer)

    const task = await loadTask()
    await task.run({ name: 'galaxy:sync-analyses', payload: {}, context: {} })

    expect(createRequestLogger).toHaveBeenCalledWith({ operation: 'galaxy:sync-analyses', requestId: expect.any(String) })
    expect(mockCreateRequestLogger.mock.results[0]!.value.emit).toHaveBeenCalledWith({
      status: 200,
      synced: 0,
      failed: 0,
      skipped: 0,
      durationMs: expect.any(Number),
      errors: [],
    })
  })

  it('processes a requested analysisId', async () => {
    const { mockClient } = createMockSupabaseForTask({
      singleResult: { data: { id: 1, owner_id: 'owner-1' }, error: null },
    })
    mockCreateServiceRoleSupabaseClient.mockReturnValueOnce(Effect.succeed(mockClient))
    mockUseGalaxyLayer.mockReturnValueOnce(mockGalaxyLayer)
    mockSyncAnalysisEffect.mockReturnValueOnce(Effect.void)

    const task = await loadTask()
    const result = await task.run({ name: 'galaxy:sync-analyses', payload: { analysisId: 1 }, context: {} })

    expect(result.result).toEqual({ synced: 1, failed: 0, skipped: 0, errors: [] })
    expect(mockSyncAnalysisEffect).toHaveBeenCalledWith(1, 'owner-1', mockClient, mockGalaxyLayer, defaultSyncConfig)
  })

  it('returns failed when requested analysis is not found', async () => {
    const { mockClient } = createMockSupabaseForTask({
      singleResult: { data: null, error: { message: 'not found' } },
    })
    mockCreateServiceRoleSupabaseClient.mockReturnValueOnce(Effect.succeed(mockClient))
    mockUseGalaxyLayer.mockReturnValueOnce(mockGalaxyLayer)

    const task = await loadTask()
    const result = await task.run({ name: 'galaxy:sync-analyses', payload: { analysisId: 99 }, context: {} })

    expect(result.result).toEqual({ synced: 0, failed: 1, skipped: 0, errors: [{ analysisId: 99, message: 'Analysis not found' }] })
    expect(mockSyncAnalysisEffect).not.toHaveBeenCalled()
  })

  it('pages through pending analyses when no analysisId is provided', async () => {
    const { mockClient, calls } = createMockSupabaseForTask({
      pageResults: [
        { data: [{ id: 1, owner_id: 'owner-1' }, { id: 2, owner_id: 'owner-2' }], error: null },
        { data: [], error: null },
      ],
    })
    mockCreateServiceRoleSupabaseClient.mockReturnValueOnce(Effect.succeed(mockClient))
    mockUseGalaxyLayer.mockReturnValueOnce(mockGalaxyLayer)
    mockSyncAnalysisEffect
      .mockReturnValueOnce(Effect.void)
      .mockReturnValueOnce(Effect.void)

    const task = await loadTask()
    const result = await task.run({ name: 'galaxy:sync-analyses', payload: {}, context: {} })

    expect(result.result).toEqual({ synced: 2, failed: 0, skipped: 0, errors: [] })
    expect(calls.range).toHaveLength(1)
    expect(calls.range?.[0]).toEqual([0, 19])
    expect(calls.or).toContainEqual(['is_sync.eq.false,state.in.(new,requires_materialization,ready,scheduled,cancelling)'])
    expect(calls.or).toContainEqual([expect.stringMatching(/^next_sync_at\.is\.null,next_sync_at\.lte\.\d{4}-\d{2}-\d{2}T/)])
    expect(calls.order).toContainEqual(['next_sync_at', { ascending: true }])
    expect(mockSyncAnalysisEffect).toHaveBeenCalledWith(1, 'owner-1', mockClient, mockGalaxyLayer, defaultSyncConfig)
    expect(mockSyncAnalysisEffect).toHaveBeenCalledWith(2, 'owner-2', mockClient, mockGalaxyLayer, defaultSyncConfig)
  })

  it('counts failures when syncAnalysisEffect fails', async () => {
    const { mockClient } = createMockSupabaseForTask({
      pageResults: [
        { data: [{ id: 1, owner_id: 'owner-1' }, { id: 2, owner_id: 'owner-2' }], error: null },
        { data: [], error: null },
      ],
    })
    mockCreateServiceRoleSupabaseClient.mockReturnValueOnce(Effect.succeed(mockClient))
    mockUseGalaxyLayer.mockReturnValueOnce(mockGalaxyLayer)
    mockSyncAnalysisEffect
      .mockReturnValueOnce(Effect.void)
      .mockReturnValueOnce(Effect.fail(new Error('sync failed')))

    const task = await loadTask()
    const result = await task.run({ name: 'galaxy:sync-analyses', payload: {}, context: {} })

    expect(result.result).toEqual({ synced: 1, failed: 1, skipped: 0, errors: [{ analysisId: 2, message: 'sync failed' }] })
  })

  it('reports all failures when every analysis in the batch fails', async () => {
    const { mockClient } = createMockSupabaseForTask({
      pageResults: [
        { data: [{ id: 1, owner_id: 'owner-1' }, { id: 2, owner_id: 'owner-2' }, { id: 3, owner_id: 'owner-3' }], error: null },
        { data: [], error: null },
      ],
    })
    mockCreateServiceRoleSupabaseClient.mockReturnValueOnce(Effect.succeed(mockClient))
    mockUseGalaxyLayer.mockReturnValueOnce(mockGalaxyLayer)
    mockSyncAnalysisEffect
      .mockReturnValueOnce(Effect.fail(new Error('lock held')))
      .mockReturnValueOnce(Effect.fail(new Error('galaxy unreachable')))
      .mockReturnValueOnce(Effect.fail(new Error('db write failed')))

    const task = await loadTask()
    const result = await task.run({ name: 'galaxy:sync-analyses', payload: {}, context: {} })

    // The current task contract always reports skipped as 0; failures are captured in failed/errors.
    expect(result.result).toEqual({
      synced: 0,
      failed: 3,
      skipped: 0,
      errors: [
        { analysisId: 1, message: 'lock held' },
        { analysisId: 2, message: 'galaxy unreachable' },
        { analysisId: 3, message: 'db write failed' },
      ],
    })
    expect(mockSyncAnalysisEffect).toHaveBeenCalledWith(1, 'owner-1', mockClient, mockGalaxyLayer, defaultSyncConfig)
    expect(mockSyncAnalysisEffect).toHaveBeenCalledWith(2, 'owner-2', mockClient, mockGalaxyLayer, defaultSyncConfig)
    expect(mockSyncAnalysisEffect).toHaveBeenCalledWith(3, 'owner-3', mockClient, mockGalaxyLayer, defaultSyncConfig)
  })

  it('fails when paginated query returns an error', async () => {
    const { mockClient } = createMockSupabaseForTask({
      pageResults: [{ data: null, error: { message: 'database error' } }],
    })
    mockCreateServiceRoleSupabaseClient.mockReturnValueOnce(Effect.succeed(mockClient))
    mockUseGalaxyLayer.mockReturnValueOnce(mockGalaxyLayer)

    const task = await loadTask()
    const result = await task.run({ name: 'galaxy:sync-analyses', payload: {}, context: {} })

    expect(result.result).toMatchObject({ synced: 0, failed: 1, skipped: 0, errors: [{ analysisId: null, message: 'database error' }] })
  })

  it('continues the batch when an analysis lock is held', async () => {
    const { mockClient } = createMockSupabaseForTask({
      pageResults: [
        { data: [{ id: 1, owner_id: 'owner-1' }, { id: 2, owner_id: 'owner-2' }], error: null },
        { data: [], error: null },
      ],
    })
    mockCreateServiceRoleSupabaseClient.mockReturnValueOnce(Effect.succeed(mockClient))
    mockUseGalaxyLayer.mockReturnValueOnce(mockGalaxyLayer)
    mockSyncAnalysisEffect
      .mockReturnValueOnce(Effect.void) // lock held, returns undefined
      .mockReturnValueOnce(Effect.void) // successful sync

    const task = await loadTask()
    const result = await task.run({ name: 'galaxy:sync-analyses', payload: {}, context: {} })

    expect(result.result).toEqual({ synced: 2, failed: 0, skipped: 0, errors: [] })
    expect(mockSyncAnalysisEffect).toHaveBeenCalledWith(1, 'owner-1', mockClient, mockGalaxyLayer, defaultSyncConfig)
    expect(mockSyncAnalysisEffect).toHaveBeenCalledWith(2, 'owner-2', mockClient, mockGalaxyLayer, defaultSyncConfig)
  })

  it('returns two successes with no failures or skips', async () => {
    const { mockClient } = createMockSupabaseForTask({
      pageResults: [
        { data: [{ id: 1, owner_id: 'owner-1' }, { id: 2, owner_id: 'owner-2' }], error: null },
        { data: [], error: null },
      ],
    })
    mockCreateServiceRoleSupabaseClient.mockReturnValueOnce(Effect.succeed(mockClient))
    mockUseGalaxyLayer.mockReturnValueOnce(mockGalaxyLayer)
    mockSyncAnalysisEffect
      .mockReturnValueOnce(Effect.void)
      .mockReturnValueOnce(Effect.void)

    const task = await loadTask()
    const result = await task.run({ name: 'galaxy:sync-analyses', payload: {}, context: {} })

    expect(result.result).toEqual({ synced: 2, failed: 0, skipped: 0, errors: [] })
  })

  it('returns two failures with no successes or skips', async () => {
    const { mockClient } = createMockSupabaseForTask({
      pageResults: [
        { data: [{ id: 1, owner_id: 'owner-1' }, { id: 2, owner_id: 'owner-2' }], error: null },
        { data: [], error: null },
      ],
    })
    mockCreateServiceRoleSupabaseClient.mockReturnValueOnce(Effect.succeed(mockClient))
    mockUseGalaxyLayer.mockReturnValueOnce(mockGalaxyLayer)
    mockSyncAnalysisEffect
      .mockReturnValueOnce(Effect.fail(new Error('sync failed 1')))
      .mockReturnValueOnce(Effect.fail(new Error('sync failed 2')))

    const task = await loadTask()
    const result = await task.run({ name: 'galaxy:sync-analyses', payload: {}, context: {} })

    expect(result.result).toEqual({
      synced: 0,
      failed: 2,
      skipped: 0,
      errors: [
        { analysisId: 1, message: 'sync failed 1' },
        { analysisId: 2, message: 'sync failed 2' },
      ],
    })
  })

  it('returns one success and one failure with no skips', async () => {
    const { mockClient } = createMockSupabaseForTask({
      pageResults: [
        { data: [{ id: 1, owner_id: 'owner-1' }, { id: 2, owner_id: 'owner-2' }], error: null },
        { data: [], error: null },
      ],
    })
    mockCreateServiceRoleSupabaseClient.mockReturnValueOnce(Effect.succeed(mockClient))
    mockUseGalaxyLayer.mockReturnValueOnce(mockGalaxyLayer)
    mockSyncAnalysisEffect
      .mockReturnValueOnce(Effect.void)
      .mockReturnValueOnce(Effect.fail(new Error('sync failed')))

    const task = await loadTask()
    const result = await task.run({ name: 'galaxy:sync-analyses', payload: {}, context: {} })

    expect(result.result).toEqual({
      synced: 1,
      failed: 1,
      skipped: 0,
      errors: [{ analysisId: 2, message: 'sync failed' }],
    })
  })
})
