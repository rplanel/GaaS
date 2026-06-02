import { BlendTypeConfig } from 'blendtype'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { createFailureLayer, createSuccessLayer } from '../../../../../blendtype/test/fixtures'
import { UrlFetch } from '../../../../src/runtime/server/utils/fetch'
import {
  getStorageObject,
  GetStorageObjectError,
  isDatasetTerminalState,
  MissingStorageObjectIdError,
  UnexpectedUploadResultError,
  uploadDatasetsEffect,
  uploadSingleDatasetEffect,
} from '../../../../src/runtime/server/utils/grizzle/datasets'
import {
  createMockDrizzle,
  createMockEvent,
  createMockServerSupabaseClientLayer,
  expectFailure,
} from '../../fixtures'

// ============================================================================
// Test Helpers
// ============================================================================

const mockEvent = createMockEvent()

const mockGalaxyResponse = {
  outputs: [{
    id: 'galaxy-dataset-1',
    name: 'Test Dataset',
    uuid: 'dataset-uuid-1',
    file_ext: 'txt',
    create_time: '2024-01-01T00:00:00.000Z',
  }],
}

function createMockUrlFetchLayer(response: Response) {
  return Layer.succeed(
    UrlFetch,
    (_url: string) => Effect.succeed(response),
  )
}

function unusedUrlFetchLayer() {
  return Layer.succeed(
    UrlFetch,
    (_url: string) => Effect.succeed(new Response()),
  )
}

function emptyBufferResponse(): Response {
  return {
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    ok: true,
  } as Response
}

function validBufferResponse(): Response {
  return {
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    ok: true,
  } as Response
}

const mockBlendTypeConfig = {
  apiKey: 'test-key',
  url: 'https://galaxy.example.com',
}

function signedUrlSupabaseLayer() {
  return createMockServerSupabaseClientLayer({
    storageResult: { data: { signedUrl: 'https://signed.url/file.txt' }, error: null },
  }).layer
}

// ============================================================================
// Tests: uploadSingleDatasetEffect
// ============================================================================

describe('uploadSingleDatasetEffect', () => {
  it.skip('uploads via URL and returns result', async () => {
    // TODO: Investigate timeout with Effect.runPromise
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 'storage-object-1', name: 'file.txt' }])

    const result = await uploadSingleDatasetEffect({
      step: '0',
      storageObjectId: 'storage-object-1',
      galaxyHistoryId: 'galaxy-history-1',
      historyId: 1,
      ownerId: 'owner-uuid-1',
      event: mockEvent,
      shouldUseFileUpload: false,
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(signedUrlSupabaseLayer()),
      Effect.provide(createSuccessLayer(mockGalaxyResponse)),
      Effect.provide(Layer.succeed(BlendTypeConfig, mockBlendTypeConfig)),
      Effect.provide(unusedUrlFetchLayer()),
      Effect.runPromise,
    )

    expect(result).toEqual({
      step: '0',
      insertedId: 1,
      galaxyId: 'galaxy-dataset-1',
    })
  })

  it.skip('uses blob upload when shouldUseFileUpload is true', async () => {
    // TODO: Investigate timeout with Effect.runPromise when UrlFetch is provided
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 'storage-object-1', name: 'file.txt' }])

    const result = await uploadSingleDatasetEffect({
      step: '0',
      storageObjectId: 'storage-object-1',
      galaxyHistoryId: 'galaxy-history-1',
      historyId: 1,
      ownerId: 'owner-uuid-1',
      event: mockEvent,
      shouldUseFileUpload: true,
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(signedUrlSupabaseLayer()),
      Effect.provide(createSuccessLayer(mockGalaxyResponse)),
      Effect.provide(Layer.succeed(BlendTypeConfig, mockBlendTypeConfig)),
      Effect.provide(createMockUrlFetchLayer(validBufferResponse())),
      Effect.runPromise,
    )

    expect(result).toEqual({
      step: '0',
      insertedId: 1,
      galaxyId: 'galaxy-dataset-1',
    })
  })

  it('fails with MissingStorageObjectIdError when storageObjectId is null', async () => {
    const drizzle = createMockDrizzle()

    const exit = await uploadSingleDatasetEffect({
      step: '0',
      storageObjectId: null,
      galaxyHistoryId: 'galaxy-history-1',
      historyId: 1,
      ownerId: 'owner-uuid-1',
      event: mockEvent,
      shouldUseFileUpload: false,
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(signedUrlSupabaseLayer()),
      Effect.provide(createSuccessLayer(mockGalaxyResponse)),
      Effect.provide(Layer.succeed(BlendTypeConfig, mockBlendTypeConfig)),
      Effect.provide(unusedUrlFetchLayer()),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(MissingStorageObjectIdError)
      expect(error.message).toContain('has no storage_object_id')
    })
  })

  it('fails with GetStorageObjectError when storage object has no name', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 'storage-object-1', name: null }])

    const exit = await uploadSingleDatasetEffect({
      step: '0',
      storageObjectId: 'storage-object-1',
      galaxyHistoryId: 'galaxy-history-1',
      historyId: 1,
      ownerId: 'owner-uuid-1',
      event: mockEvent,
      shouldUseFileUpload: false,
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(signedUrlSupabaseLayer()),
      Effect.provide(createSuccessLayer(mockGalaxyResponse)),
      Effect.provide(Layer.succeed(BlendTypeConfig, mockBlendTypeConfig)),
      Effect.provide(unusedUrlFetchLayer()),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(GetStorageObjectError)
      expect(error.message).toContain('has no name')
    })
  })

  it('fails when Supabase signed URL fails', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 'storage-object-1', name: 'file.txt' }])

    const exit = await uploadSingleDatasetEffect({
      step: '0',
      storageObjectId: 'storage-object-1',
      galaxyHistoryId: 'galaxy-history-1',
      historyId: 1,
      ownerId: 'owner-uuid-1',
      event: mockEvent,
      shouldUseFileUpload: false,
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(createMockServerSupabaseClientLayer({
        storageResult: { data: null, error: { message: 'No signed URL' } },
      }).layer),
      Effect.provide(createSuccessLayer(mockGalaxyResponse)),
      Effect.provide(Layer.succeed(BlendTypeConfig, mockBlendTypeConfig)),
      Effect.provide(unusedUrlFetchLayer()),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error.message).toContain('signed URL')
    })
  })

  it('fails when buffer is empty', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 'storage-object-1', name: 'file.txt' }])

    const exit = await uploadSingleDatasetEffect({
      step: '0',
      storageObjectId: 'storage-object-1',
      galaxyHistoryId: 'galaxy-history-1',
      historyId: 1,
      ownerId: 'owner-uuid-1',
      event: mockEvent,
      shouldUseFileUpload: true,
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(signedUrlSupabaseLayer()),
      Effect.provide(createSuccessLayer(mockGalaxyResponse)),
      Effect.provide(Layer.succeed(BlendTypeConfig, mockBlendTypeConfig)),
      Effect.provide(createMockUrlFetchLayer(emptyBufferResponse())),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toContain('is empty')
    })
  })

  it('fails with UnexpectedUploadResultError when Galaxy returns 0 outputs', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 'storage-object-1', name: 'file.txt' }])

    const exit = await uploadSingleDatasetEffect({
      step: '0',
      storageObjectId: 'storage-object-1',
      galaxyHistoryId: 'galaxy-history-1',
      historyId: 1,
      ownerId: 'owner-uuid-1',
      event: mockEvent,
      shouldUseFileUpload: false,
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(signedUrlSupabaseLayer()),
      Effect.provide(createSuccessLayer({ outputs: [] })),
      Effect.provide(Layer.succeed(BlendTypeConfig, mockBlendTypeConfig)),
      Effect.provide(unusedUrlFetchLayer()),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(UnexpectedUploadResultError)
      expect(error.message).toContain('returned 0 outputs')
    })
  })

  it('fails with UnexpectedUploadResultError when Galaxy returns multiple outputs', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 'storage-object-1', name: 'file.txt' }])

    const exit = await uploadSingleDatasetEffect({
      step: '0',
      storageObjectId: 'storage-object-1',
      galaxyHistoryId: 'galaxy-history-1',
      historyId: 1,
      ownerId: 'owner-uuid-1',
      event: mockEvent,
      shouldUseFileUpload: false,
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(signedUrlSupabaseLayer()),
      Effect.provide(createSuccessLayer({
        outputs: [
          { id: 'ds-1', name: 'Dataset 1', uuid: 'uuid-1', file_ext: 'txt', create_time: '2024-01-01' },
          { id: 'ds-2', name: 'Dataset 2', uuid: 'uuid-2', file_ext: 'txt', create_time: '2024-01-01' },
        ],
      })),
      Effect.provide(Layer.succeed(BlendTypeConfig, mockBlendTypeConfig)),
      Effect.provide(unusedUrlFetchLayer()),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(UnexpectedUploadResultError)
      expect(error.message).toContain('returned 2 outputs')
    })
  })

  it('propagates errors on Galaxy upload failure', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 'storage-object-1', name: 'file.txt' }])

    const uploadError = new Error('Upload failed')

    const exit = await uploadSingleDatasetEffect({
      step: '0',
      storageObjectId: 'storage-object-1',
      galaxyHistoryId: 'galaxy-history-1',
      historyId: 1,
      ownerId: 'owner-uuid-1',
      event: mockEvent,
      shouldUseFileUpload: false,
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(signedUrlSupabaseLayer()),
      Effect.provide(createFailureLayer(uploadError)),
      Effect.provide(Layer.succeed(BlendTypeConfig, mockBlendTypeConfig)),
      Effect.provide(unusedUrlFetchLayer()),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      // The error gets wrapped by deleteHistoryEffect which also uses GalaxyFetch
      expect(error.message).toContain('Upload failed')
    })
  })
})

// ============================================================================
// Tests: uploadDatasetsEffect
// ============================================================================

describe('uploadDatasetsEffect', () => {
  it('uploads multiple datasets in parallel', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 'storage-object-1', name: 'file.txt' }])

    const result = await uploadDatasetsEffect({
      datamap: {
        0: { storage_object_id: 'storage-object-1' },
        1: { storage_object_id: 'storage-object-2' },
      },
      galaxyHistoryId: 'galaxy-history-1',
      historyId: 1,
      ownerId: 'owner-uuid-1',
      event: mockEvent,
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(signedUrlSupabaseLayer()),
      Effect.provide(createSuccessLayer(mockGalaxyResponse)),
      Effect.provide(Layer.succeed(BlendTypeConfig, mockBlendTypeConfig)),
      Effect.provide(unusedUrlFetchLayer()),
      Effect.runPromise,
    )

    expect(result).toHaveLength(2)
  })

  it.skip('forces blob upload when Supabase is localhost', async () => {
    // TODO: Fix - useRuntimeConfig() is not mocked for URL upload auto-detection
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 'storage-object-1', name: 'file.txt' }])

    const result = await uploadDatasetsEffect({
      datamap: {
        0: { storage_object_id: 'storage-object-1' },
      },
      galaxyHistoryId: 'galaxy-history-1',
      historyId: 1,
      ownerId: 'owner-uuid-1',
      event: mockEvent,
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(signedUrlSupabaseLayer()),
      Effect.provide(createSuccessLayer(mockGalaxyResponse)),
      Effect.provide(Layer.succeed(BlendTypeConfig, mockBlendTypeConfig)),
      Effect.provide(createMockUrlFetchLayer(validBufferResponse())),
      Effect.runPromise,
    )

    expect(result).toHaveLength(1)
  })

  it('uses URL upload in production', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 'storage-object-1', name: 'file.txt' }])

    const result = await uploadDatasetsEffect({
      datamap: {
        0: { storage_object_id: 'storage-object-1' },
      },
      galaxyHistoryId: 'galaxy-history-1',
      historyId: 1,
      ownerId: 'owner-uuid-1',
      event: mockEvent,
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(signedUrlSupabaseLayer()),
      Effect.provide(createSuccessLayer(mockGalaxyResponse)),
      Effect.provide(Layer.succeed(BlendTypeConfig, mockBlendTypeConfig)),
      Effect.provide(unusedUrlFetchLayer()),
      Effect.runPromise,
    )

    expect(result).toHaveLength(1)
  })
})

// ============================================================================
// Tests: isDatasetTerminalState
// ============================================================================

describe('isDatasetTerminalState', () => {
  it('returns true for terminal states', () => {
    expect(isDatasetTerminalState('ok')).toBe(true)
    expect(isDatasetTerminalState('error')).toBe(true)
    expect(isDatasetTerminalState('empty')).toBe(true)
    expect(isDatasetTerminalState('discarded')).toBe(true)
    expect(isDatasetTerminalState('failed_metadata')).toBe(true)
  })

  it('returns false for non-terminal states', () => {
    expect(isDatasetTerminalState('new')).toBe(false)
    expect(isDatasetTerminalState('upload')).toBe(false)
    expect(isDatasetTerminalState('queued')).toBe(false)
    expect(isDatasetTerminalState('running')).toBe(false)
    expect(isDatasetTerminalState('setting_metadata')).toBe(false)
    expect(isDatasetTerminalState('paused')).toBe(false)
    expect(isDatasetTerminalState('deferred')).toBe(false)
  })
})

// ============================================================================
// Tests: getStorageObject
// ============================================================================

describe('getStorageObject', () => {
  it('returns a storage object when found', async () => {
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

  it('returns null when not found', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const result = await getStorageObject('nonexistent').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toBeNull()
  })

  it('fails with GetStorageObjectError on DB error', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.select.mockImplementation(() => {
      throw new Error('DB error')
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
