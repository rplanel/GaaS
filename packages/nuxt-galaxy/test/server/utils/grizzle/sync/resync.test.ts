import type { SupabaseClient } from '@supabase/supabase-js'
import type * as bt from 'blendtype'
import type { Database } from '../../../../../src/runtime/types/database'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { syncAnalysisEffect } from '../../../../../src/runtime/server/utils/grizzle/sync/analysis'
import { createRecordingGalaxyLayer, mockGalaxyJob } from '../../../fixtures'

/**
 * Two syncs of one mapped analysis, with nothing doubled between
 * `syncAnalysisEffect` and Galaxy: the real `syncJobEffect`, the real lock, and
 * a Supabase double that keeps the rows the first sync writes so the second
 * reads them back. That is the only way to count what a re-sync costs (#106) —
 * the unit tests double `syncJobEffect` and so cannot see a Galaxy call.
 */

const ownerId = 'owner-uuid-1'
const analysisId = 1
const historyId = 10
const galaxyInvocationId = 'galaxy-invocation-1'

const syncConfig = {
  lockTtlSeconds: 900,
  batchSize: 20,
  maxRetries: 3,
  retryBaseDelayMs: 1,
  retryMaxDelayMs: 2,
}

/** A row as Postgres holds it: `timestamptz` read back with an explicit offset. */
type Row = Record<string, unknown>

/**
 * A Supabase double that stores what it is given.
 *
 * Only what this sync path asks of it: `eq` filters, whole-row selects,
 * serial ids on insert, and a merge on update. `select()` projects nothing —
 * a caller reading a column it did not ask for is not a failure worth
 * modelling here.
 */
function createStatefulSupabase(tables: Record<string, Row[]>) {
  const store: Record<string, Row[]> = { sync_locks: [], analysis_monitoring: [], ...tables }
  let nextId = 100

  const rowsOf = (table: string) => (store[table] ??= [])

  const table = (name: string) => {
    const filters: [string, unknown][] = []
    let action: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: Row = {}

    const matches = (row: Row) => filters.every(([column, value]) => row[column] === value)

    const run = (): { data: Row[] | null, error: unknown } => {
      const rows = rowsOf(name)
      switch (action) {
        case 'insert': {
          const inserted = { id: nextId++, ...payload }
          rows.push(inserted)
          return { data: [inserted], error: null }
        }
        case 'update': {
          for (const row of rows.filter(matches)) Object.assign(row, payload)
          return { data: null, error: null }
        }
        case 'delete': {
          store[name] = rows.filter(row => !matches(row))
          return { data: null, error: null }
        }
        case 'select':
          return { data: rows.filter(matches), error: null }
      }
    }

    const first = () => {
      const { data, error } = run()
      return { data: data?.[0] ?? null, error }
    }

    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (values: Row) => {
        action = 'insert'
        payload = values
        return chain
      },
      update: (values: Row) => {
        action = 'update'
        payload = values
        return chain
      },
      delete: () => {
        action = 'delete'
        return chain
      },
      eq: (column: string, value: unknown) => {
        filters.push([column, value])
        return chain
      },
      not: () => chain,
      neq: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => Promise.resolve(first()),
      maybeSingle: () => Promise.resolve(first()),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(run())),
    }
    return chain
  }

  const client = {
    schema: () => client,
    from: (name: string) => table(name),
    // The lock is real, so the RPC behind it has to answer.
    rpc: (_name: string, _params?: unknown) => Promise.resolve({ data: true, error: null }),
  }

  return {
    /** The rows a table holds now; `delete` replaces the array it stored. */
    rows: (name: string) => store[name] ?? [],
    supabase: client as unknown as SupabaseClient<Database>,
  }
}

const analysisRow = {
  id: analysisId,
  state: 'scheduled',
  galaxy_id: galaxyInvocationId,
  history_id: historyId,
  owner_id: ownerId,
  sync_attempts: 0,
}

/**
 * A job as the step's own `jobs` array reports it under `step_details=true`,
 * with the `update_time` required rather than optional: `GET /api/jobs/{id}`
 * answers with the same instant, and that response type demands one.
 */
type ReportedJob = bt.GalaxyInvocationStepJob & { update_time: string }

function reportedJob(id: string, state: bt.JobState, updateTime: string): ReportedJob {
  return { model_class: 'Job', id, state, update_time: updateTime }
}

/** A mapped step: no `job_id`, one job per element, all at one `order_index`. */
function invocationWith(jobs: ReportedJob[]): bt.GalaxyInvocation {
  return {
    model_class: 'WorkflowInvocation',
    id: galaxyInvocationId,
    state: 'scheduled',
    update_time: '2024-05-06T07:00:00',
    create_time: '2024-05-06T06:00:00',
    workflow_id: 'galaxy-workflow-1',
    history_id: 'galaxy-history-1',
    uuid: 'invocation-uuid-1',
    steps: [
      {
        model_class: 'WorkflowInvocationStep',
        id: 'step-mapped',
        update_time: '2024-05-06T07:00:00',
        job_id: null,
        workflow_step_id: 'ws-mapped',
        subworkflow_invocation_id: null,
        state: 'scheduled',
        order_index: 3,
        workflow_step_label: 'map over inputs',
        workflow_step_uuid: 'wsu-mapped',
        jobs,
      },
    ],
    outputs: {},
  }
}

/**
 * Galaxy reports the jobs as naive timestamps, the shape it really serialises;
 * `GET /api/jobs/{id}` answers with the same instants.
 */
const firstPoll = [
  reportedJob('job-a', 'ok', '2024-05-06T07:08:09.100000'),
  reportedJob('job-b', 'ok', '2024-05-06T07:08:09.200000'),
  reportedJob('job-c', 'running', '2024-05-06T07:08:09.300000'),
]
/** Between the polls only `job-c` moved on. */
const secondPoll = [
  firstPoll[0]!,
  firstPoll[1]!,
  reportedJob('job-c', 'ok', '2024-05-06T07:11:00.000000'),
]

/** A step that is still running keeps the invocation non-terminal, so it polls. */
const runningJobsSummary: bt.InvocationJobsSummary = {
  model: 'WorkflowInvocation',
  id: galaxyInvocationId,
  states: { ok: 2, running: 1 },
  populated_state: 'ok',
}

describe('re-syncing a mapped analysis', () => {
  it('fetches every job once, then only the job that changed', async () => {
    const { rows, supabase } = createStatefulSupabase({
      analyses: [{ ...analysisRow }],
      histories: [{ id: historyId, state: 'new', is_sync: false }],
      jobs: [],
    })

    let poll = firstPoll
    const { calls, layer } = createRecordingGalaxyLayer((call) => {
      if (call.url.includes('jobs_summary'))
        return runningJobsSummary
      if (call.url.includes('api/invocations/'))
        return invocationWith(poll)
      const galaxyJobId = call.url.replace(/^.*api\/jobs\//, '').replace(/\?.*$/, '')
      const reported = poll.find(job => job.id === galaxyJobId)
      if (!reported)
        return new Error(`No mock job for URL: ${call.url}`)
      return {
        ...mockGalaxyJob,
        id: galaxyJobId,
        state: reported.state,
        update_time: reported.update_time,
      } satisfies bt.ShowFullJobResponse
    })

    const jobUrls = () => calls.filter(call => call.url.includes('api/jobs/')).map(call => call.url)

    await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, syncConfig))

    expect(jobUrls()).toHaveLength(3)
    expect(rows('jobs')).toHaveLength(3)

    // The second poll: same invocation, same three jobs, one of them moved on.
    const firstSyncJobUrls = jobUrls().length
    poll = secondPoll
    calls.length = 0

    await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, syncConfig))

    expect(firstSyncJobUrls).toBe(3)
    expect(jobUrls()).toEqual(['api/jobs/job-c?full=true'])
    // The invocation itself is still read every poll — that is the one call
    // #106 leaves in place, and it is what reports the jobs.
    expect(calls.filter(call => call.url.includes('api/invocations/'))).toHaveLength(2)

    // Still one row per element, and the changed one was written.
    expect(rows('jobs')).toHaveLength(3)
    expect(rows('jobs').map(row => [row.galaxy_id, row.state, row.is_sync])).toEqual([
      ['job-a', 'ok', true],
      ['job-b', 'ok', true],
      ['job-c', 'ok', true],
    ])
    // Every row carries the `tool_id` the fetch returned, and the step's own
    // entries carry none — which is why a job with no row has to be fetched:
    // `jobs.tool_id` is notNull(), and 22.05 reports it nowhere else.
    expect(secondPoll.every(job => !('tool_id' in job))).toBe(true)
    expect(rows('jobs').map(row => row.tool_id)).toEqual([
      mockGalaxyJob.tool_id,
      mockGalaxyJob.tool_id,
      mockGalaxyJob.tool_id,
    ])
    expect(rows('jobs').at(2)?.update_time).toBe('2024-05-06T07:11:00.000Z')
  })

  it('fetches nothing when no job changed at all', async () => {
    const { supabase } = createStatefulSupabase({
      analyses: [{ ...analysisRow }],
      histories: [{ id: historyId, state: 'new', is_sync: false }],
      jobs: [],
    })

    const { calls, layer } = createRecordingGalaxyLayer((call) => {
      if (call.url.includes('jobs_summary'))
        return runningJobsSummary
      if (call.url.includes('api/invocations/'))
        return invocationWith(firstPoll)
      const galaxyJobId = call.url.replace(/^.*api\/jobs\//, '').replace(/\?.*$/, '')
      const reported = firstPoll.find(job => job.id === galaxyJobId)!
      return { ...mockGalaxyJob, id: galaxyJobId, state: reported.state, update_time: reported.update_time }
    })

    await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, syncConfig))
    calls.length = 0
    await Effect.runPromise(syncAnalysisEffect(analysisId, ownerId, supabase, layer, syncConfig))

    expect(calls.filter(call => call.url.includes('api/jobs/'))).toEqual([])
  })
})
