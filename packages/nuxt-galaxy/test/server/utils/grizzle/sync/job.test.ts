import type { SupabaseClient } from '@supabase/supabase-js'
import type * as bt from 'blendtype'
import type { Database } from '../../../../../src/runtime/types/database'
import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { syncJobEffect, SyncJobError } from '../../../../../src/runtime/server/utils/grizzle/sync/job'
import { createFailingGalaxyLayer, createMockGalaxyLayer, expectFailure, mockGalaxyJob } from '../../../fixtures'

interface MockSupabaseConfig {
  singleResult?: { data: unknown, error: unknown }
  insertResult?: { data: unknown, error: unknown }
  updateResult?: { data: unknown, error: unknown }
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
