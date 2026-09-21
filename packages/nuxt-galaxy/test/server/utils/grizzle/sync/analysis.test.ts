import type { SupabaseClient } from '@supabase/supabase-js'
import type { Context } from 'effect'
import type { Database } from '../../../../../src/runtime/types/database'
import * as bt from 'blendtype'
import { Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { syncJobEffect } from '../../../../../src/runtime/server/utils/grizzle/sync/job'
import {
  acquireSyncLock,
  releaseSyncLock,
} from '../../../../../src/runtime/server/utils/grizzle/sync/lock'
import { syncOutputDatasetEffect } from '../../../../../src/runtime/server/utils/grizzle/sync/output'
import { createFailingGalaxyLayer, createMockGalaxyLayer, createRoutedGalaxyLayer } from '../../../fixtures'

// Sibling helpers are imported from the implementation under test.
const { syncAnalysisEffect, isTransientError } = await import(
  '../../../../../src/runtime/server/utils/grizzle/sync/analysis',
)

vi.mock('../../../../../src/runtime/server/utils/grizzle/sync/lock', () => ({
  acquireSyncLock: vi.fn<typeof acquireSyncLock>(),
  releaseSyncLock: vi.fn<typeof releaseSyncLock>(),
}))

vi.mock('../../../../../src/runtime/server/utils/grizzle/sync/job', () => ({
  syncJobEffect: vi.fn<typeof syncJobEffect>(),
}))

vi.mock('../../../../../src/runtime/server/utils/grizzle/sync/output', () => ({
  syncOutputDatasetEffect: vi.fn<typeof syncOutputDatasetEffect>(),
}))

interface MockSupabaseConfig {
  analysisSelectResult?: { data: unknown, error: unknown }
  jobsStderrResult?: { data: unknown, error: unknown }
  updateResult?: { data: unknown, error: unknown }
}

/** Arguments of every call the Supabase double saw, keyed by chain method. */
type RecordedCalls = Record<string, unknown[][]>

/**
 * The argument lists recorded for `method`. Throws rather than letting an
 * absent method surface as `undefined.find is not a function`.
 */
function callsTo(calls: RecordedCalls, method: string): unknown[][] {
  const recorded = calls[method]
  if (!recorded)
    throw new Error(`the Supabase double recorded no \`${method}\` call`)
  return recorded
}

function createMockSupabase(config: MockSupabaseConfig = {}): SupabaseClient<Database> & { __calls: RecordedCalls } {
  const calls: RecordedCalls = {}
  let currentTable: string | null = null
  let currentAction: 'select' | 'update' | 'insert' | null = null
  let chain: Record<string, unknown>

  const recordCall = (method: string, ...args: unknown[]) => {
    (calls[method] ??= []).push(args)
    return chain
  }

  const resolveResult = () => {
    if (currentAction === 'select' && currentTable === 'analyses')
      return config.analysisSelectResult ?? { data: null, error: null }
    if (currentAction === 'select' && currentTable === 'jobs')
      return config.jobsStderrResult ?? { data: null, error: null }
    if (currentAction === 'update')
      return config.updateResult ?? { data: null, error: null }
    return { data: null, error: null }
  }

  chain = {
    schema: vi.fn(() => chain),
    from: vi.fn((table: string) => {
      currentTable = table
      return recordCall('from', table)
    }),
    select: vi.fn((columns: string) => {
      currentAction = 'select'
      return recordCall('select', columns)
    }),
    update: vi.fn((payload: unknown) => {
      currentAction = 'update'
      return recordCall('update', payload)
    }),
    insert: vi.fn((payload: unknown) => {
      currentAction = 'insert'
      return recordCall('insert', payload)
    }),
    eq: vi.fn((column: string, value: unknown) => recordCall('eq', column, value)),
    not: vi.fn((_column: string, _operator: string, _value: unknown) => chain),
    neq: vi.fn((_column: string, _value: unknown) => chain),
    order: vi.fn((_column: string, _options?: unknown) => chain),
    limit: vi.fn((_count: number) => chain),
    maybeSingle: vi.fn(() => Promise.resolve(resolveResult())),
    single: vi.fn(() => Promise.resolve(resolveResult())),
    then: vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(resolve(resolveResult()))),
  }

  return {
    schema: vi.fn(() => chain),
    from: vi.fn(() => chain),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ data: { id: 'storage-id', path: 'path/to/file' }, error: null })),
      })),
    },
    __calls: calls,
  } as unknown as SupabaseClient<Database> & { __calls: RecordedCalls }
}

const ownerId = 'owner-uuid-1'
const analysisId = 1
const historyId = 10
const galaxyInvocationId = 'galaxy-invocation-1'

const defaultSyncConfig = {
  lockTtlSeconds: 900,
  batchSize: 20,
  maxRetries: 3,
  retryBaseDelayMs: 200,
  retryMaxDelayMs: 2000,
}

function createRetryingGalaxyLayer(responses: (bt.GalaxyInvocation | Error)[]) {
  let callCount = 0
  return {
    layer: Layer.effect(
      bt.GalaxyFetch,
      Effect.sync(() =>
        (async () => {
          const response = responses[callCount++] ?? responses[responses.length - 1]
          if (response instanceof Error)
            throw response
          return response
        }) as unknown as Context.Tag.Service<typeof bt.GalaxyFetch>,
      ),
    ),
    getCount: () => callCount,
  }
}

function createRetryingRoutedGalaxyLayer(
  routes: Record<string, (unknown | Error)[]>,
) {
  const counters: Record<string, number> = {}
  return Layer.effect(
    bt.GalaxyFetch,
    Effect.sync(() =>
      (async (url: string) => {
        for (const [pattern, responses] of Object.entries(routes)) {
          if (url.includes(pattern)) {
            const index = counters[pattern] ?? 0
            counters[pattern] = index + 1
            const response = responses[Math.min(index, responses.length - 1)]
            if (response instanceof Error)
              throw response
            return response
          }
        }
        throw new Error(`No mock route for URL: ${url}`)
      }) as unknown as Context.Tag.Service<typeof bt.GalaxyFetch>,
    ),
  )
}

const baseAnalysisRow = {
  id: analysisId,
  state: 'scheduled' as bt.InvocationState,
  galaxy_id: galaxyInvocationId,
  history_id: historyId,
  owner_id: ownerId,
  sync_attempts: 0,
}

describe('syncAnalysisEffect', () => {
  const scheduledInvocation: bt.GalaxyInvocation = {
    model_class: 'WorkflowInvocation',
    id: galaxyInvocationId,
    state: 'scheduled',
    update_time: '2024-01-01T00:00:00.000Z',
    create_time: '2024-01-01T00:00:00.000Z',
    workflow_id: 'galaxy-workflow-1',
    history_id: 'galaxy-history-1',
    uuid: 'invocation-uuid-1',
    steps: [],
  }

  beforeEach(() => {
    vi.mocked(acquireSyncLock).mockReturnValue(Effect.succeed(true))
    vi.mocked(releaseSyncLock).mockReturnValue(Effect.void)
    vi.mocked(syncJobEffect).mockReturnValue(Effect.succeed(42))
    vi.mocked(syncOutputDatasetEffect).mockReturnValue(Effect.void)
  })

  it('skips when lock cannot be acquired', async () => {
    vi.mocked(acquireSyncLock).mockReturnValue(Effect.succeed(false))
    const supabase = createMockSupabase()
    const layer = createMockGalaxyLayer(scheduledInvocation)

    await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

    expect(acquireSyncLock).toHaveBeenCalledWith(supabase, analysisId, 900)
    expect(releaseSyncLock).not.toHaveBeenCalled()
    expect(supabase.__calls.from).toBeUndefined()
  })

  it('updates analysis state from Galaxy invocation', async () => {
    const supabase = createMockSupabase({
      analysisSelectResult: { data: baseAnalysisRow, error: null },
    })
    const layer = createMockGalaxyLayer(scheduledInvocation)

    await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

    const { __calls: calls } = supabase
    expect(calls.from).toContainEqual(['analyses'])
    expect(calls.select).toContainEqual(['id, state, galaxy_id, history_id, owner_id, sync_attempts'])
    expect(calls.update).toContainEqual([
      {
        state: 'scheduled',
        invocation: scheduledInvocation,
        is_sync: false,
        stderr: null,
        sync_attempts: 0,
        last_sync_error_at: null,
        next_sync_at: null,
      },
    ])
    expect(calls.eq).toContainEqual(['id', analysisId])

    // history updated to running while invocation is non-terminal
    expect(calls.from).toContainEqual(['histories'])
    const historyUpdateCall = callsTo(calls, 'update').find((call) => {
      const payload = call[0] as Record<string, unknown>
      return payload && payload.state === 'running'
    })
    expect(historyUpdateCall).toEqual([{ state: 'running', is_sync: false }])

    // monitoring should not be touched for non-terminal state
    expect(calls.from).not.toContainEqual(['analysis_monitoring'])
    expect(releaseSyncLock).toHaveBeenCalledWith(supabase, analysisId)
  })

  it('syncs jobs and output datasets for each invocation step', async () => {
    const completedInvocation: bt.GalaxyInvocation = {
      ...scheduledInvocation,
      state: 'completed',
      steps: [
        {
          model_class: 'WorkflowInvocationStep',
          id: 'step-1',
          update_time: '2024-01-01T00:00:00.000Z',
          job_id: 'galaxy-job-1',
          workflow_step_id: 'ws-1',
          state: 'ok' as bt.JobState,
          order_index: 0,
          workflow_step_label: 'step-one',
          workflow_step_uuid: 'wsu-1',
        },
        {
          model_class: 'WorkflowInvocationStep',
          id: 'step-2',
          update_time: '2024-01-01T00:00:00.000Z',
          job_id: 'galaxy-job-2',
          workflow_step_id: 'ws-2',
          state: 'ok' as bt.JobState,
          order_index: 1,
          workflow_step_label: 'step-two',
          workflow_step_uuid: 'wsu-2',
        },
      ],
      outputs: {
        out1: { id: 'dataset-1', src: 'hda', label: 'out1', workflow_step_id: 'ws-1' },
        out2: { id: 'dataset-2', src: 'hda', label: 'out2', workflow_step_id: 'ws-2' },
      },
    }

    vi.mocked(syncJobEffect)
      .mockReturnValueOnce(Effect.succeed(100))
      .mockReturnValueOnce(Effect.succeed(101))

    const supabase = createMockSupabase({
      analysisSelectResult: { data: baseAnalysisRow, error: null },
    })
    const layer = createMockGalaxyLayer(completedInvocation)

    await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

    expect(syncJobEffect).toHaveBeenCalledWith('galaxy-job-1', 0, analysisId, ownerId, supabase, layer)
    expect(syncJobEffect).toHaveBeenCalledWith('galaxy-job-2', 1, analysisId, ownerId, supabase, layer)
    expect(syncOutputDatasetEffect).toHaveBeenCalledWith('dataset-1', analysisId, historyId, 100, ownerId, supabase, layer)
    expect(syncOutputDatasetEffect).toHaveBeenCalledWith('dataset-2', analysisId, historyId, 101, ownerId, supabase, layer)

    const { __calls: calls } = supabase
    expect(calls.update).toContainEqual([{
      state: 'completed',
      invocation: completedInvocation,
      is_sync: true,
      stderr: null,
      sync_attempts: 0,
      last_sync_error_at: null,
      next_sync_at: null,
    }])
    expect(calls.from).toContainEqual(['histories'])
    const historyUpdateCall = callsTo(calls, 'update').find((call) => {
      const payload = call[0] as Record<string, unknown>
      return payload && payload.state === 'ok'
    })
    expect(historyUpdateCall).toEqual([{ state: 'ok', is_sync: true }])
  })

  it('updates monitoring outcome when invocation reaches a terminal state', async () => {
    const completedInvocation: bt.GalaxyInvocation = {
      ...scheduledInvocation,
      state: 'completed',
      steps: [],
    }
    const supabase = createMockSupabase({
      analysisSelectResult: { data: baseAnalysisRow, error: null },
    })
    const layer = createMockGalaxyLayer(completedInvocation)

    await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

    const { __calls: calls } = supabase
    expect(calls.from).toContainEqual(['analysis_monitoring'])
    const monitoringUpdateCall = callsTo(calls, 'update').find((call) => {
      const payload = call[0] as Record<string, unknown>
      return payload && payload.outcome !== undefined
    })
    expect(monitoringUpdateCall).toEqual([
      {
        outcome: 'success',
        completed_at: expect.any(String),
        error_message: null,
      },
    ])
    const monitoringEqCalls = callsTo(calls, 'eq').filter(call => call[0] === 'galaxy_invocation_id' || call[0] === 'owner_id' || call[0] === 'outcome')
    expect(monitoringEqCalls).toContainEqual(['galaxy_invocation_id', galaxyInvocationId])
    expect(monitoringEqCalls).toContainEqual(['owner_id', ownerId])
    expect(monitoringEqCalls).toContainEqual(['outcome', 'pending'])
  })

  it('records stderr and error_message for failed terminal invocations', async () => {
    const failedInvocation: bt.GalaxyInvocation = {
      ...scheduledInvocation,
      state: 'failed',
      steps: [],
    }
    const supabase = createMockSupabase({
      analysisSelectResult: { data: baseAnalysisRow, error: null },
      jobsStderrResult: { data: { stderr: '  galaxy job failed\n' }, error: null },
    })
    const layer = createMockGalaxyLayer(failedInvocation)

    await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

    const { __calls: calls } = supabase
    expect(calls.update).toContainEqual([
      {
        state: 'failed',
        invocation: failedInvocation,
        is_sync: true,
        stderr: 'galaxy job failed',
        sync_attempts: 0,
        last_sync_error_at: null,
        next_sync_at: null,
      },
    ])
    const monitoringUpdateCall = callsTo(calls, 'update').find((call) => {
      const payload = call[0] as Record<string, unknown>
      return payload && payload.outcome === 'error'
    })
    expect(monitoringUpdateCall).toEqual([
      {
        outcome: 'error',
        completed_at: expect.any(String),
        error_message: 'galaxy job failed',
      },
    ])
  })

  it('marks analysis completed when invocation is scheduled but jobs summary is all ok', async () => {
    const scheduledWithJob: bt.GalaxyInvocation = {
      ...scheduledInvocation,
      steps: [
        {
          model_class: 'WorkflowInvocationStep',
          id: 'step-1',
          update_time: '2024-01-01T00:00:00.000Z',
          job_id: 'galaxy-job-1',
          workflow_step_id: 'ws-1',
          state: 'ok' as bt.JobState,
          order_index: 0,
          workflow_step_label: 'step-one',
          workflow_step_uuid: 'uuid-1',
        },
      ],
    }
    const jobsSummary: bt.InvocationJobsSummary = {
      model: 'WorkflowInvocation',
      id: galaxyInvocationId,
      states: { ok: 1 },
      populated_state: 'ok',
    }
    const layer = createRoutedGalaxyLayer({
      [`api/invocations/${galaxyInvocationId}/jobs_summary`]: jobsSummary,
      [`api/invocations/${galaxyInvocationId}`]: scheduledWithJob,
    })

    const supabase = createMockSupabase({
      analysisSelectResult: { data: baseAnalysisRow, error: null },
    })

    await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

    const { __calls: calls } = supabase
    const analysisUpdateCall = callsTo(calls, 'update').find((call) => {
      const payload = call[0] as Record<string, unknown>
      return payload && Object.prototype.hasOwnProperty.call(payload, 'is_sync')
    })
    expect(analysisUpdateCall).toEqual([
      {
        state: 'completed',
        invocation: scheduledWithJob,
        is_sync: true,
        stderr: null,
        sync_attempts: 0,
        last_sync_error_at: null,
        next_sync_at: null,
      },
    ])

    const historyUpdateCall = callsTo(calls, 'update').find((call) => {
      const payload = call[0] as Record<string, unknown>
      return payload && payload.state === 'ok'
    })
    expect(historyUpdateCall).toEqual([{ state: 'ok', is_sync: true }])

    expect(calls.from).toContainEqual(['analysis_monitoring'])
    const monitoringUpdateCall = callsTo(calls, 'update').find((call) => {
      const payload = call[0] as Record<string, unknown>
      return payload && Object.prototype.hasOwnProperty.call(payload, 'outcome')
    })
    expect(monitoringUpdateCall).toEqual([
      {
        outcome: 'success',
        completed_at: expect.any(String),
        error_message: null,
      },
    ])
  })

  it('fails when analysis row is not found', async () => {
    const supabase = createMockSupabase({
      analysisSelectResult: { data: null, error: { message: 'not found' } },
    })
    const layer = createMockGalaxyLayer(scheduledInvocation)

    await expect(Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))).rejects.toThrow('Analysis 1 not found')

    expect(releaseSyncLock).toHaveBeenCalledWith(supabase, analysisId)
  })

  it('fails when analysis owner does not match', async () => {
    const supabase = createMockSupabase({
      analysisSelectResult: { data: { ...baseAnalysisRow, owner_id: 'other-owner' }, error: null },
    })
    const layer = createMockGalaxyLayer(scheduledInvocation)

    await expect(Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))).rejects.toThrow('Ownership mismatch')

    const { __calls: calls } = supabase
    expect(calls.update).toBeUndefined()
    expect(releaseSyncLock).toHaveBeenCalledWith(supabase, analysisId)
  })

  it('fails when Galaxy is unreachable', async () => {
    const supabase = createMockSupabase({
      analysisSelectResult: { data: baseAnalysisRow, error: null },
    })
    const layer = createFailingGalaxyLayer(new Error('Service Unavailable'))

    await expect(Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))).rejects.toThrow('Galaxy service is unavailable')

    expect(releaseSyncLock).toHaveBeenCalledWith(supabase, analysisId)
  })

  it('retries on transient Galaxy error and succeeds when the next attempt recovers', async () => {
    const completedInvocation: bt.GalaxyInvocation = {
      ...scheduledInvocation,
      state: 'completed',
      steps: [],
    }
    const layer = createRetryingRoutedGalaxyLayer({
      [`api/invocations/${galaxyInvocationId}`]: [new Error('Service Unavailable'), completedInvocation],
    })
    const supabase = createMockSupabase({
      analysisSelectResult: { data: baseAnalysisRow, error: null },
    })

    await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

    const { __calls: calls } = supabase
    expect(calls.update).toContainEqual([
      {
        state: 'completed',
        invocation: completedInvocation,
        is_sync: true,
        stderr: null,
        sync_attempts: 0,
        last_sync_error_at: null,
        next_sync_at: null,
      },
    ])
    expect(releaseSyncLock).toHaveBeenCalledWith(supabase, analysisId)
  })

  it('fails after maxRetries + 1 attempts when Galaxy keeps returning transient errors', async () => {
    const { layer, getCount } = createRetryingGalaxyLayer([
      new Error('Service Unavailable'),
    ])
    const supabase = createMockSupabase({
      analysisSelectResult: { data: baseAnalysisRow, error: null },
    })

    await expect(Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))).rejects.toThrow('Galaxy service is unavailable')

    expect(getCount()).toBe(defaultSyncConfig.maxRetries + 1)
    expect(releaseSyncLock).toHaveBeenCalledWith(supabase, analysisId)
  })

  it('does not retry when the analysis row is missing and does not update sync_attempts', async () => {
    const { layer, getCount } = createRetryingGalaxyLayer([scheduledInvocation])
    const supabase = createMockSupabase({
      analysisSelectResult: { data: null, error: { message: 'not found' } },
    })

    await expect(Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))).rejects.toThrow('Analysis 1 not found')

    expect(getCount()).toBe(0)
    const { __calls: calls } = supabase
    expect(calls.from?.filter(call => call[0] === 'analyses').length).toBe(1)
    expect(calls.update).toBeUndefined()
    expect(releaseSyncLock).toHaveBeenCalledWith(supabase, analysisId)
  })

  it('resets sync_attempts columns on a successful sync', async () => {
    const supabase = createMockSupabase({
      analysisSelectResult: { data: baseAnalysisRow, error: null },
    })
    const layer = createMockGalaxyLayer(scheduledInvocation)

    await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

    const { __calls: calls } = supabase
    expect(calls.update).toContainEqual([
      {
        state: 'scheduled',
        invocation: scheduledInvocation,
        is_sync: false,
        stderr: null,
        sync_attempts: 0,
        last_sync_error_at: null,
        next_sync_at: null,
      },
    ])
  })

  it('increments sync_attempts and schedules next_sync_at after retries are exhausted', async () => {
    const before = Date.now()
    const rowWithAttempts = { ...baseAnalysisRow, sync_attempts: 2 }
    const supabase = createMockSupabase({
      analysisSelectResult: { data: rowWithAttempts, error: null },
    })
    const layer = createFailingGalaxyLayer(new Error('Service Unavailable'))

    await expect(Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))).rejects.toThrow('Galaxy service is unavailable')

    const { __calls: calls } = supabase
    const attemptUpdate = callsTo(calls, 'update').find((call) => {
      const payload = call[0] as Record<string, unknown>
      return payload && Object.prototype.hasOwnProperty.call(payload, 'sync_attempts') && payload.sync_attempts === 3
    })
    expect(attemptUpdate).toBeDefined()
    const payload = attemptUpdate![0] as Record<string, unknown>
    expect(payload.sync_attempts).toBe(3)
    expect(payload.last_sync_error_at).toEqual(expect.any(String))
    const lastSyncErrorAt = new Date(payload.last_sync_error_at as string).getTime()
    expect(lastSyncErrorAt).toBeGreaterThanOrEqual(before)
    const expectedDelayMs = Math.min(defaultSyncConfig.retryBaseDelayMs * 2 ** 2, defaultSyncConfig.retryMaxDelayMs)
    const nextSyncAt = new Date(payload.next_sync_at as string).getTime()
    expect(nextSyncAt).toBeGreaterThanOrEqual(before + expectedDelayMs - 1000)
    expect(nextSyncAt).toBeLessThanOrEqual(before + expectedDelayMs + 5000)
  })

  it('does not update sync_attempts when the lock cannot be acquired', async () => {
    vi.mocked(acquireSyncLock).mockReturnValue(Effect.succeed(false))
    const supabase = createMockSupabase()
    const layer = createMockGalaxyLayer(scheduledInvocation)

    await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

    const { __calls: calls } = supabase
    expect(calls.update).toBeUndefined()
  })

  it('retries on GalaxyApiError statusCode 503 and exhausts retries, incrementing sync_attempts', async () => {
    const supabase = createMockSupabase({
      analysisSelectResult: { data: baseAnalysisRow, error: null },
    })
    const layer = createFailingGalaxyLayer(new bt.GalaxyApiError({ message: 'Service Unavailable', statusCode: 503 }))

    await expect(Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))).rejects.toThrow('Galaxy service is unavailable')

    const { __calls: calls } = supabase
    const attemptUpdate = callsTo(calls, 'update').find((call) => {
      const payload = call[0] as Record<string, unknown>
      return payload && Object.prototype.hasOwnProperty.call(payload, 'sync_attempts')
    })
    expect(attemptUpdate).toBeDefined()
    const payload = attemptUpdate![0] as Record<string, unknown>
    expect(payload.sync_attempts).toBe(1)
  })
})

describe('isTransientError', () => {
  it('treats GalaxyApiError statusCode 503 and 429 as transient', () => {
    expect(isTransientError(new bt.GalaxyApiError({ message: 'Service Unavailable', statusCode: 503 }))).toBe(true)
    expect(isTransientError(new bt.GalaxyApiError({ message: 'Upstream Error', statusCode: 429 }))).toBe(true)
  })

  it('does not treat 400/404 status codes as transient', () => {
    expect(isTransientError(new bt.GalaxyApiError({ message: 'Bad Request', statusCode: 400 }))).toBe(false)
    expect(isTransientError(new bt.GalaxyApiError({ message: 'Not Found', statusCode: 404 }))).toBe(false)
  })

  it('preserves the existing message heuristic', () => {
    expect(isTransientError(new Error('Service Unavailable'))).toBe(true)
    expect(isTransientError(new Error('Too Many Requests'))).toBe(true)
    expect(isTransientError(new Error('network error'))).toBe(true)
    expect(isTransientError(new Error('permanent failure'))).toBe(false)
  })
})
