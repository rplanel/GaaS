import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import {
  getStorageObject,
  GetStorageObjectError,
  isDatasetTerminalState,
} from '../../../../src/runtime/server/utils/grizzle/datasets'
import {
  createMockDrizzle,
  expectFailure,
} from '../../fixtures'

// Mock the direct useDrizzle() call used by insertDatasetEffect
vi.mock('../../../../src/runtime/server/utils/grizzle/datasets', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../../src/runtime/server/utils/grizzle/datasets')>()
  return {
    ...original,
    // Re-export everything, only intercept what we need
  }
})

describe('isDatasetTerminalState', () => {
  it('should return true for terminal states', () => {
    expect(isDatasetTerminalState('ok')).toBe(true)
    expect(isDatasetTerminalState('error')).toBe(true)
    expect(isDatasetTerminalState('empty')).toBe(true)
    expect(isDatasetTerminalState('discarded')).toBe(true)
    expect(isDatasetTerminalState('failed_metadata')).toBe(true)
  })

  it('should return false for non-terminal states', () => {
    expect(isDatasetTerminalState('new')).toBe(false)
    expect(isDatasetTerminalState('upload')).toBe(false)
    expect(isDatasetTerminalState('queued')).toBe(false)
    expect(isDatasetTerminalState('running')).toBe(false)
    expect(isDatasetTerminalState('setting_metadata')).toBe(false)
    expect(isDatasetTerminalState('paused')).toBe(false)
    expect(isDatasetTerminalState('deferred')).toBe(false)
  })
})

describe('getStorageObject', () => {
  it('should return a storage object when found', async () => {
    const drizzle = createMockDrizzle()
    const storageObject = {
      id: 'storage-object-1',
      name: 'path/to/file.txt',
      bucket_id: 'analysis_files',
    }
    drizzle.setResult([storageObject])

    const result = await getStorageObject('storage-object-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual(storageObject)
  })

  it('should return null when storage object is not found', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const result = await getStorageObject('nonexistent').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toBeNull()
  })

  it('should fail with GetStorageObjectError on database error', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.select.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.from = () => chain
      chain.where = () => chain
      chain.then = (_r: unknown, reject: (e: Error) => void) =>
        Promise.reject(new Error('DB error')).catch(reject)
      return chain
    })

    const exit = await getStorageObject('storage-object-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(GetStorageObjectError)
    })
  })
})
