import type * as TusTypes from 'tus-js-client'
import type { TusUploadError } from '../src/histories'
import { Effect, pipe } from 'effect'
import * as tus from 'tus-js-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryError } from '../src/errors'
import {
  createHistory,
  createHistoryEffect,
  deleteHistory,
  deleteHistoryEffect,
  downloadDataset,
  downloadDatasetEffect,
  getHistories,
  getHistoriesEffect,
  getHistory,
  getHistoryEffect,
  uploadWithTus,
} from '../src/histories'

import {
  createFailureLayer,
  createHttpErrorLayer,
  createServiceUnavailableLayer,
  createSuccessLayer,
  createUrlTrackingLayer,
  ERROR_MESSAGES,
  expectFailure,
  extractFiberFailure,
  HTTP_STATUS_CODES,
  mockGalaxyDataset,
  mockGalaxyHistory,
} from './fixtures'

// Helper to create a File from string for testing
function createTestFile(content: string, filename: string): File {
  return new File([content], filename, { type: 'application/octet-stream' })
}

// Store test control variables
let mockUploadInstance: MockUploadInstance | undefined
let mockUrl: string | null | undefined

// Type for tracking captured callbacks from Upload constructor
interface MockUploadInstance {
  url: string | null
  options: TusTypes.UploadOptions
  file: TusTypes.FileSource
  start: ReturnType<typeof vi.fn>
  abort: ReturnType<typeof vi.fn>
  findPreviousUploads: ReturnType<typeof vi.fn>
  resumeFromPreviousUpload: ReturnType<typeof vi.fn>
  triggerSuccess: () => void
  triggerError: (error: Error) => void
}

// Mock tus-js-client using importOriginal pattern
// This ensures the mock stays in sync with actual API changes
vi.mock('tus-js-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('tus-js-client')>()

  // Create a mock constructor function that behaves like a class constructor
  // and wrap it in vi.fn() to make it spyable
  // eslint-disable-next-line prefer-arrow-callback
  const MockUploadConstructor = vi.fn().mockImplementation(function (_source: any, options: TusTypes.UploadOptions) {
    // Create mock upload instance with captured options
    mockUploadInstance = {
      url: mockUrl ?? null,
      options,
      file: _source,
      start: vi.fn(),
      abort: vi.fn(),
      findPreviousUploads: vi.fn().mockResolvedValue([]),
      resumeFromPreviousUpload: vi.fn().mockResolvedValue(false),
      triggerSuccess: () => {
        // Update the URL before calling success callback
        mockUploadInstance!.url = mockUrl ?? null
        // Call the success callback with a proper OnSuccessPayload
        const payload: tus.OnSuccessPayload = {
          lastResponse: undefined as any,
        }
        options?.onSuccess?.(payload)
      },
      triggerError: (error: Error) => {
        // Create a DetailedError-like object
        const detailedError = new Error(error.message) as tus.DetailedError
        options?.onError?.(detailedError)
      },
    } as unknown as MockUploadInstance

    return mockUploadInstance as unknown as tus.Upload
  })

  // Add static methods from original Upload class
  Object.assign(MockUploadConstructor, actual.Upload)

  return {
    ...actual,
    Upload: MockUploadConstructor,
  }
})

// ============================================================================
// createHistoryEffect
// ============================================================================

describe('createHistoryEffect', () => {
  it('should successfully create a history', () =>
    pipe(
      Effect.gen(function* () {
        const history = yield* createHistoryEffect('New History')
        expect(history).toEqual(mockGalaxyHistory)
        expect(history.name).toBe('Test History')
      }),
      Effect.provide(createSuccessLayer(mockGalaxyHistory)),
      Effect.runPromise,
    ))

  it('should construct correct API URL', () =>
    pipe(
      Effect.gen(function* () {
        const trackingLayer = createUrlTrackingLayer(mockGalaxyHistory)
        yield* createHistoryEffect('My History').pipe(
          Effect.provide(trackingLayer),
        )
        expect(trackingLayer.getLastUrl()).toBe('api/histories')
      }),
      Effect.runPromise,
    ))

  it('should handle network failures', () =>
    pipe(
      Effect.gen(function* () {
        const exit = yield* Effect.exit(createHistoryEffect('Fail History'))

        expectFailure(exit, (error) => {
          expect(error).toBeInstanceOf(HistoryError)
          expect(error.message).toContain('Error creating history')
        })
      }),
      Effect.provide(
        createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED)),
      ),
      Effect.runPromise,
    ))
})

describe('createHistory (Promise wrapper)', () => {
  it('should resolve with history data', async () => {
    const result = await createHistory('New History', createSuccessLayer(mockGalaxyHistory))
    expect(result).toEqual(mockGalaxyHistory)
  })

  it('should map Service Unavailable to GalaxyServiceUnavailable', async () => {
    try {
      await createHistory('Fail History', createServiceUnavailableLayer())
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect((inner as any)._tag).toBe('GalaxyServiceUnavailable')
    }
  })
})

// ============================================================================
// getHistoryEffect
// ============================================================================

describe('getHistoryEffect', () => {
  it('should successfully retrieve a history', () =>
    pipe(
      Effect.gen(function* () {
        const history = yield* getHistoryEffect('test-history-id')
        expect(history).toEqual(mockGalaxyHistory)
        expect(history.id).toBe('test-history-id')
      }),
      Effect.provide(createSuccessLayer(mockGalaxyHistory)),
      Effect.runPromise,
    ))

  it('should construct correct API URL', () =>
    pipe(
      Effect.gen(function* () {
        const trackingLayer = createUrlTrackingLayer(mockGalaxyHistory)
        yield* getHistoryEffect('hist-abc').pipe(
          Effect.provide(trackingLayer),
        )
        expect(trackingLayer.getLastUrl()).toBe('api/histories/hist-abc')
      }),
      Effect.runPromise,
    ))

  it('should handle 404 not found', () =>
    pipe(
      Effect.gen(function* () {
        const exit = yield* Effect.exit(getHistoryEffect('non-existent'))

        expectFailure(exit, (error) => {
          expect(error).toBeInstanceOf(HistoryError)
          expect(error.statusCode).toBe(HTTP_STATUS_CODES.NOT_FOUND)
          expect(error.historyId).toBe('non-existent')
        })
      }),
      Effect.provide(
        createHttpErrorLayer(HTTP_STATUS_CODES.NOT_FOUND, 'Not Found'),
      ),
      Effect.runPromise,
    ))
})

describe('getHistory (Promise wrapper)', () => {
  it('should resolve with history data', async () => {
    const result = await getHistory('test-history-id', createSuccessLayer(mockGalaxyHistory))
    expect(result).toEqual(mockGalaxyHistory)
  })

  it('should reject on failure', async () => {
    await expect(
      getHistory('test-history-id', createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED))),
    ).rejects.toThrow()
  })

  it('should map Service Unavailable to GalaxyServiceUnavailable', async () => {
    try {
      await getHistory('test-history-id', createServiceUnavailableLayer())
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect((inner as any)._tag).toBe('GalaxyServiceUnavailable')
    }
  })
})

// ============================================================================
// getHistoriesEffect
// ============================================================================

describe('getHistoriesEffect', () => {
  it('should successfully retrieve histories list', () =>
    pipe(
      Effect.gen(function* () {
        const histories = yield* getHistoriesEffect()
        expect(histories).toEqual([mockGalaxyHistory])
        expect(histories).toHaveLength(1)
      }),
      Effect.provide(createSuccessLayer([mockGalaxyHistory])),
      Effect.runPromise,
    ))

  it('should handle network failures', () =>
    pipe(
      Effect.gen(function* () {
        const exit = yield* Effect.exit(getHistoriesEffect())

        expectFailure(exit, (error) => {
          expect(error).toBeInstanceOf(HistoryError)
          expect(error.message).toContain('Error getting histories')
        })
      }),
      Effect.provide(
        createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED)),
      ),
      Effect.runPromise,
    ))
})

describe('getHistories (Promise wrapper)', () => {
  it('should resolve with histories list', async () => {
    const result = await getHistories(createSuccessLayer([mockGalaxyHistory]))
    expect(result).toEqual([mockGalaxyHistory])
  })

  it('should map Service Unavailable to GalaxyServiceUnavailable', async () => {
    try {
      await getHistories(createServiceUnavailableLayer())
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect((inner as any)._tag).toBe('GalaxyServiceUnavailable')
    }
  })
})

// ============================================================================
// deleteHistoryEffect
// ============================================================================

describe('deleteHistoryEffect', () => {
  it('should successfully delete a history', () =>
    pipe(
      Effect.gen(function* () {
        const result = yield* deleteHistoryEffect('hist-to-delete')
        expect(result).toEqual(mockGalaxyHistory)
      }),
      Effect.provide(createSuccessLayer(mockGalaxyHistory)),
      Effect.runPromise,
    ))

  it('should handle 404 not found', () =>
    pipe(
      Effect.gen(function* () {
        const exit = yield* Effect.exit(deleteHistoryEffect('non-existent'))

        expectFailure(exit, (error) => {
          expect(error).toBeInstanceOf(HistoryError)
          expect(error.statusCode).toBe(HTTP_STATUS_CODES.NOT_FOUND)
          expect(error.historyId).toBe('non-existent')
        })
      }),
      Effect.provide(
        createHttpErrorLayer(HTTP_STATUS_CODES.NOT_FOUND, 'Not Found'),
      ),
      Effect.runPromise,
    ))
})

describe('deleteHistory (Promise wrapper)', () => {
  it('should resolve on successful deletion', async () => {
    const result = await deleteHistory('hist-to-delete', createSuccessLayer(mockGalaxyHistory))
    expect(result).toEqual(mockGalaxyHistory)
  })

  it('should map Service Unavailable to GalaxyServiceUnavailable', async () => {
    try {
      await deleteHistory('hist-to-delete', createServiceUnavailableLayer())
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect((inner as any)._tag).toBe('GalaxyServiceUnavailable')
    }
  })
})

// ============================================================================
// downloadDatasetEffect
// ============================================================================

describe('downloadDatasetEffect', () => {
  it('should return empty blob when file_size is 0', () =>
    pipe(
      Effect.gen(function* () {
        // The first call to fetchApi returns the dataset description (via getDatasetEffect),
        // the second would return the blob. With file_size=0, only one call is made.
        const result = yield* downloadDatasetEffect('hist-1', 'ds-1')
        expect(result).toBeInstanceOf(Blob)
        expect(result.size).toBe(0)
      }),
      Effect.provide(createSuccessLayer({ ...mockGalaxyDataset, file_size: 0 })),
      Effect.runPromise,
    ))

  it('should handle network failures', () =>
    pipe(
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          downloadDatasetEffect('hist-1', 'ds-1'),
        )

        // downloadDatasetEffect first calls getDatasetEffect, which fails
        // with DatasetError when the fetch layer fails
        expectFailure(exit, (error) => {
          expect((error as any)._tag).toBeDefined()
        })
      }),
      Effect.provide(
        createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED)),
      ),
      Effect.runPromise,
    ))
})

describe('downloadDataset (Promise wrapper)', () => {
  it('should resolve with empty blob for zero-size dataset', async () => {
    const result = await downloadDataset(
      'hist-1',
      'ds-1',
      createSuccessLayer({ ...mockGalaxyDataset, file_size: 0 }),
    )
    expect(result).toBeInstanceOf(Blob)
    expect(result.size).toBe(0)
  })

  it('should map Service Unavailable to GalaxyServiceUnavailable', async () => {
    try {
      await downloadDataset('hist-1', 'ds-1', createServiceUnavailableLayer())
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect((inner as any)._tag).toBe('GalaxyServiceUnavailable')
    }
  })
})

// ============================================================================
// uploadWithTus
// ============================================================================

describe('uploadWithTus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUploadInstance = undefined
    mockUrl = undefined
  })

  describe('success cases', () => {
    it('should successfully upload and extract session ID from URL', () => {
      return pipe(
        Effect.gen(function* () {
          const file = createTestFile('test content', 'test.txt')
          const metadata = {
            history_id: 'test-history-id',
            name: 'test.txt',
            file_type: 'auto',
            dbkey: '?',
          }

          // Set the URL that will be returned
          mockUrl = 'https://galaxy.example.com/api/upload/resumable_upload/session-abc123'

          const effect = uploadWithTus(
            file,
            'https://galaxy.example.com/api/upload/resumable_upload/',
            metadata,
            'test-api-key',
            10485760,
          )

          // Trigger success callback asynchronously
          setTimeout(() => mockUploadInstance?.triggerSuccess(), 10)

          const result = yield* effect
          expect(result).toBe('session-abc123')
        }),
        Effect.runPromise,
      )
    })

    it('should handle URL with multiple path segments', () => {
      return pipe(
        Effect.gen(function* () {
          const file = createTestFile('test content', 'data.csv')
          const metadata = {
            history_id: 'history-456',
            name: 'data.csv',
            file_type: 'csv',
            dbkey: '?',
          }

          mockUrl = 'https://galaxy.example.com/upload/api/v1/resumable_upload/uploads/session-xyz789'

          const effect = uploadWithTus(
            file,
            'https://galaxy.example.com/upload/api/v1/resumable_upload/',
            metadata,
            'api-key-123',
            10485760,
          )

          setTimeout(() => mockUploadInstance?.triggerSuccess(), 10)

          const result = yield* effect
          expect(result).toBe('session-xyz789')
        }),
        Effect.runPromise,
      )
    })

    it('should use custom chunk size when provided', () => {
      return pipe(
        Effect.gen(function* () {
          const file = createTestFile('a'.repeat(100), 'small.txt')
          const customChunkSize = 5242880 // 5MB
          const metadata = {
            history_id: 'history-123',
            name: 'small.txt',
            file_type: 'auto',
            dbkey: '?',
          }

          mockUrl = 'https://galaxy.example.com/api/upload/resumable_upload/session-chunk'

          const effect = uploadWithTus(
            file,
            'https://galaxy.example.com/api/upload/resumable_upload/',
            metadata,
            'api-key',
            customChunkSize,
          )

          setTimeout(() => mockUploadInstance?.triggerSuccess(), 10)

          yield* effect

          // Verify Upload was called with custom chunk size
          expect(vi.mocked(tus.Upload)).toHaveBeenCalledWith(
            file,
            expect.objectContaining({
              chunkSize: customChunkSize,
            }),
          )
        }),
        Effect.runPromise,
      )
    })

    it('should pass correct configuration to TUS Upload', () => {
      return pipe(
        Effect.gen(function* () {
          const file = createTestFile('test', 'myfile.txt')
          const endpoint = 'https://galaxy.example.com/api/upload/resumable_upload/'
          const apiKey = 'my-api-key'
          const metadata = {
            history_id: 'hist-123',
            name: 'myfile.txt',
            file_type: 'txt',
            dbkey: '?',
          }

          mockUrl = 'https://galaxy.example.com/api/upload/resumable_upload/session-123'

          const effect = uploadWithTus(file, endpoint, metadata, apiKey)

          setTimeout(() => mockUploadInstance?.triggerSuccess(), 10)

          yield* effect

          expect(vi.mocked(tus.Upload)).toHaveBeenCalledWith(
            file,
            expect.objectContaining({
              endpoint,
              retryDelays: [0, 3000, 10000],
              metadata,
              headers: {
                'x-api-key': apiKey,
              },
            }),
          )
        }),
        Effect.runPromise,
      )
    })
  })

  describe('error cases', () => {
    it('should fail with TusUploadError on upload failure', () => {
      return pipe(
        Effect.gen(function* () {
          const file = createTestFile('test', 'test.txt')
          const metadata = {
            history_id: '123',
            name: 'test.txt',
            file_type: 'auto',
            dbkey: '?',
          }

          const effect = uploadWithTus(
            file,
            'https://galaxy.example.com/api/upload/resumable_upload/',
            metadata,
            'api-key',
          )

          // Trigger error callback asynchronously
          setTimeout(() => mockUploadInstance?.triggerError(new Error('Upload failed: network timeout')), 10)

          const exit = yield* Effect.exit(effect)

          expectFailure(exit, (error: TusUploadError) => {
            expect(error).toBeInstanceOf(Error)
            expect('_tag' in error && error._tag).toBe('TusUploadError')
            expect('message' in error && error.message).toBe('TUS upload failed: Upload failed: network timeout')
            expect('cause' in error && error.cause).toBeInstanceOf(Error)
          })
        }),
        Effect.runPromise,
      )
    })

    it('should handle error with empty message', () => {
      return pipe(
        Effect.gen(function* () {
          const file = createTestFile('test', 'test.txt')
          const metadata = {
            history_id: '123',
            name: 'test.txt',
            file_type: 'auto',
            dbkey: '?',
          }

          const effect = uploadWithTus(
            file,
            'https://galaxy.example.com/api/upload/resumable_upload/',
            metadata,
            'api-key',
          )

          setTimeout(() => mockUploadInstance?.triggerError(new Error('Empty error happened')), 10)

          const exit = yield* Effect.exit(effect)

          expectFailure(exit, (error: TusUploadError) => {
            expect('_tag' in error && error._tag).toBe('TusUploadError')
            expect('message' in error && error.message).toBe('TUS upload failed: Empty error happened')
          })
        }),
        Effect.runPromise,
      )
    })
  })

  describe('edge cases', () => {
    it('should return empty string when URL is undefined', () => {
      return pipe(
        Effect.gen(function* () {
          const file = createTestFile('test', 'test.txt')
          const metadata = {
            history_id: '123',
            name: 'test.txt',
            file_type: 'auto',
            dbkey: '?',
          }

          mockUrl = undefined

          const effect = uploadWithTus(
            file,
            'https://galaxy.example.com/api/upload/resumable_upload/',
            metadata,
            'api-key',
          )

          setTimeout(() => mockUploadInstance?.triggerSuccess(), 10)

          const result = yield* effect
          expect(result).toBe('')
        }),
        Effect.runPromise,
      )
    })

    it('should handle URL ending with trailing slash', () => {
      return pipe(
        Effect.gen(function* () {
          const file = createTestFile('test', 'test.txt')
          const metadata = {
            history_id: '123',
            name: 'test.txt',
            file_type: 'auto',
            dbkey: '?',
          }

          mockUrl = 'https://galaxy.example.com/api/upload/resumable_upload/session-trailing/'

          const effect = uploadWithTus(
            file,
            'https://galaxy.example.com/api/upload/resumable_upload/',
            metadata,
            'api-key',
          )

          setTimeout(() => mockUploadInstance?.triggerSuccess(), 10)

          const result = yield* effect
          expect(result).toBe('')
        }),
        Effect.runPromise,
      )
    })

    it('should handle empty file', () => {
      return pipe(
        Effect.gen(function* () {
          const file = createTestFile('', 'empty.txt')
          const metadata = {
            history_id: '123',
            name: 'empty.txt',
            file_type: 'auto',
            dbkey: '?',
          }

          mockUrl = 'https://galaxy.example.com/api/upload/resumable_upload/session-empty'

          const effect = uploadWithTus(
            file,
            'https://galaxy.example.com/api/upload/resumable_upload/',
            metadata,
            'api-key',
          )

          setTimeout(() => mockUploadInstance?.triggerSuccess(), 10)

          const result = yield* effect
          expect(result).toBe('session-empty')

          // Verify file was passed correctly
          expect(vi.mocked(tus.Upload)).toHaveBeenCalledWith(
            file,
            expect.any(Object),
          )
        }),
        Effect.runPromise,
      )
    })

    it('should default chunk size to 10485760 when not specified', () => {
      return pipe(
        Effect.gen(function* () {
          const file = createTestFile('test', 'test.txt')
          const metadata = {
            history_id: '123',
            name: 'test.txt',
            file_type: 'auto',
            dbkey: '?',
          }

          mockUrl = 'https://galaxy.example.com/api/upload/resumable_upload/session-default'

          const effect = uploadWithTus(
            file,
            'https://galaxy.example.com/api/upload/resumable_upload/',
            metadata,
            'api-key',
            // No chunkSize parameter - should use default
          )

          setTimeout(() => mockUploadInstance?.triggerSuccess(), 10)

          yield* effect

          expect(vi.mocked(tus.Upload)).toHaveBeenCalledWith(
            expect.any(File),
            expect.objectContaining({
              chunkSize: 10485760,
            }),
          )
        }),
        Effect.runPromise,
      )
    })

    it('should handle URL with only domain (no path)', () => {
      return pipe(
        Effect.gen(function* () {
          const file = createTestFile('test', 'test.txt')
          const metadata = {
            history_id: '123',
            name: 'test.txt',
            file_type: 'auto',
            dbkey: '?',
          }

          mockUrl = 'https://galaxy.example.com'

          const effect = uploadWithTus(
            file,
            'https://galaxy.example.com/api/upload/resumable_upload/',
            metadata,
            'api-key',
          )

          setTimeout(() => mockUploadInstance?.triggerSuccess(), 10)

          const result = yield* effect
          expect(result).toBe('galaxy.example.com')
        }),
        Effect.runPromise,
      )
    })
  })
})
