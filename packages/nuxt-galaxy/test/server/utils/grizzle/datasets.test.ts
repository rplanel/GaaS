import { Buffer } from 'node:buffer'
import * as importsModule from '#imports'
// Import mocked modules
import * as bt from 'blendtype'
import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as fetchModule from '../../../../src/runtime/server/utils/fetch'
import {
  getStorageObject,
  GetStorageObjectError,
  isDatasetTerminalState,
  MissingSignedUrlError,
  MissingStorageObjectIdError,
  NotDefinedInsertedDatasetError,
  UnexpectedUploadResultError,
  uploadDatasetsEffect,
  uploadSingleDatasetEffect,
} from '../../../../src/runtime/server/utils/grizzle/datasets'
import * as historiesModule from '../../../../src/runtime/server/utils/grizzle/histories'
import * as supabaseModule from '../../../../src/runtime/server/utils/grizzle/supabase'
import {
  createMockDrizzle,
  createMockEvent,
  expectFailure,
  mockDbDataset,
} from '../../fixtures'

// ============================================================================
// Mocks - paths relative to the source file being tested
// ============================================================================

vi.mock('blendtype', async (importOriginal) => {
  const original = await importOriginal<typeof import('blendtype')>()
  return {
    ...original,
    uploadFileToHistoryEffect: vi.fn(),
    deleteHistoryEffect: vi.fn(() => Effect.succeed(undefined)),
    HttpError: class HttpError extends Error {
      readonly _tag = 'HttpError'
      constructor(opts: { message: string }) {
        super(opts.message)
      }
    },
  }
})

// Mock relative to source file: src/runtime/server/utils/grizzle/datasets.ts
// ../fetch resolves to src/runtime/server/utils/fetch
vi.mock('../../../../src/runtime/server/utils/fetch', () => ({
  fetchUrlEffect: vi.fn(),
}))

// ./histories resolves to src/runtime/server/utils/grizzle/histories
vi.mock('../../../../src/runtime/server/utils/grizzle/histories', () => ({
  deleteHistory: vi.fn(() => Effect.succeed(undefined)),
}))

// ./supabase resolves to src/runtime/server/utils/grizzle/supabase
vi.mock('../../../../src/runtime/server/utils/grizzle/supabase', () => ({
  createSignedUrl: vi.fn(),
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: vi.fn(() => ({
    public: { supabaseUrl: 'https://remote.supabase.co' },
  })),
}))

// ============================================================================
// Test Data
// ============================================================================

const mockEvent = createMockEvent()

const mockStorageObject = {
  id: 'storage-object-1',
  name: 'path/to/file.txt',
  bucket_id: 'analysis_files',
}

const mockGalaxyResponse = {
  outputs: [{
    id: 'galaxy-dataset-1',
    name: 'Test Dataset',
    uuid: 'dataset-uuid-1',
    file_ext: 'txt',
    create_time: '2024-01-01T00:00:00.000Z',
  }],
}

const defaultParams = {
  step: '0',
  storageObjectId: 'storage-object-1',
  galaxyHistoryId: 'galaxy-history-1',
  historyId: 1,
  ownerId: 'owner-uuid-1',
  event: mockEvent,
  shouldUseFileUpload: false,
}

// ============================================================================
// Test Helpers
// ============================================================================

function setupDefaultMocks() {
  vi.mocked(importsModule.useRuntimeConfig).mockReturnValue({
    public: { supabaseUrl: 'https://remote.supabase.co' },
  } as any)
  vi.mocked(supabaseModule.createSignedUrl).mockReturnValue(Effect.succeed('https://signed.url/file.txt?token=abc'))
  vi.mocked(bt.uploadFileToHistoryEffect).mockReturnValue(Effect.succeed(mockGalaxyResponse))
  vi.mocked(bt.deleteHistoryEffect).mockReturnValue(Effect.succeed(undefined))
  vi.mocked(historiesModule.deleteHistory).mockReturnValue(Effect.succeed(undefined))
  vi.mocked(fetchModule.fetchUrlEffect).mockReturnValue(Effect.succeed({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
  } as unknown as Response))
}

// ============================================================================
// Tests: uploadSingleDatasetEffect
// ============================================================================

describe('uploadSingleDatasetEffect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
  })

  describe('happy path', () => {
    it('should upload via URL and return result', async () => {
      const drizzle = createMockDrizzle()
      // First query: getStorageObject returns storage object
      // Second query: insertDataset returns dataset
      drizzle.setResult([mockStorageObject])
      // We need to handle multiple queries - the mock will return same result for all
      // But insertDataset uses a different mock (useDrizzle() not Drizzle context)
      // So let's just mock insertDatasetEffect
      vi.spyOn(await import('../../../../src/runtime/server/utils/grizzle/datasets'), 'insertDatasetEffect')
        .mockReturnValue(Effect.succeed(mockDbDataset))

      const result = await uploadSingleDatasetEffect(defaultParams).pipe(
        Effect.provide(drizzle.layer),
        Effect.runPromise,
      )

      expect(result).toEqual({
        step: '0',
        insertedId: 1,
        galaxyId: 'galaxy-dataset-1',
      })
    })

    it('should use blob upload when shouldUseFileUpload is true', async () => {
      const drizzle = createMockDrizzle()
      drizzle.setResult([mockStorageObject])

      await uploadSingleDatasetEffect({
        ...defaultParams,
        shouldUseFileUpload: true,
      }).pipe(
        Effect.provide(drizzle.layer),
        Effect.runPromise,
      )

      expect(fetchModule.fetchUrlEffect).toHaveBeenCalledWith('https://signed.url/file.txt?token=abc')
      expect(bt.uploadFileToHistoryEffect).toHaveBeenCalledWith(expect.objectContaining({
        historyId: 'galaxy-history-1',
        name: 'file.txt',
        buffer: expect.any(Buffer),
      }))
      expect(bt.uploadFileToHistoryEffect).not.toHaveBeenCalledWith(expect.objectContaining({
        srcUrl: expect.any(String),
      }))
    })
  })

  describe('validation errors', () => {
    it('should fail with MissingStorageObjectIdError when storageObjectId is null', async () => {
      const drizzle = createMockDrizzle()

      const exit = await uploadSingleDatasetEffect({
        ...defaultParams,
        storageObjectId: null,
      }).pipe(
        Effect.provide(drizzle.layer),
        Effect.runPromiseExit,
      )

      expectFailure(exit, (error) => {
        expect(error).toBeInstanceOf(MissingStorageObjectIdError)
        expect((error as MissingStorageObjectIdError).message).toContain('has no storage_object_id')
      })
    })

    it('should fail with MissingStorageObjectIdError when storageObjectId is undefined', async () => {
      const drizzle = createMockDrizzle()

      const exit = await uploadSingleDatasetEffect({
        ...defaultParams,
        storageObjectId: undefined,
      }).pipe(
        Effect.provide(drizzle.layer),
        Effect.runPromiseExit,
      )

      expectFailure(exit, (error) => {
        expect(error).toBeInstanceOf(MissingStorageObjectIdError)
      })
    })

    it('should fail with GetStorageObjectError when storage object has no name', async () => {
      const drizzle = createMockDrizzle()
      drizzle.setResult([{ id: 'storage-object-1', name: null }])

      const exit = await uploadSingleDatasetEffect(defaultParams).pipe(
        Effect.provide(drizzle.layer),
        Effect.runPromiseExit,
      )

      expectFailure(exit, (error) => {
        expect(error).toBeInstanceOf(GetStorageObjectError)
        expect((error as GetStorageObjectError).message).toContain('has no name')
      })
    })

    it('should fail with MissingSignedUrlError when createSignedUrl returns null', async () => {
      const drizzle = createMockDrizzle()
      drizzle.setResult([mockStorageObject])
      vi.mocked(supabaseModule.createSignedUrl).mockReturnValue(Effect.succeed(null))

      const exit = await uploadSingleDatasetEffect(defaultParams).pipe(
        Effect.provide(drizzle.layer),
        Effect.runPromiseExit,
      )

      expectFailure(exit, (error) => {
        expect(error).toBeInstanceOf(MissingSignedUrlError)
        expect((error as MissingSignedUrlError).message).toContain('Failed to create a signed URL')
      })
    })
  })

  describe('blob upload errors', () => {
    it('should fail with HttpError when buffer is empty', async () => {
      const drizzle = createMockDrizzle()
      drizzle.setResult([mockStorageObject])
      vi.mocked(fetchModule.fetchUrlEffect).mockReturnValue(Effect.succeed({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      } as unknown as Response))

      const exit = await uploadSingleDatasetEffect({
        ...defaultParams,
        shouldUseFileUpload: true,
      }).pipe(
        Effect.provide(drizzle.layer),
        Effect.runPromiseExit,
      )

      expectFailure(exit, (error) => {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain('is empty')
      })
    })
  })

  describe('galaxy response errors', () => {
    it('should fail with UnexpectedUploadResultError when Galaxy returns 0 outputs', async () => {
      const drizzle = createMockDrizzle()
      drizzle.setResult([mockStorageObject])
      vi.mocked(bt.uploadFileToHistoryEffect).mockReturnValue(Effect.succeed({
        outputs: [],
      }))

      const exit = await uploadSingleDatasetEffect(defaultParams).pipe(
        Effect.provide(drizzle.layer),
        Effect.runPromiseExit,
      )

      expectFailure(exit, (error) => {
        expect(error).toBeInstanceOf(UnexpectedUploadResultError)
        expect((error as UnexpectedUploadResultError).message).toContain('returned 0 outputs')
      })
    })

    it('should fail with UnexpectedUploadResultError when Galaxy returns multiple outputs', async () => {
      const drizzle = createMockDrizzle()
      drizzle.setResult([mockStorageObject])
      vi.mocked(bt.uploadFileToHistoryEffect).mockReturnValue(Effect.succeed({
        outputs: [
          { id: 'ds-1', name: 'Dataset 1', uuid: 'uuid-1', file_ext: 'txt', create_time: '2024-01-01' },
          { id: 'ds-2', name: 'Dataset 2', uuid: 'uuid-2', file_ext: 'txt', create_time: '2024-01-01' },
        ],
      }))

      const exit = await uploadSingleDatasetEffect(defaultParams).pipe(
        Effect.provide(drizzle.layer),
        Effect.runPromiseExit,
      )

      expectFailure(exit, (error) => {
        expect(error).toBeInstanceOf(UnexpectedUploadResultError)
        expect((error as UnexpectedUploadResultError).message).toContain('returned 2 outputs')
      })
    })
  })

  describe('cleanup on failure', () => {
    it('should delete Galaxy history then DB history in order on upload failure', async () => {
      const drizzle = createMockDrizzle()
      drizzle.setResult([mockStorageObject])
      const uploadError = new Error('Upload failed')
      vi.mocked(bt.uploadFileToHistoryEffect).mockReturnValue(Effect.fail(uploadError))

      const exit = await uploadSingleDatasetEffect(defaultParams).pipe(
        Effect.provide(drizzle.layer),
        Effect.runPromiseExit,
      )

      expectFailure(exit, (error) => {
        expect(error).toBe(uploadError)
      })

      // Verify cleanup order: Galaxy first, then DB
      expect(bt.deleteHistoryEffect).toHaveBeenCalledTimes(1)
      expect(bt.deleteHistoryEffect).toHaveBeenCalledWith('galaxy-history-1')
      expect(historiesModule.deleteHistory).toHaveBeenCalledTimes(1)
      expect(historiesModule.deleteHistory).toHaveBeenCalledWith(1)

      // Verify order by checking call sequence
      const galaxyCall = vi.mocked(bt.deleteHistoryEffect).mock.invocationCallOrder[0]
      const dbCall = vi.mocked(historiesModule.deleteHistory).mock.invocationCallOrder[0]
      expect(galaxyCall).toBeLessThan(dbCall)
    })
  })

  describe('database errors', () => {
    it('should fail with NotDefinedInsertedDatasetError when insert returns undefined', async () => {
      const drizzle = createMockDrizzle()
      drizzle.setResult([mockStorageObject])
      vi.spyOn(await import('../../../../src/runtime/server/utils/grizzle/datasets'), 'insertDatasetEffect')
        .mockReturnValue(Effect.succeed(undefined as any))

      const exit = await uploadSingleDatasetEffect(defaultParams).pipe(
        Effect.provide(drizzle.layer),
        Effect.runPromiseExit,
      )

      expectFailure(exit, (error) => {
        expect(error).toBeInstanceOf(NotDefinedInsertedDatasetError)
      })
    })
  })
})

// ============================================================================
// Tests: uploadDatasetsEffect
// ============================================================================

describe('uploadDatasetsEffect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
  })

  it('should upload multiple datasets in parallel', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockStorageObject])

    const datamap = {
      0: { storage_object_id: 'storage-object-1' },
      1: { storage_object_id: 'storage-object-2' },
    }

    const result = await uploadDatasetsEffect({
      datamap,
      galaxyHistoryId: 'galaxy-history-1',
      historyId: 1,
      ownerId: 'owner-uuid-1',
      event: mockEvent,
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual([
      { step: '0', insertedId: 1, galaxyId: 'galaxy-dataset-1' },
      { step: '1', insertedId: 1, galaxyId: 'galaxy-dataset-1' },
    ])
    expect(bt.uploadFileToHistoryEffect).toHaveBeenCalledTimes(2)
  })

  it('should force blob upload when Supabase is localhost', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockStorageObject])
    vi.mocked(importsModule.useRuntimeConfig).mockReturnValue({
      public: { supabaseUrl: 'http://127.0.0.1:54321' },
    } as any)
    vi.mocked(fetchModule.fetchUrlEffect).mockReturnValue(Effect.succeed({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    } as unknown as Response))

    const datamap = {
      0: { storage_object_id: 'storage-object-1' },
    }

    await uploadDatasetsEffect({
      datamap,
      galaxyHistoryId: 'galaxy-history-1',
      historyId: 1,
      ownerId: 'owner-uuid-1',
      event: mockEvent,
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(fetchModule.fetchUrlEffect).toHaveBeenCalled()
    expect(bt.uploadFileToHistoryEffect).toHaveBeenCalledWith(expect.objectContaining({
      buffer: expect.any(Buffer),
    }))
  })

  it('should force blob upload when Supabase is localhost with explicit useBlobUpload false', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockStorageObject])
    vi.mocked(importsModule.useRuntimeConfig).mockReturnValue({
      public: { supabaseUrl: 'http://localhost:54321' },
    } as any)
    vi.mocked(fetchModule.fetchUrlEffect).mockReturnValue(Effect.succeed({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    } as unknown as Response))

    const datamap = {
      0: { storage_object_id: 'storage-object-1' },
    }

    await uploadDatasetsEffect({
      datamap,
      galaxyHistoryId: 'galaxy-history-1',
      historyId: 1,
      ownerId: 'owner-uuid-1',
      event: mockEvent,
      useBlobUpload: false, // Should be overridden by localhost
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(fetchModule.fetchUrlEffect).toHaveBeenCalled()
  })

  it('should use URL upload in production by default', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockStorageObject])

    const datamap = {
      0: { storage_object_id: 'storage-object-1' },
    }

    await uploadDatasetsEffect({
      datamap,
      galaxyHistoryId: 'galaxy-history-1',
      historyId: 1,
      ownerId: 'owner-uuid-1',
      event: mockEvent,
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(fetchModule.fetchUrlEffect).not.toHaveBeenCalled()
    expect(bt.uploadFileToHistoryEffect).toHaveBeenCalledWith(expect.objectContaining({
      srcUrl: 'https://signed.url/file.txt?token=abc',
    }))
  })

  it('should use explicit useBlobUpload=true in production', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockStorageObject])
    vi.mocked(fetchModule.fetchUrlEffect).mockReturnValue(Effect.succeed({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    } as unknown as Response))

    const datamap = {
      0: { storage_object_id: 'storage-object-1' },
    }

    await uploadDatasetsEffect({
      datamap,
      galaxyHistoryId: 'galaxy-history-1',
      historyId: 1,
      ownerId: 'owner-uuid-1',
      event: mockEvent,
      useBlobUpload: true,
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(fetchModule.fetchUrlEffect).toHaveBeenCalled()
    expect(bt.uploadFileToHistoryEffect).toHaveBeenCalledWith(expect.objectContaining({
      buffer: expect.any(Buffer),
    }))
  })
})

// ============================================================================
// Tests: Existing functionality
// ============================================================================

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
