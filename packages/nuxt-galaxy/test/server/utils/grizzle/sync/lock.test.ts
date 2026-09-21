import type { SupabaseClient } from '@supabase/supabase-js'
import type { Mock } from 'vitest'
import type { Database } from '../../../../../src/runtime/types/database'
import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { acquireSyncLock, releaseSyncLock } from '../../../../../src/runtime/server/utils/grizzle/sync/lock'

interface MockSupabase extends SupabaseClient<Database> {
  rpc: Mock
  schema: Mock
}

interface MockSupabaseConfig {
  rpcResult?: { data: unknown, error: unknown }
  deleteResult?: { data: unknown, error: unknown }
}

function createMockSupabase(config: MockSupabaseConfig = {}): MockSupabase {
  const rpc = vi.fn(() => Promise.resolve(config.rpcResult ?? { data: null, error: null }))

  const deleteChain = {} as Record<string, unknown>
  deleteChain.eq = vi.fn(() => Promise.resolve(config.deleteResult ?? { data: null, error: null }))

  const fromChain = {} as Record<string, unknown>
  fromChain.delete = vi.fn(() => deleteChain)

  const schemaChain = {} as Record<string, unknown>
  schemaChain.rpc = rpc
  schemaChain.from = vi.fn(() => fromChain)

  return {
    rpc,
    schema: vi.fn(() => schemaChain),
  } as unknown as MockSupabase
}

describe('acquireSyncLock', () => {
  it('calls acquire_sync_lock RPC with correct parameters and returns true', async () => {
    const supabase = createMockSupabase({ rpcResult: { data: true, error: null } })
    const result = await Effect.runPromise(acquireSyncLock(supabase, 1, 900))
    expect(result).toBe(true)
    expect(supabase.schema).toHaveBeenCalledWith('galaxy')
    const schemaChain = supabase.schema.mock.results[0]!.value
    expect(schemaChain.rpc).toHaveBeenCalledWith('acquire_sync_lock', { p_analysis_id: 1, p_ttl_seconds: 900 })
    expect(schemaChain.rpc).toHaveBeenCalledTimes(1)
  })

  it('returns false when RPC returns false', async () => {
    const supabase = createMockSupabase({ rpcResult: { data: false, error: null } })
    const result = await Effect.runPromise(acquireSyncLock(supabase, 2, 300))
    expect(result).toBe(false)
    const schemaChain = supabase.schema.mock.results[0]!.value
    expect(schemaChain.rpc).toHaveBeenCalledWith('acquire_sync_lock', { p_analysis_id: 2, p_ttl_seconds: 300 })
  })

  it('returns false when RPC data is null', async () => {
    const supabase = createMockSupabase({ rpcResult: { data: null, error: null } })
    const result = await Effect.runPromise(acquireSyncLock(supabase, 3, 600))
    expect(result).toBe(false)
  })

  it('fails with SyncLockError when RPC returns an error', async () => {
    const supabase = createMockSupabase({ rpcResult: { data: null, error: { message: 'rpc failed' } } })
    await expect(Effect.runPromise(acquireSyncLock(supabase, 4, 900))).rejects.toThrow('Failed to acquire sync lock')
    const schemaChain = supabase.schema.mock.results[0]!.value
    expect(schemaChain.rpc).toHaveBeenCalledWith('acquire_sync_lock', { p_analysis_id: 4, p_ttl_seconds: 900 })
  })

  it('surfaces RPC result across acquire, release, and re-acquire', async () => {
    let callCount = 0
    const supabase = createMockSupabase({ rpcResult: { data: null, error: null } })
    const schemaChain = supabase.schema('galaxy')
    schemaChain.rpc.mockImplementation(() => {
      callCount++
      return Promise.resolve({ data: callCount === 1, error: null })
    })

    const first = await Effect.runPromise(acquireSyncLock(supabase, 5, 900))
    expect(first).toBe(true)

    await Effect.runPromise(releaseSyncLock(supabase, 5))

    const second = await Effect.runPromise(acquireSyncLock(supabase, 5, 900))
    expect(second).toBe(false)
    expect(schemaChain.rpc).toHaveBeenCalledTimes(2)
    expect(schemaChain.rpc).toHaveBeenLastCalledWith('acquire_sync_lock', { p_analysis_id: 5, p_ttl_seconds: 900 })
  })

  it('returns false while a lock is held and true once the lock is released', async () => {
    const locks = new Set<number>()
    const supabase = createMockSupabase({ rpcResult: { data: null, error: null } })
    const schemaChain = supabase.schema('galaxy')
    schemaChain.rpc.mockImplementation((name: string, params: { p_analysis_id: number }) => {
      if (name !== 'acquire_sync_lock')
        return Promise.resolve({ data: null, error: null })
      if (locks.has(params.p_analysis_id))
        return Promise.resolve({ data: false, error: null })
      locks.add(params.p_analysis_id)
      return Promise.resolve({ data: true, error: null })
    })

    // Simulate another worker already holds the lock
    locks.add(6)

    const first = await Effect.runPromise(acquireSyncLock(supabase, 6, 900))
    expect(first).toBe(false)

    // The other worker releases
    await Effect.runPromise(releaseSyncLock(supabase, 6))
    locks.delete(6)

    const second = await Effect.runPromise(acquireSyncLock(supabase, 6, 900))
    expect(second).toBe(true)
    expect(schemaChain.rpc).toHaveBeenCalledTimes(2)
    expect(schemaChain.rpc).toHaveBeenLastCalledWith('acquire_sync_lock', { p_analysis_id: 6, p_ttl_seconds: 900 })
  })
})

describe('releaseSyncLock', () => {
  it('deletes the lock row', async () => {
    const supabase = createMockSupabase({ deleteResult: { data: null, error: null } })
    await Effect.runPromise(releaseSyncLock(supabase, 1))
    expect(supabase.schema).toHaveBeenCalledWith('galaxy')
    const schemaChain = supabase.schema.mock.results[0]!.value
    expect(schemaChain.from).toHaveBeenCalledWith('sync_locks')
    const fromChain = schemaChain.from.mock.results[0].value
    expect(fromChain.delete).toHaveBeenCalled()
    const deleteChain = fromChain.delete.mock.results[0].value
    expect(deleteChain.eq).toHaveBeenCalledWith('analysis_id', 1)
  })

  it('fails with SyncLockError when delete fails', async () => {
    const supabase = createMockSupabase({ deleteResult: { data: null, error: { message: 'delete failed' } } })
    await expect(Effect.runPromise(releaseSyncLock(supabase, 1))).rejects.toThrow('Failed to release sync lock: delete failed')
  })
})
