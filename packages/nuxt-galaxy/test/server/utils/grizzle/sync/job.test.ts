import type { SupabaseClient } from '@supabase/supabase-js'
import type * as bt from 'blendtype'
import type { Mock } from 'vitest'
import type { Database } from '../../../../../src/runtime/types/database'
import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { isRecordedJobCurrent, selectRecordedJobsEffect, syncJobEffect, SyncJobError } from '../../../../../src/runtime/server/utils/grizzle/sync/job'
import { createFailingGalaxyLayer, createMockGalaxyLayer, expectFailure, mockGalaxyJob } from '../../../fixtures'

interface MockSupabaseConfig {
  singleResult?: { data: unknown, error: unknown }
  insertResult?: { data: unknown, error: unknown }
  updateResult?: { data: unknown, error: unknown }
  /** Answers a query that is awaited rather than ended with `maybeSingle`. */
  listResult?: { data: unknown, error: unknown }
}

/**
 * One shared chain for every table: `schema()` and `from()` ignore their
 * arguments and hand back the same spies, so `schema('galaxy').from('jobs')`
 * in an assertion is how a test reaches those spies, not a filter on them.
 * The names match what the code under test passes.
 */
function createMockSupabase(config: MockSupabaseConfig = {}): SupabaseClient<Database> {
  const terminal = (result?: { data: unknown, error: unknown }) =>
    Promise.resolve(result ?? { data: null, error: null })

  const queryChain = {} as Record<string, unknown>
  const updateChain = {} as Record<string, unknown>

  const setupQueryChain = () => {
    queryChain.schema = vi.fn(() => queryChain)
    queryChain.from = vi.fn(() => queryChain)
    queryChain.select = vi.fn(() => queryChain)
    queryChain.insert = vi.fn(() => queryChain)
    queryChain.update = vi.fn(() => updateChain)
    queryChain.delete = vi.fn(() => queryChain)
    queryChain.eq = vi.fn(() => queryChain)
    queryChain.single = vi.fn(() => terminal(config.insertResult))
    queryChain.maybeSingle = vi.fn(() => terminal(config.singleResult))
    queryChain.then = vi.fn((resolve: (value: unknown) => unknown) =>
      terminal(config.listResult).then(resolve),
    )
  }

  setupQueryChain()

  updateChain.schema = vi.fn(() => updateChain)
  updateChain.from = vi.fn(() => updateChain)
  updateChain.select = vi.fn(() => updateChain)
  updateChain.insert = vi.fn(() => updateChain)
  updateChain.update = vi.fn(() => updateChain)
  updateChain.delete = vi.fn(() => updateChain)
  updateChain.eq = vi.fn(() => ({
    then: (resolve: (value: unknown) => unknown) => terminal(config.updateResult).then(resolve),
  }))
  updateChain.single = vi.fn(() => terminal(config.insertResult))
  updateChain.maybeSingle = vi.fn(() => terminal(config.singleResult))

  return queryChain as unknown as SupabaseClient<Database>
}

/**
 * The double's one shared chain, where every builder method is a spy. Reaching
 * a filter method such as `eq` through the typed client would mean calling
 * `select` again, which is itself under assertion.
 */
function chainOf(supabase: SupabaseClient<Database>): Record<string, Mock> {
  return supabase as unknown as Record<string, Mock>
}

function expectedPayload(galaxyJobId: string, galaxyJob: bt.ShowFullJobResponse, isSync: boolean) {
  return {
    galaxy_id: galaxyJobId,
    analysis_id: 1,
    owner_id: 'owner',
    step_id: 1,
    state: galaxyJob.state,
    tool_id: galaxyJob.tool_id,
    exit_code: galaxyJob.exit_code ?? null,
    stderr: galaxyJob.stderr ?? null,
    stdout: galaxyJob.stdout ?? null,
    created_at: galaxyJob.create_time,
    // `mockGalaxyJob.update_time` already carries a zone, so normalising it
    // is the identity; the naive form Galaxy really sends has its own test.
    update_time: '2024-01-01T00:00:00.000Z',
    is_sync: isSync,
  }
}

function expectedPayload3(galaxyJobId: string, galaxyJob: bt.ShowFullJobResponse, isSync: boolean) {
  return { ...expectedPayload(galaxyJobId, galaxyJob, isSync), step_id: 3 }
}

describe('syncJobEffect', () => {
  const layer = createMockGalaxyLayer(mockGalaxyJob)

  it('inserts a new job and returns its id', async () => {
    const supabase = createMockSupabase({
      singleResult: { data: null, error: null },
      insertResult: { data: { id: 42 }, error: null },
    })

    const result = await Effect.runPromise(syncJobEffect('gjid', 1, 1, 'owner', supabase, layer))

    expect(result).toBe(42)
    expect(supabase.schema('galaxy').from('jobs').insert).toHaveBeenCalledWith(expectedPayload('gjid', mockGalaxyJob, true))
  })

  it('updates an existing job and returns its id', async () => {
    const supabase = createMockSupabase({
      singleResult: { data: { id: 7 }, error: null },
      updateResult: { data: null, error: null },
    })

    const result = await Effect.runPromise(syncJobEffect('gjid', 1, 1, 'owner', supabase, layer))

    expect(result).toBe(7)
    expect(supabase.schema('galaxy').from('jobs').update).toHaveBeenCalledWith(expectedPayload('gjid', mockGalaxyJob, true))
  })

  it('re-syncing a recorded job updates its row and inserts nothing', async () => {
    // What keeps a re-synced invocation from duplicating rows: the lookup is
    // on `(galaxy_id, analysis_id)`, so every job of a mapped step resolves
    // to the row it wrote last time, whatever step id it shares with others.
    const supabase = createMockSupabase({
      singleResult: { data: { id: 7 }, error: null },
      updateResult: { data: null, error: null },
    })

    await Effect.runPromise(syncJobEffect('gjid', 3, 1, 'owner', supabase, layer))

    const jobs = supabase.schema('galaxy').from('jobs')
    expect(jobs.update).toHaveBeenCalledWith(expectedPayload3('gjid', mockGalaxyJob, true))
    expect(jobs.insert).not.toHaveBeenCalled()
  })

  it('records the naive timestamp Galaxy reports as an explicit UTC instant', async () => {
    // Galaxy serialises `update_time` with no zone. Stored as-is, Postgres
    // would read it under the session timezone and `Date.parse` under the
    // runtime's; #106 compares this value on every later sync, so the two
    // have to agree. Microseconds are dropped, symmetrically on both sides.
    //
    // A runner in UTC cannot tell this apart from reading the timestamp as
    // local time — the two coincide there — and vitest's worker threads do
    // not honour a `process.env.TZ` set after they start, so nothing here
    // can pin a zone. The guarantee is instead structural: the code parses
    // only zone-qualified strings. This fails on a developer's machine.
    const naiveJob = { ...mockGalaxyJob, update_time: '2024-05-06T07:08:09.123456' }
    const supabase = createMockSupabase({
      singleResult: { data: null, error: null },
      insertResult: { data: { id: 44 }, error: null },
    })

    await Effect.runPromise(syncJobEffect('gjid-naive', 1, 1, 'owner', supabase, createMockGalaxyLayer(naiveJob)))

    expect(supabase.schema('galaxy').from('jobs').insert).toHaveBeenCalledWith(
      expect.objectContaining({ update_time: '2024-05-06T07:08:09.123Z' }),
    )
  })

  it('sets is_sync to false for non-terminal Galaxy states', async () => {
    const runningJob = { ...mockGalaxyJob, state: 'running' as bt.JobState }
    const runningLayer = createMockGalaxyLayer(runningJob)
    const supabase = createMockSupabase({
      singleResult: { data: null, error: null },
      insertResult: { data: { id: 43 }, error: null },
    })

    const result = await Effect.runPromise(syncJobEffect('gjid-running', 1, 1, 'owner', supabase, runningLayer))

    expect(result).toBe(43)
    expect(supabase.schema('galaxy').from('jobs').insert).toHaveBeenCalledWith(expectedPayload('gjid-running', runningJob, false))
  })

  it('fails with SyncJobError when insert returns an error', async () => {
    const supabase = createMockSupabase({
      singleResult: { data: null, error: null },
      insertResult: { data: null, error: { message: 'insert failed' } },
    })

    const exit = await Effect.runPromiseExit(syncJobEffect('gjid', 1, 1, 'owner', supabase, layer))

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(SyncJobError)
      expect((error as SyncJobError).message).toContain('insert failed')
    })
  })

  it('fails with SyncJobError when update returns an error', async () => {
    const supabase = createMockSupabase({
      singleResult: { data: { id: 7 }, error: null },
      updateResult: { data: null, error: { message: 'update failed' } },
    })

    const exit = await Effect.runPromiseExit(syncJobEffect('gjid', 1, 1, 'owner', supabase, layer))

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(SyncJobError)
      expect((error as SyncJobError).message).toContain('update failed')
    })
  })

  it('fails with SyncJobError when Galaxy is unreachable', async () => {
    const supabase = createMockSupabase({
      singleResult: { data: null, error: null },
      insertResult: { data: { id: 42 }, error: null },
    })
    const failingLayer = createFailingGalaxyLayer(new Error('Service Unavailable'))

    const exit = await Effect.runPromiseExit(syncJobEffect('gjid', 1, 1, 'owner', supabase, failingLayer))

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(SyncJobError)
      expect((error as SyncJobError).message).toContain('Service Unavailable')
    })
  })
})

describe('selectRecordedJobsEffect', () => {
  const rows = [
    { id: 7, galaxy_id: 'job-a', state: 'ok', update_time: '2024-01-01T00:00:00+00:00' },
    { id: 8, galaxy_id: 'job-b', state: 'running', update_time: null },
  ]

  it('reads the analysis jobs in one query, keyed by Galaxy id', async () => {
    // One query for the whole sync: the caller asks after every job of every
    // step, and a mapped step has one per element (#106).
    const supabase = createMockSupabase({ listResult: { data: rows, error: null } })

    const recordedJobs = await Effect.runPromise(selectRecordedJobsEffect(supabase, 1))

    const jobs = chainOf(supabase)
    expect(jobs.select).toHaveBeenCalledTimes(1)
    expect(jobs.select).toHaveBeenCalledWith('id, galaxy_id, state, update_time')
    expect(jobs.eq).toHaveBeenCalledWith('analysis_id', 1)
    expect([...recordedJobs.keys()]).toEqual(['job-a', 'job-b'])
    expect(recordedJobs.get('job-a')).toEqual(rows[0])
  })

  it('reads an analysis with no recorded job as an empty map', async () => {
    const supabase = createMockSupabase({ listResult: { data: null, error: null } })

    const recordedJobs = await Effect.runPromise(selectRecordedJobsEffect(supabase, 1))

    expect(recordedJobs.size).toBe(0)
  })

  it('fails with SyncJobError when the query returns an error', async () => {
    const supabase = createMockSupabase({ listResult: { data: null, error: { message: 'select failed' } } })

    const exit = await Effect.runPromiseExit(selectRecordedJobsEffect(supabase, 1))

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(SyncJobError)
      expect((error as SyncJobError).message).toContain('select failed')
    })
  })
})

describe('isRecordedJobCurrent', () => {
  const recorded = {
    id: 7,
    galaxy_id: 'job-a',
    state: 'ok' as bt.JobState,
    // What Postgres hands back for a `timestamptz`: an explicit offset, and
    // never the naive shape Galaxy sent.
    update_time: '2024-05-06T07:08:09.123+00:00',
  }
  const reported: bt.GalaxyInvocationStepJob = {
    model_class: 'Job',
    id: 'job-a',
    state: 'ok' as bt.JobState,
    update_time: '2024-05-06T07:08:09.123456',
  }

  it('reads the same instant in a Postgres offset and a naive Galaxy timestamp', () => {
    expect(isRecordedJobCurrent(recorded, reported)).toBe(true)
  })

  it('rejects a job whose state moved on', () => {
    expect(isRecordedJobCurrent(recorded, { ...reported, state: 'error' as bt.JobState })).toBe(false)
  })

  it('rejects a job Galaxy has touched since', () => {
    expect(isRecordedJobCurrent(recorded, { ...reported, update_time: '2024-05-06T07:09:00' })).toBe(false)
  })

  it('rejects a row recorded before there was an update time to record', () => {
    expect(isRecordedJobCurrent({ ...recorded, update_time: null }, reported)).toBe(false)
  })

  it('rejects a job the invocation reports without an update time', () => {
    // 22.05 carries `update_time` in the step entry, but a payload fetched
    // without step details reports no job fields at all.
    expect(isRecordedJobCurrent(recorded, { ...reported, update_time: undefined })).toBe(false)
  })

  it('rejects an unparseable update time rather than calling it a match', () => {
    expect(isRecordedJobCurrent({ ...recorded, update_time: 'not a date' }, { ...reported, update_time: 'not a date' })).toBe(false)
  })
})
