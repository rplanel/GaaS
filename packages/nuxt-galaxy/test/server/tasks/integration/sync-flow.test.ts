import type { SupabaseClient } from '@supabase/supabase-js'
import type * as bt from 'blendtype'
import type { Database } from '../../../../src/runtime/types/database'
import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create503GalaxyLayer, createRoutedGalaxyLayer } from '../../fixtures'

const mockCreateServiceRoleSupabaseClient = vi.hoisted(() => vi.fn())
const mockUseGalaxyLayer = vi.hoisted(() => vi.fn())

vi.mock('nitropack/runtime/task', () => ({
  defineTask: vi.fn(task => task),
}))

vi.mock('../../../../src/runtime/server/utils/grizzle/supabase.js', () => ({
  createServiceRoleSupabaseClient: mockCreateServiceRoleSupabaseClient,
  uploadStreamToStorage: vi.fn(() => Effect.succeed({ id: 'storage-id', path: 'path/to/file' })),
}))

vi.mock('../../../../src/runtime/server/utils/galaxy.js', () => ({
  useGalaxyLayer: mockUseGalaxyLayer,
}))

async function loadTask() {
  const mod = await import('../../../../src/runtime/server/tasks/galaxy/sync-analyses')
  return mod.default
}

function createStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('test dataset content'))
      controller.close()
    },
  })
}

function createMockSupabaseForIntegration(responses: Array<{ data: unknown, error: unknown }>) {
  let index = 0
  let rpcIndex = 0
  const calls: Record<string, unknown[]> = {}
  const chain: Record<string, any> = {}

  const recordCall = (method: string, ...args: unknown[]) => {
    if (!calls[method])
      calls[method] = []
    calls[method].push(args)
    return chain
  }

  const nextResult = () => {
    const response = responses[index++] ?? { data: null, error: null }
    return response
  }

  const rpcResponses: Array<{ data: unknown, error: unknown }> = []

  Object.assign(chain, {
    schema: vi.fn(() => chain),
    from: vi.fn((table: string) => {
      recordCall('from', table)
      return chain
    }),
    select: vi.fn((columns: string) => {
      recordCall('select', columns)
      return chain
    }),
    insert: vi.fn((payload: unknown) => {
      recordCall('insert', payload)
      return chain
    }),
    update: vi.fn((payload: unknown) => {
      recordCall('update', payload)
      return chain
    }),
    delete: vi.fn(() => {
      recordCall('delete')
      return chain
    }),
    eq: vi.fn((column: string, value: unknown) => {
      recordCall('eq', column, value)
      return chain
    }),
    not: vi.fn((_column: string, _operator: string, _value: unknown) => chain),
    neq: vi.fn((_column: string, _value: unknown) => chain),
    or: vi.fn((filter: string) => {
      recordCall('or', filter)
      return chain
    }),
    range: vi.fn((from: number, to: number) => {
      recordCall('range', from, to)
      return chain
    }),
    order: vi.fn((_column: string, _options?: unknown) => chain),
    limit: vi.fn((_count: number) => chain),
    maybeSingle: vi.fn(() => Promise.resolve(nextResult())),
    single: vi.fn(() => Promise.resolve(nextResult())),
    then: vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(resolve(nextResult()))),
    rpc: vi.fn((_name: string, _params?: unknown) => {
      const response = rpcResponses[rpcIndex++] ?? { data: null, error: null }
      return Promise.resolve(response)
    }),
  })

  const mockClient = {
    schema: vi.fn(() => chain),
    from: vi.fn(() => chain),
    rpc: vi.fn((_name: string, _params?: unknown) => {
      const response = rpcResponses[rpcIndex++] ?? { data: null, error: null }
      return Promise.resolve(response)
    }),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ data: { id: 'storage-id', path: 'path/to/file' }, error: null })),
      })),
    },
    __calls: calls,
    __rpcResponses: rpcResponses,
  } as unknown as SupabaseClient<Database>

  return { mockClient, calls, rpcResponses }
}

describe('sync-flow integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('scheduled task syncs a pending analysis and stores terminal-ok dataset', async () => {
    const ownerId = 'owner-uuid-1'
    const analysisId = 1
    const historyId = 10
    const galaxyInvocationId = 'galaxy-invocation-1'
    const galaxyJobId = 'galaxy-job-1'
    const galaxyDatasetId = 'dataset-1'
    const galaxyHistoryId = 'galaxy-history-1'

    const { mockClient, calls, rpcResponses } = createMockSupabaseForIntegration([
      // Task-level query: fetch analysis by id
      { data: { id: analysisId, owner_id: ownerId }, error: null },
      // syncAnalysisEffect: fetch full analysis row
      { data: { id: analysisId, state: 'scheduled', galaxy_id: galaxyInvocationId, history_id: historyId, owner_id: ownerId }, error: null },
      // syncAnalysisEffect: update analysis state (terminal, no stderr fetch because state is completed)
      { data: null, error: null },
      // syncAnalysisEffect: update monitoring outcome
      { data: null, error: null },
      // syncJobEffect: check existing job
      { data: null, error: null },
      // syncJobEffect: insert job and return id
      { data: { id: 100 }, error: null },
      // syncOutputDatasetEffect: check existing output
      { data: null, error: null },
      // syncOutputDatasetEffect: fetch history galaxy_id
      { data: { galaxy_id: galaxyHistoryId }, error: null },
      // syncOutputDatasetEffect: set storage object owner
      { data: null, error: null },
      // syncOutputDatasetEffect: insert dataset and return id
      { data: { id: 200 }, error: null },
      // syncOutputDatasetEffect: insert analysis output
      { data: null, error: null },
      // syncAnalysisEffect: update history state
      { data: null, error: null },
      // syncAnalysisEffect: release lock - delete lock
      { data: null, error: null },
    ])

    // RPC responses are consumed separately from query responses
    rpcResponses.push(
      // syncAnalysisEffect: acquire_sync_lock RPC
      { data: true, error: null },
    )

    const completedInvocation: bt.GalaxyInvocation = {
      model_class: 'WorkflowInvocation',
      id: galaxyInvocationId,
      state: 'completed',
      update_time: '2024-01-01T00:00:00.000Z',
      create_time: '2024-01-01T00:00:00.000Z',
      workflow_id: 'galaxy-workflow-1',
      history_id: galaxyHistoryId,
      uuid: 'invocation-uuid-1',
      steps: [
        {
          model_class: 'WorkflowInvocationStep',
          id: 'step-1',
          update_time: '2024-01-01T00:00:00.000Z',
          job_id: galaxyJobId,
          workflow_step_id: 'ws-1',
          state: 'ok' as bt.JobState,
          order_index: 0,
          workflow_step_label: 'step-one',
          workflow_step_uuid: 'wsu-1',
        },
      ],
      outputs: {
        out1: { id: galaxyDatasetId, src: 'hda', label: 'out1', workflow_step_id: 'ws-1' },
      },
    }

    const galaxyJob: bt.ShowFullJobResponse = {
      model_class: 'Job',
      id: galaxyJobId,
      state: 'ok',
      create_time: '2024-01-01T00:00:00.000Z',
      update_time: '2024-01-01T00:00:00.000Z',
      tool_id: 'test-tool-id',
      exit_code: 0,
      stderr: '',
      stdout: 'Job completed',
      params: {} as Record<string, never>,
    }

    const galaxyDataset: bt.GalaxyDataset = {
      dataset_id: 'galaxy-dataset-1',
      type: 'txt',
      extension: 'txt',
      purged: false,
      deleted: false,
      name: 'Test Dataset',
      file_size: 1024,
      tags: ['tag1', 'tag2'],
      resubmitted: false,
      create_time: '2024-01-01T00:00:00.000Z',
      state: 'ok',
      creating_job: galaxyJobId,
      visible: true,
      history_id: galaxyHistoryId,
      accessible: true,
      uuid: 'dataset-uuid-1',
      metadata_comment_lines: 0,
      metadata_data_lines: 100,
      misc_blurb: '100 lines',
      peek: 'first line of data',
    }

    const galaxyLayer = createRoutedGalaxyLayer({
      [`api/invocations/${galaxyInvocationId}`]: completedInvocation,
      [`api/jobs/${galaxyJobId}`]: galaxyJob,
      [`api/histories/${galaxyHistoryId}/contents/${galaxyDatasetId}/display`]: createStream(),
      [`api/histories/${galaxyHistoryId}/contents/${galaxyDatasetId}`]: galaxyDataset,
    })

    mockCreateServiceRoleSupabaseClient.mockReturnValue(Effect.succeed(mockClient))
    mockUseGalaxyLayer.mockReturnValue(galaxyLayer)

    const task = await loadTask()
    const result = await task.run({ name: 'galaxy:sync-analyses', payload: { analysisId: 1 }, context: {} })

    expect(result.result!.failed).toBe(0)
    expect(result.result!.synced).toBe(1)

    // Verify the full sync flow touched the expected tables
    expect(calls.from).toContainEqual(['datasets'])
    expect(calls.from).toContainEqual(['analysis_outputs'])
    expect(calls.update).toContainEqual([expect.objectContaining({ state: 'ok', is_sync: true })])
  })

  it('retries a 503 Galaxy response and succeeds on the next attempt', async () => {
    const ownerId = 'owner-uuid-1'
    const analysisId = 1
    const historyId = 10
    const galaxyInvocationId = 'galaxy-invocation-1'
    const galaxyJobId = 'galaxy-job-1'
    const galaxyDatasetId = 'dataset-1'
    const galaxyHistoryId = 'galaxy-history-1'

    const { mockClient, calls, rpcResponses } = createMockSupabaseForIntegration([
      // Task-level query: fetch analysis by id
      { data: { id: analysisId, owner_id: ownerId }, error: null },
      // syncAnalysisEffect: fetch full analysis row
      { data: { id: analysisId, state: 'scheduled', galaxy_id: galaxyInvocationId, history_id: historyId, owner_id: ownerId }, error: null },
      // syncAnalysisEffect: update analysis state (terminal, no stderr fetch because state is completed)
      { data: null, error: null },
      // syncAnalysisEffect: update monitoring outcome
      { data: null, error: null },
      // syncJobEffect: check existing job
      { data: null, error: null },
      // syncJobEffect: insert job and return id
      { data: { id: 100 }, error: null },
      // syncOutputDatasetEffect: check existing output
      { data: null, error: null },
      // syncOutputDatasetEffect: fetch history galaxy_id
      { data: { galaxy_id: galaxyHistoryId }, error: null },
      // syncOutputDatasetEffect: set storage object owner
      { data: null, error: null },
      // syncOutputDatasetEffect: insert dataset and return id
      { data: { id: 200 }, error: null },
      // syncOutputDatasetEffect: insert analysis output
      { data: null, error: null },
      // syncAnalysisEffect: update history state
      { data: null, error: null },
      // syncAnalysisEffect: release lock - delete lock (first attempt finalizer + retry attempt finalizer)
      { data: null, error: null },
      { data: null, error: null },
    ])

    rpcResponses.push(
      // syncAnalysisEffect: acquire_sync_lock RPC (first attempt)
      { data: true, error: null },
      // syncAnalysisEffect: acquire_sync_lock RPC (retry attempt)
      { data: true, error: null },
    )

    const completedInvocation: bt.GalaxyInvocation = {
      model_class: 'WorkflowInvocation',
      id: galaxyInvocationId,
      state: 'completed',
      update_time: '2024-01-01T00:00:00.000Z',
      create_time: '2024-01-01T00:00:00.000Z',
      workflow_id: 'galaxy-workflow-1',
      history_id: galaxyHistoryId,
      uuid: 'invocation-uuid-1',
      steps: [
        {
          model_class: 'WorkflowInvocationStep',
          id: 'step-1',
          update_time: '2024-01-01T00:00:00.000Z',
          job_id: galaxyJobId,
          workflow_step_id: 'ws-1',
          state: 'ok' as bt.JobState,
          order_index: 0,
          workflow_step_label: 'step-one',
          workflow_step_uuid: 'wsu-1',
        },
      ],
      outputs: {
        out1: { id: galaxyDatasetId, src: 'hda', label: 'out1', workflow_step_id: 'ws-1' },
      },
    }

    const galaxyJob: bt.ShowFullJobResponse = {
      model_class: 'Job',
      id: galaxyJobId,
      state: 'ok',
      create_time: '2024-01-01T00:00:00.000Z',
      update_time: '2024-01-01T00:00:00.000Z',
      tool_id: 'test-tool-id',
      exit_code: 0,
      stderr: '',
      stdout: 'Job completed',
      params: {} as Record<string, never>,
    }

    const galaxyDataset: bt.GalaxyDataset = {
      dataset_id: 'galaxy-dataset-1',
      type: 'txt',
      extension: 'txt',
      purged: false,
      deleted: false,
      name: 'Test Dataset',
      file_size: 1024,
      tags: ['tag1', 'tag2'],
      resubmitted: false,
      create_time: '2024-01-01T00:00:00.000Z',
      state: 'ok',
      creating_job: galaxyJobId,
      visible: true,
      history_id: galaxyHistoryId,
      accessible: true,
      uuid: 'dataset-uuid-1',
      metadata_comment_lines: 0,
      metadata_data_lines: 100,
      misc_blurb: '100 lines',
      peek: 'first line of data',
    }

    const galaxyLayer = create503GalaxyLayer(
      {
        [`api/invocations/${galaxyInvocationId}`]: completedInvocation,
        [`api/jobs/${galaxyJobId}`]: galaxyJob,
        [`api/histories/${galaxyHistoryId}/contents/${galaxyDatasetId}/display`]: createStream(),
        [`api/histories/${galaxyHistoryId}/contents/${galaxyDatasetId}`]: galaxyDataset,
      },
      [`api/invocations/${galaxyInvocationId}`],
      { failureCount: 1, statusCode: 503, message: 'Temporary overload' },
    )

    mockCreateServiceRoleSupabaseClient.mockReturnValue(Effect.succeed(mockClient))
    mockUseGalaxyLayer.mockReturnValue(galaxyLayer)

    const task = await loadTask()
    const result = await task.run({ name: 'galaxy:sync-analyses', payload: { analysisId: 1 }, context: {} })

    expect(result.result).toEqual({ synced: 1, failed: 0, skipped: 0, errors: [] })
    expect(calls.from).toContainEqual(['datasets'])
    expect(calls.from).toContainEqual(['analysis_outputs'])
  })

  it('releases the lock and continues the batch when an output-sync DB write fails', async () => {
    const ownerId = 'owner-uuid-1'
    const historyId = 10
    const galaxyInvocationId = 'galaxy-invocation-1'
    const galaxyJobId = 'galaxy-job-1'
    const galaxyDatasetId1 = 'dataset-1'
    const galaxyDatasetId2 = 'dataset-2'
    const galaxyHistoryId = 'galaxy-history-1'

    const { mockClient, calls, rpcResponses } = createMockSupabaseForIntegration([
      // Task-level page query returns two analyses
      { data: [{ id: 1, owner_id: ownerId }, { id: 2, owner_id: ownerId }], error: null },

      // Analysis 1: full flow until analysis_outputs insert fails
      { data: { id: 1, state: 'scheduled', galaxy_id: galaxyInvocationId, history_id: historyId, owner_id: ownerId }, error: null },
      { data: null, error: null }, // update analysis state
      { data: null, error: null }, // update monitoring outcome
      { data: null, error: null }, // syncJobEffect: check existing job
      { data: { id: 100 }, error: null }, // syncJobEffect: insert job
      { data: null, error: null }, // syncOutputDatasetEffect: check existing output
      { data: { galaxy_id: galaxyHistoryId }, error: null }, // syncOutputDatasetEffect: fetch history galaxy_id
      { data: null, error: null }, // syncOutputDatasetEffect: set storage object owner
      { data: { id: 200 }, error: null }, // syncOutputDatasetEffect: insert dataset
      { data: null, error: { message: 'analysis_outputs insert failed' } }, // syncOutputDatasetEffect: insert analysis_outputs fails
      { data: null, error: null }, // analysis 1 finalizer: release lock

      // Analysis 2: full success
      { data: { id: 2, state: 'scheduled', galaxy_id: galaxyInvocationId, history_id: historyId, owner_id: ownerId }, error: null },
      { data: null, error: null }, // update analysis state
      { data: null, error: null }, // update monitoring outcome
      { data: null, error: null }, // syncJobEffect: check existing job
      { data: { id: 101 }, error: null }, // syncJobEffect: insert job
      { data: null, error: null }, // syncOutputDatasetEffect: check existing output
      { data: { galaxy_id: galaxyHistoryId }, error: null }, // syncOutputDatasetEffect: fetch history galaxy_id
      { data: null, error: null }, // syncOutputDatasetEffect: set storage object owner
      { data: { id: 201 }, error: null }, // syncOutputDatasetEffect: insert dataset
      { data: null, error: null }, // syncOutputDatasetEffect: insert analysis_outputs
      { data: null, error: null }, // syncAnalysisEffect: update history state
      { data: null, error: null }, // analysis 2 finalizer: release lock
    ])

    rpcResponses.push(
      { data: true, error: null }, // analysis 1 acquire_sync_lock
      { data: true, error: null }, // analysis 2 acquire_sync_lock
    )

    function createCompletedInvocation(datasetId: string): bt.GalaxyInvocation {
      return {
        model_class: 'WorkflowInvocation',
        id: galaxyInvocationId,
        state: 'completed',
        update_time: '2024-01-01T00:00:00.000Z',
        create_time: '2024-01-01T00:00:00.000Z',
        workflow_id: 'galaxy-workflow-1',
        history_id: galaxyHistoryId,
        uuid: 'invocation-uuid-1',
        steps: [
          {
            model_class: 'WorkflowInvocationStep',
            id: 'step-1',
            update_time: '2024-01-01T00:00:00.000Z',
            job_id: galaxyJobId,
            workflow_step_id: 'ws-1',
            state: 'ok' as bt.JobState,
            order_index: 0,
            workflow_step_label: 'step-one',
            workflow_step_uuid: 'wsu-1',
          },
        ],
        outputs: {
          out1: { id: datasetId, src: 'hda', label: 'out1', workflow_step_id: 'ws-1' },
        },
      }
    }

    const galaxyJob: bt.ShowFullJobResponse = {
      model_class: 'Job',
      id: galaxyJobId,
      state: 'ok',
      create_time: '2024-01-01T00:00:00.000Z',
      update_time: '2024-01-01T00:00:00.000Z',
      tool_id: 'test-tool-id',
      exit_code: 0,
      stderr: '',
      stdout: 'Job completed',
      params: {} as Record<string, never>,
    }

    function createGalaxyDataset(datasetId: string): bt.GalaxyDataset {
      return {
        dataset_id: 'galaxy-dataset-1',
        type: 'txt',
        extension: 'txt',
        purged: false,
        deleted: false,
        name: 'Test Dataset',
        file_size: 1024,
        tags: ['tag1', 'tag2'],
        resubmitted: false,
        create_time: '2024-01-01T00:00:00.000Z',
        state: 'ok',
        creating_job: galaxyJobId,
        visible: true,
        history_id: galaxyHistoryId,
        accessible: true,
        uuid: 'dataset-uuid-1',
        metadata_comment_lines: 0,
        metadata_data_lines: 100,
        misc_blurb: '100 lines',
        peek: 'first line of data',
        id: datasetId,
      } as unknown as bt.GalaxyDataset
    }

    const galaxyLayer = createRoutedGalaxyLayer({
      [`api/invocations/${galaxyInvocationId}`]: [
        createCompletedInvocation(galaxyDatasetId1),
        createCompletedInvocation(galaxyDatasetId2),
      ],
      [`api/jobs/${galaxyJobId}`]: galaxyJob,
      [`api/histories/${galaxyHistoryId}/contents/${galaxyDatasetId1}/display`]: createStream(),
      [`api/histories/${galaxyHistoryId}/contents/${galaxyDatasetId1}`]: createGalaxyDataset(galaxyDatasetId1),
      [`api/histories/${galaxyHistoryId}/contents/${galaxyDatasetId2}/display`]: createStream(),
      [`api/histories/${galaxyHistoryId}/contents/${galaxyDatasetId2}`]: createGalaxyDataset(galaxyDatasetId2),
    })

    mockCreateServiceRoleSupabaseClient.mockReturnValue(Effect.succeed(mockClient))
    mockUseGalaxyLayer.mockReturnValue(galaxyLayer)

    const task = await loadTask()
    const result = await task.run({ name: 'galaxy:sync-analyses', payload: {}, context: {} })

    expect(result.result).toMatchObject({
      synced: 1,
      failed: 1,
      skipped: 0,
      errors: [{ analysisId: 1, message: expect.stringContaining('analysis_outputs insert failed') }],
    })
    expect(calls.delete).toHaveLength(2)
  })
})
