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
import { createFailingGalaxyLayer, createMockGalaxyLayer, createRecordingRoutedGalaxyLayer, createRoutedGalaxyLayer } from '../../../fixtures'

// Sibling helpers are imported from the implementation under test.
const { syncAnalysisEffect, isTransientError } = await import(
  '../../../../../src/runtime/server/utils/grizzle/sync/analysis',
)

vi.mock('../../../../../src/runtime/server/utils/grizzle/sync/lock', () => ({
  acquireSyncLock: vi.fn<typeof acquireSyncLock>(),
  releaseSyncLock: vi.fn<typeof releaseSyncLock>(),
}))

// Only the Galaxy round trip is doubled. `selectRecordedJobsEffect` and
// `isRecordedJobCurrent` stay real, because what they read off the Supabase
// double is exactly what these tests are about.
vi.mock('../../../../../src/runtime/server/utils/grizzle/sync/job', async importOriginal => ({
  ...await importOriginal<typeof import('../../../../../src/runtime/server/utils/grizzle/sync/job')>(),
  syncJobEffect: vi.fn<typeof syncJobEffect>(),
}))

vi.mock('../../../../../src/runtime/server/utils/grizzle/sync/output', () => ({
  syncOutputDatasetEffect: vi.fn<typeof syncOutputDatasetEffect>(),
}))

interface MockSupabaseConfig {
  analysisSelectResult?: { data: unknown, error: unknown }
  jobsStderrResult?: { data: unknown, error: unknown }
  /** The job rows a previous sync recorded, as `selectRecordedJobsEffect` reads them. */
  recordedJobsResult?: { data: unknown, error: unknown }
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
  let currentColumns: string | null = null
  let chain: Record<string, unknown>

  const recordCall = (method: string, ...args: unknown[]) => {
    (calls[method] ??= []).push(args)
    return chain
  }

  const resolveResult = () => {
    if (currentAction === 'select' && currentTable === 'analyses')
      return config.analysisSelectResult ?? { data: null, error: null }
    if (currentAction === 'select' && currentTable === 'jobs') {
      // Two queries read `jobs`: the stderr of the analysis's first failed
      // job, and every recorded row of the analysis. Only the columns tell
      // them apart, so a third one is named here or it silently reads as an
      // analysis with no recorded job.
      if (currentColumns === 'stderr')
        return config.jobsStderrResult ?? { data: null, error: null }
      if (currentColumns === 'id, galaxy_id, state, update_time')
        return config.recordedJobsResult ?? { data: [], error: null }
      throw new Error(`the Supabase double has no answer for \`jobs.select('${currentColumns}')\``)
    }
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
      currentColumns = columns
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

  // Shared by every describe below: a mapped step, a subworkflow step and an
  // ordinary one differ only in what Galaxy hangs off the same step shape.

  function step(overrides: Partial<bt.GalaxyInvocationStep> = {}): bt.GalaxyInvocationStep {
    return {
      model_class: 'WorkflowInvocationStep',
      id: 'step-1',
      update_time: '2024-01-01T00:00:00.000Z',
      job_id: null,
      workflow_step_id: 'ws-1',
      subworkflow_invocation_id: null,
      state: 'scheduled',
      order_index: 1,
      workflow_step_label: 'a step',
      workflow_step_uuid: 'wsu-1',
      ...overrides,
    }
  }

  function job(id: string): bt.GalaxyInvocationStepJob {
    return { model_class: 'Job', id, state: 'ok' as bt.JobState }
  }

  function invocationWith(steps: bt.GalaxyInvocationStep[]): bt.GalaxyInvocation {
    return { ...scheduledInvocation, state: 'completed', steps }
  }

  /** The `(galaxy job id, step id)` pairs `syncJobEffect` was asked to write. */
  function syncedJobs(): [string, number][] {
    return vi.mocked(syncJobEffect).mock.calls.map(call => [call[0], call[1]])
  }

  const galaxyUpdateTime = '2024-05-06T07:08:09.123456'
  const recordedUpdateTime = '2024-05-06T07:08:09.123+00:00'

  /** A job as the step's own `jobs` array carries it on 22.05: no `tool_id`. */
  function reportedJob(
    galaxyJobId: string,
    overrides: Partial<bt.GalaxyInvocationStepJob> = {},
  ): bt.GalaxyInvocationStepJob {
    return {
      model_class: 'Job',
      id: galaxyJobId,
      state: 'ok' as bt.JobState,
      update_time: galaxyUpdateTime,
      ...overrides,
    }
  }

  /** The row a previous sync wrote for that job, as Postgres hands it back. */
  function recordedRow(
    id: number,
    galaxyJobId: string,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id,
      galaxy_id: galaxyJobId,
      state: 'ok',
      update_time: recordedUpdateTime,
      ...overrides,
    }
  }

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
          subworkflow_invocation_id: null,
          state: 'scheduled',
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
          subworkflow_invocation_id: null,
          state: 'scheduled',
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

  describe('a step that maps over a collection', () => {
    // The outer `beforeEach` re-arms the doubles but keeps their call log, and
    // every assertion here reads that log.
    beforeEach(() => {
      vi.mocked(syncJobEffect).mockClear()
      vi.mocked(syncOutputDatasetEffect).mockClear()
    })

    /**
     * What Galaxy returns for a mapped step: no `job_id`, and every job of
     * the implicit collection under `jobs`, all at the one `order_index`.
     */
    function mappedStep(galaxyJobIds: string[]): bt.GalaxyInvocationStep {
      return step({
        id: 'step-mapped',
        workflow_step_id: 'ws-mapped',
        order_index: 3,
        workflow_step_label: 'map over inputs',
        jobs: galaxyJobIds.map(job),
      })
    }

    it('asks Galaxy for step details, without which a mapped step reports no jobs', async () => {
      const { layer, requests } = createRecordingRoutedGalaxyLayer({
        'api/invocations/': invocationWith([]),
      })
      const supabase = createMockSupabase({
        analysisSelectResult: { data: baseAnalysisRow, error: null },
      })

      await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

      expect(requests[0]?.query).toEqual({ step_details: true })
    })

    it('records one job row per element, all at the step order_index', async () => {
      const supabase = createMockSupabase({
        analysisSelectResult: { data: baseAnalysisRow, error: null },
      })
      const layer = createMockGalaxyLayer(
        invocationWith([mappedStep(['job-a', 'job-b', 'job-c'])]),
      )

      await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

      expect(syncedJobs()).toEqual([
        ['job-a', 3],
        ['job-b', 3],
        ['job-c', 3],
      ])
    })

    it('records the one job of an unmapped step exactly once, not once per source', async () => {
      const supabase = createMockSupabase({
        analysisSelectResult: { data: baseAnalysisRow, error: null },
      })
      // Galaxy reports an ordinary step's job in both places. Reading both
      // would write the same galaxy id twice, which `jobs.galaxy_id` refuses.
      const layer = createMockGalaxyLayer(invocationWith([
        step({ job_id: 'galaxy-job-1', jobs: [job('galaxy-job-1')] }),
      ]))

      await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

      expect(syncedJobs()).toEqual([['galaxy-job-1', 1]])
    })

    it('falls back to job_id when a step carries no jobs array', async () => {
      const supabase = createMockSupabase({
        analysisSelectResult: { data: baseAnalysisRow, error: null },
      })
      const layer = createMockGalaxyLayer(invocationWith([
        step({ job_id: 'galaxy-job-1', order_index: 2 }),
      ]))

      await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

      expect(syncedJobs()).toEqual([['galaxy-job-1', 2]])
    })

    it('falls back to job_id when the jobs array is empty, rather than dropping the job', async () => {
      const supabase = createMockSupabase({
        analysisSelectResult: { data: baseAnalysisRow, error: null },
      })
      const layer = createMockGalaxyLayer(invocationWith([
        step({ job_id: 'galaxy-job-1', jobs: [], order_index: 2 }),
      ]))

      await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

      expect(syncedJobs()).toEqual([['galaxy-job-1', 2]])
    })

    it('records nothing for a step that ran no job', async () => {
      const supabase = createMockSupabase({
        analysisSelectResult: { data: baseAnalysisRow, error: null },
      })
      const layer = createMockGalaxyLayer(invocationWith([
        step({ id: 'step-0', workflow_step_id: 'ws-0', order_index: 0, jobs: [] }),
      ]))

      await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

      expect(syncJobEffect).not.toHaveBeenCalled()
    })

    it('leaves a mapped step out of the output-dataset sync, which takes one job', async () => {
      const supabase = createMockSupabase({
        analysisSelectResult: { data: baseAnalysisRow, error: null },
      })
      const layer = createMockGalaxyLayer({
        ...invocationWith([mappedStep(['job-a', 'job-b'])]),
        outputs: {
          out1: { id: 'dataset-1', src: 'hda', label: 'out1', workflow_step_id: 'ws-mapped' },
        },
      })

      await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

      expect(syncJobEffect).toHaveBeenCalledTimes(2)
      expect(syncOutputDatasetEffect).not.toHaveBeenCalled()
    })

    describe('re-syncing jobs the invocation reports unchanged', () => {
      // The sync polls until the invocation is terminal, so a mapped step over
      // thirty inputs asked Galaxy for the same thirty jobs every poll (#106).
      // `step_details=true` already reports each job's state and update time,
      // which is enough to tell an unchanged job from a changed one.
      function mappedStepReporting(galaxyJobIds: string[]): bt.GalaxyInvocationStep {
        return step({
          id: 'step-mapped',
          workflow_step_id: 'ws-mapped',
          order_index: 3,
          workflow_step_label: 'map over inputs',
          jobs: galaxyJobIds.map(id => reportedJob(id)),
        })
      }

      const threeUnchanged = [
        recordedRow(201, 'job-a'),
        recordedRow(202, 'job-b'),
        recordedRow(203, 'job-c'),
      ]

      it('fetches no job of a mapped step whose every element is unchanged', async () => {
        const supabase = createMockSupabase({
          analysisSelectResult: { data: baseAnalysisRow, error: null },
          recordedJobsResult: { data: threeUnchanged, error: null },
        })
        const layer = createMockGalaxyLayer(
          invocationWith([mappedStepReporting(['job-a', 'job-b', 'job-c'])]),
        )

        await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

        expect(syncJobEffect).not.toHaveBeenCalled()
      })

      it('fetches the one job whose state moved on', async () => {
        const supabase = createMockSupabase({
          analysisSelectResult: { data: baseAnalysisRow, error: null },
          recordedJobsResult: {
            data: [
              recordedRow(201, 'job-a'),
              recordedRow(202, 'job-b', { state: 'running' }),
              recordedRow(203, 'job-c'),
            ],
            error: null,
          },
        })
        const layer = createMockGalaxyLayer(
          invocationWith([mappedStepReporting(['job-a', 'job-b', 'job-c'])]),
        )

        await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

        expect(syncedJobs()).toEqual([['job-b', 3]])
      })

      it('fetches the one job Galaxy has touched since', async () => {
        const supabase = createMockSupabase({
          analysisSelectResult: { data: baseAnalysisRow, error: null },
          recordedJobsResult: {
            data: [
              recordedRow(201, 'job-a'),
              recordedRow(202, 'job-b'),
              recordedRow(203, 'job-c', { update_time: '2024-05-06T07:00:00+00:00' }),
            ],
            error: null,
          },
        })
        const layer = createMockGalaxyLayer(
          invocationWith([mappedStepReporting(['job-a', 'job-b', 'job-c'])]),
        )

        await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

        expect(syncedJobs()).toEqual([['job-c', 3]])
      })

      it('fetches a job it has no row for, which 22.05 reports without a tool_id', async () => {
        const supabase = createMockSupabase({
          analysisSelectResult: { data: baseAnalysisRow, error: null },
          recordedJobsResult: {
            data: [recordedRow(201, 'job-a'), recordedRow(202, 'job-b')],
            error: null,
          },
        })
        const mapped = mappedStepReporting(['job-a', 'job-b', 'job-c'])
        const layer = createMockGalaxyLayer(invocationWith([mapped]))

        await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

        // `jobs.tool_id` is notNull() and the step's entry carries none on
        // 22.05, so the row can only come from `GET /api/jobs/{id}`.
        expect(mapped.jobs?.every(job => job.tool_id === undefined)).toBe(true)
        expect(syncedJobs()).toEqual([['job-c', 3]])
      })

      it('fetches a job reported only by job_id, which says nothing to compare', async () => {
        const supabase = createMockSupabase({
          analysisSelectResult: { data: baseAnalysisRow, error: null },
          recordedJobsResult: { data: [recordedRow(205, 'galaxy-job-1')], error: null },
        })
        const layer = createMockGalaxyLayer(invocationWith([
          step({ job_id: 'galaxy-job-1', order_index: 2 }),
        ]))

        await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

        expect(syncedJobs()).toEqual([['galaxy-job-1', 2]])
      })

      it('reads the recorded rows in one query for the whole sync', async () => {
        const supabase = createMockSupabase({
          analysisSelectResult: { data: baseAnalysisRow, error: null },
          recordedJobsResult: { data: threeUnchanged, error: null },
        })
        const layer = createMockGalaxyLayer(
          invocationWith([mappedStepReporting(['job-a', 'job-b', 'job-c'])]),
        )

        await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

        const { __calls: calls } = supabase
        const recordedJobsSelects = callsTo(calls, 'select').filter(
          call => call[0] === 'id, galaxy_id, state, update_time',
        )
        expect(recordedJobsSelects).toHaveLength(1)
        expect(calls.eq).toContainEqual(['analysis_id', analysisId])
      })

      it('attaches an output dataset to the recorded row of a job it did not fetch', async () => {
        const supabase = createMockSupabase({
          analysisSelectResult: { data: baseAnalysisRow, error: null },
          recordedJobsResult: { data: [recordedRow(205, 'galaxy-job-1')], error: null },
        })
        const layer = createMockGalaxyLayer({
          ...invocationWith([
            step({ job_id: 'galaxy-job-1', jobs: [reportedJob('galaxy-job-1')] }),
          ]),
          outputs: {
            out1: { id: 'dataset-1', src: 'hda', label: 'out1', workflow_step_id: 'ws-1' },
          },
        })

        await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

        expect(syncJobEffect).not.toHaveBeenCalled()
        expect(syncOutputDatasetEffect).toHaveBeenCalledWith(
          'dataset-1',
          analysisId,
          historyId,
          205,
          ownerId,
          supabase,
          layer,
        )
      })
    })
  })

  describe('a step that embeds a subworkflow', () => {
    // The outer `beforeEach` re-arms the doubles but keeps their call log, and
    // every assertion here reads that log.
    beforeEach(() => {
      vi.mocked(syncJobEffect).mockClear()
      vi.mocked(syncOutputDatasetEffect).mockClear()
    })

    const subworkflowInvocationId = 'galaxy-subworkflow-invocation-1'
    const deeperInvocationId = 'galaxy-subworkflow-invocation-2'

    /**
     * What Galaxy returns for a subworkflow step: `job_id: null`, no `jobs`
     * however `step_details` was asked for, and the id of the separate
     * invocation its own steps ran under.
     */
    function subworkflowStep(overrides: Partial<bt.GalaxyInvocationStep> = {}): bt.GalaxyInvocationStep {
      return step({
        id: 'step-sub',
        workflow_step_id: 'ws-sub',
        order_index: 2,
        workflow_step_label: 'run the subworkflow',
        subworkflow_invocation_id: subworkflowInvocationId,
        ...overrides,
      })
    }

    /** A subworkflow's own invocation, which is an ordinary invocation under its own id. */
    function subworkflowInvocation(id: string, steps: bt.GalaxyInvocationStep[]): bt.GalaxyInvocation {
      return { ...invocationWith(steps), id }
    }

    /** An ordinary tool step of a subworkflow, at the index it has *inside* it. */
    function nestedToolStep(orderIndex: number, galaxyJobId: string): bt.GalaxyInvocationStep {
      return step({
        id: `step-${galaxyJobId}`,
        workflow_step_id: `ws-${galaxyJobId}`,
        order_index: orderIndex,
        job_id: galaxyJobId,
        jobs: [job(galaxyJobId)],
      })
    }

    it('records the jobs of the separate invocation a subworkflow ran under, which the step itself reports none of', async () => {
      const supabase = createMockSupabase({
        analysisSelectResult: { data: baseAnalysisRow, error: null },
      })
      const layer = createRoutedGalaxyLayer({
        [`api/invocations/${subworkflowInvocationId}`]: subworkflowInvocation(subworkflowInvocationId, [
          nestedToolStep(0, 'nested-job-a'),
          nestedToolStep(1, 'nested-job-b'),
        ]),
        [`api/invocations/${galaxyInvocationId}`]: invocationWith([subworkflowStep()]),
      })

      await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

      // Both at 2 — the *outer* step's `order_index`, not the 0 and 1 they
      // carry inside the subworkflow, which name outer steps 0 and 1.
      expect(syncedJobs()).toEqual([
        ['nested-job-a', 2],
        ['nested-job-b', 2],
      ])
    })

    it('keeps a nested job apart from the job of the outer step at that index', async () => {
      const supabase = createMockSupabase({
        analysisSelectResult: { data: baseAnalysisRow, error: null },
      })
      const layer = createRoutedGalaxyLayer({
        [`api/invocations/${subworkflowInvocationId}`]: subworkflowInvocation(subworkflowInvocationId, [
          nestedToolStep(0, 'nested-job-a'),
        ]),
        [`api/invocations/${galaxyInvocationId}`]: invocationWith([
          step({ order_index: 0, job_id: 'outer-job-0', jobs: [job('outer-job-0')] }),
          subworkflowStep(),
        ]),
      })

      await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

      // The nested step's own index is 0, and so is the outer tool step's.
      // Recorded under the subworkflow step's index instead, the two cannot
      // be confused: a subworkflow step runs no job of its own, so every row
      // at index 2 came from inside it.
      expect(syncedJobs()).toEqual([
        ['outer-job-0', 0],
        ['nested-job-a', 2],
      ])
    })

    it('records the jobs of a subworkflow nested two deep', async () => {
      const supabase = createMockSupabase({
        analysisSelectResult: { data: baseAnalysisRow, error: null },
      })
      const layer = createRoutedGalaxyLayer({
        [`api/invocations/${deeperInvocationId}`]: subworkflowInvocation(deeperInvocationId, [
          nestedToolStep(0, 'deeper-job'),
        ]),
        [`api/invocations/${subworkflowInvocationId}`]: subworkflowInvocation(subworkflowInvocationId, [
          nestedToolStep(0, 'nested-job-a'),
          subworkflowStep({
            id: 'step-sub-sub',
            workflow_step_id: 'ws-sub-sub',
            order_index: 1,
            subworkflow_invocation_id: deeperInvocationId,
          }),
        ]),
        [`api/invocations/${galaxyInvocationId}`]: invocationWith([subworkflowStep()]),
      })

      await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

      // The whole subtree belongs to the one outer step, at whatever depth.
      expect(syncedJobs()).toEqual([
        ['nested-job-a', 2],
        ['deeper-job', 2],
      ])
    })

    it('asks for the subworkflow invocation with step details, as it asks for the outer one', async () => {
      const supabase = createMockSupabase({
        analysisSelectResult: { data: baseAnalysisRow, error: null },
      })
      const { layer, requests } = createRecordingRoutedGalaxyLayer({
        [`api/invocations/${subworkflowInvocationId}`]: subworkflowInvocation(subworkflowInvocationId, [
          nestedToolStep(0, 'nested-job-a'),
        ]),
        [`api/invocations/${galaxyInvocationId}`]: invocationWith([subworkflowStep()]),
      })

      await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

      // Without it a mapped step *inside* the subworkflow reports `job_id:
      // null` and says nothing about its elements' jobs — #84 one level down.
      const subRequest = requests.find(request => request.url.includes(subworkflowInvocationId))
      expect(subRequest?.query).toEqual({ step_details: true })
    })

    it('fetches nothing extra for a step that embeds no workflow', async () => {
      const supabase = createMockSupabase({
        analysisSelectResult: { data: baseAnalysisRow, error: null },
      })
      const { layer, requests } = createRecordingRoutedGalaxyLayer({
        [`api/invocations/${galaxyInvocationId}`]: invocationWith([
          step({ order_index: 0, job_id: 'outer-job-0', jobs: [job('outer-job-0')] }),
        ]),
      })

      await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

      expect(requests).toHaveLength(1)
    })

    it('walks an invocation once, so a subworkflow naming one already walked cannot loop', async () => {
      const supabase = createMockSupabase({
        analysisSelectResult: { data: baseAnalysisRow, error: null },
      })
      const { layer, requests } = createRecordingRoutedGalaxyLayer({
        [`api/invocations/${subworkflowInvocationId}`]: subworkflowInvocation(subworkflowInvocationId, [
          nestedToolStep(0, 'nested-job-a'),
          // Galaxy cannot produce this, and a walk with no guard would never
          // return from it.
          subworkflowStep({
            id: 'step-sub-loop',
            workflow_step_id: 'ws-sub-loop',
            order_index: 1,
            subworkflow_invocation_id: subworkflowInvocationId,
          }),
          subworkflowStep({
            id: 'step-sub-root',
            workflow_step_id: 'ws-sub-root',
            order_index: 2,
            subworkflow_invocation_id: galaxyInvocationId,
          }),
        ]),
        [`api/invocations/${galaxyInvocationId}`]: invocationWith([subworkflowStep()]),
      })

      await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

      expect(syncedJobs()).toEqual([['nested-job-a', 2]])
      expect(requests.map(request => request.url)).toEqual([
        `api/invocations/${galaxyInvocationId}`,
        `api/invocations/${subworkflowInvocationId}`,
      ])
    })

    it('writes no nested row again for a job the subworkflow invocation reports unchanged', async () => {
      const supabase = createMockSupabase({
        analysisSelectResult: { data: baseAnalysisRow, error: null },
        recordedJobsResult: { data: [recordedRow(301, 'nested-job-a')], error: null },
      })
      const layer = createRoutedGalaxyLayer({
        [`api/invocations/${subworkflowInvocationId}`]: subworkflowInvocation(subworkflowInvocationId, [
          step({
            id: 'step-nested-a',
            workflow_step_id: 'ws-nested-a',
            order_index: 0,
            job_id: 'nested-job-a',
            jobs: [reportedJob('nested-job-a')],
          }),
          step({
            id: 'step-nested-b',
            workflow_step_id: 'ws-nested-b',
            order_index: 1,
            job_id: 'nested-job-b',
            jobs: [reportedJob('nested-job-b', { state: 'running' as bt.JobState })],
          }),
        ]),
        [`api/invocations/${galaxyInvocationId}`]: invocationWith([subworkflowStep()]),
      })

      await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

      // #106 reaches a nested job for free: `recordedJobs` is keyed by Galaxy
      // job id over the whole analysis, so a re-sync neither refetches an
      // unchanged nested job nor writes a second row for it. `nested-job-b`,
      // which has no row, is the control: the walk did happen.
      expect(syncedJobs()).toEqual([['nested-job-b', 2]])
    })

    it('leaves the output sync to the outer step, which a subworkflow step has no job for', async () => {
      const supabase = createMockSupabase({
        analysisSelectResult: { data: baseAnalysisRow, error: null },
      })
      const layer = createRoutedGalaxyLayer({
        [`api/invocations/${subworkflowInvocationId}`]: subworkflowInvocation(subworkflowInvocationId, [
          nestedToolStep(0, 'nested-job-a'),
        ]),
        [`api/invocations/${galaxyInvocationId}`]: {
          ...invocationWith([subworkflowStep()]),
          outputs: {
            out1: { id: 'dataset-1', src: 'hda', label: 'out1', workflow_step_id: 'ws-sub' },
          },
        },
      })

      await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig))

      // `analysis_outputs.job_id` names one job. Attaching the labelled
      // output to whichever nested job happened to be alone would be a choice
      // a second nested job silently reverses, so a subworkflow step attaches
      // none — as it did before its jobs were recorded at all.
      expect(syncJobEffect).toHaveBeenCalledTimes(1)
      expect(syncOutputDatasetEffect).not.toHaveBeenCalled()
    })

    it('fails the sync when the subworkflow invocation cannot be fetched, rather than dropping its jobs', async () => {
      const supabase = createMockSupabase({
        analysisSelectResult: { data: baseAnalysisRow, error: null },
      })
      const layer = createRoutedGalaxyLayer({
        [`api/invocations/${subworkflowInvocationId}`]: new Error('Invocation not found'),
        [`api/invocations/${galaxyInvocationId}`]: invocationWith([subworkflowStep()]),
      })

      await expect(
        Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, defaultSyncConfig)),
      ).rejects.toThrow(/Failed to fetch subworkflow invocation/)
    })
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
          subworkflow_invocation_id: null,
          state: 'scheduled',
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
