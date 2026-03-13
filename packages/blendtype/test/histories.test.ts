import type * as TusTypes from 'tus-js-client'
import type { TusUploadError } from '../src/histories'
import { Buffer } from 'node:buffer'
import { Effect, pipe } from 'effect'
import * as tus from 'tus-js-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadWithTus } from '../src/histories'

import { expectFailure } from './fixtures'

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
  return {
    ...actual,
    Upload: vi.fn(),
  }
})

describe('uploadWithTus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUploadInstance = undefined
    mockUrl = undefined

    // Configure the mock implementation for each test
    vi.mocked(tus.Upload).mockImplementation((_source, options) => {
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
    },
    )
  })

  describe('success cases', () => {
    it('should successfully upload and extract session ID from URL', () => {
      return pipe(
        Effect.gen(function* () {
          const buffer = Buffer.from('test content')
          const metadata = {
            history_id: 'test-history-id',
            name: 'test.txt',
            file_type: 'auto',
            dbkey: '?',
          }

          // Set the URL that will be returned
          mockUrl = 'https://galaxy.example.com/api/upload/resumable_upload/session-abc123'

          const effect = uploadWithTus(
            buffer,
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
          const buffer = Buffer.from('test content')
          const metadata = {
            history_id: 'history-456',
            name: 'data.csv',
            file_type: 'csv',
            dbkey: '?',
          }

          mockUrl = 'https://galaxy.example.com/upload/api/v1/resumable_upload/uploads/session-xyz789'

          const effect = uploadWithTus(
            buffer,
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
          const buffer = Buffer.from('a'.repeat(100))
          const customChunkSize = 5242880 // 5MB
          const metadata = {
            history_id: 'history-123',
            name: 'small.txt',
            file_type: 'auto',
            dbkey: '?',
          }

          mockUrl = 'https://galaxy.example.com/api/upload/resumable_upload/session-chunk'

          const effect = uploadWithTus(
            buffer,
            'https://galaxy.example.com/api/upload/resumable_upload/',
            metadata,
            'api-key',
            customChunkSize,
          )

          setTimeout(() => mockUploadInstance?.triggerSuccess(), 10)

          yield* effect

          // Verify Upload was called with custom chunk size
          expect(vi.mocked(tus.Upload)).toHaveBeenCalledWith(
            buffer,
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
          const buffer = Buffer.from('test')
          const endpoint = 'https://galaxy.example.com/api/upload/resumable_upload/'
          const apiKey = 'my-api-key'
          const metadata = {
            history_id: 'hist-123',
            name: 'myfile.txt',
            file_type: 'txt',
            dbkey: '?',
          }

          mockUrl = 'https://galaxy.example.com/api/upload/resumable_upload/session-123'

          const effect = uploadWithTus(buffer, endpoint, metadata, apiKey)

          setTimeout(() => mockUploadInstance?.triggerSuccess(), 10)

          yield* effect

          expect(vi.mocked(tus.Upload)).toHaveBeenCalledWith(
            buffer,
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
          const buffer = Buffer.from('test')
          const metadata = {
            history_id: '123',
            name: 'test.txt',
            file_type: 'auto',
            dbkey: '?',
          }

          const effect = uploadWithTus(
            buffer,
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
          const buffer = Buffer.from('test')
          const metadata = {
            history_id: '123',
            name: 'test.txt',
            file_type: 'auto',
            dbkey: '?',
          }

          const effect = uploadWithTus(
            buffer,
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
          const buffer = Buffer.from('test')
          const metadata = {
            history_id: '123',
            name: 'test.txt',
            file_type: 'auto',
            dbkey: '?',
          }

          mockUrl = undefined

          const effect = uploadWithTus(
            buffer,
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
          const buffer = Buffer.from('test')
          const metadata = {
            history_id: '123',
            name: 'test.txt',
            file_type: 'auto',
            dbkey: '?',
          }

          mockUrl = 'https://galaxy.example.com/api/upload/resumable_upload/session-trailing/'

          const effect = uploadWithTus(
            buffer,
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

    it('should handle empty buffer', () => {
      return pipe(
        Effect.gen(function* () {
          const buffer = Buffer.alloc(0)
          const metadata = {
            history_id: '123',
            name: 'empty.txt',
            file_type: 'auto',
            dbkey: '?',
          }

          mockUrl = 'https://galaxy.example.com/api/upload/resumable_upload/session-empty'

          const effect = uploadWithTus(
            buffer,
            'https://galaxy.example.com/api/upload/resumable_upload/',
            metadata,
            'api-key',
          )

          setTimeout(() => mockUploadInstance?.triggerSuccess(), 10)

          const result = yield* effect
          expect(result).toBe('session-empty')

          // Verify buffer was passed correctly
          expect(vi.mocked(tus.Upload)).toHaveBeenCalledWith(
            buffer,
            expect.any(Object),
          )
        }),
        Effect.runPromise,
      )
    })

    it('should default chunk size to 10485760 when not specified', () => {
      return pipe(
        Effect.gen(function* () {
          const buffer = Buffer.from('test')
          const metadata = {
            history_id: '123',
            name: 'test.txt',
            file_type: 'auto',
            dbkey: '?',
          }

          mockUrl = 'https://galaxy.example.com/api/upload/resumable_upload/session-default'

          const effect = uploadWithTus(
            buffer,
            'https://galaxy.example.com/api/upload/resumable_upload/',
            metadata,
            'api-key',
            // No chunkSize parameter - should use default
          )

          setTimeout(() => mockUploadInstance?.triggerSuccess(), 10)

          yield* effect

          expect(vi.mocked(tus.Upload)).toHaveBeenCalledWith(
            expect.any(Buffer),
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
          const buffer = Buffer.from('test')
          const metadata = {
            history_id: '123',
            name: 'test.txt',
            file_type: 'auto',
            dbkey: '?',
          }

          mockUrl = 'https://galaxy.example.com'

          const effect = uploadWithTus(
            buffer,
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
