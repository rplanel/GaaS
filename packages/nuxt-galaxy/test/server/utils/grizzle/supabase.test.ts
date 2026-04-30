import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  createSignedUrl,
  CreateSignedUrlError,
  getSupabaseUser,
  GetSupabaseUserError,
  uploadFileToStorage,
  UploadFileToStorageError,
} from '../../../../src/runtime/server/utils/grizzle/supabase'
import {
  createMockEvent,
  createMockServerSupabaseClientLayer,
  expectFailure,
  mockSupabaseUser,
} from '../../fixtures'

describe('getSupabaseUser', () => {
  it('should return the authenticated user on success', async () => {
    const { layer } = createMockServerSupabaseClientLayer()
    const event = createMockEvent()

    const result = await getSupabaseUser(event).pipe(
      Effect.provide(layer),
      Effect.runPromise,
    )

    expect(result).toEqual(mockSupabaseUser)
  })

  it('should fail with GetSupabaseUserError when auth fails', async () => {
    const { layer } = createMockServerSupabaseClientLayer({
      authUser: null,
      authError: { message: 'Invalid token', code: 'invalid_jwt' },
    })
    const event = createMockEvent()

    const exit = await getSupabaseUser(event).pipe(
      Effect.provide(layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(GetSupabaseUserError)
      expect(error.message).toContain('Failed to get auth user')
    })
  })
})

describe('uploadFileToStorage', () => {
  it('should upload a file and return id and path', async () => {
    const { layer } = createMockServerSupabaseClientLayer({
      storageResult: {
        data: { id: 'uploaded-id', path: 'uuid/test-file.txt' },
        error: null,
      },
    })
    const event = createMockEvent()
    const blob = new Blob(['test content'], { type: 'text/plain' })

    const result = await uploadFileToStorage(event, 'test-file.txt', blob).pipe(
      Effect.provide(layer),
      Effect.runPromise,
    )

    expect(result).toEqual({
      id: 'uploaded-id',
      path: 'uuid/test-file.txt',
    })
  })

  it('should fail with UploadFileToStorageError when upload fails', async () => {
    const { layer } = createMockServerSupabaseClientLayer({
      storageResult: {
        data: null,
        error: { message: 'Bucket not found' },
      },
    })
    const event = createMockEvent()
    const blob = new Blob(['test content'])

    const exit = await uploadFileToStorage(event, 'test-file.txt', blob).pipe(
      Effect.provide(layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(UploadFileToStorageError)
      expect(error.message).toContain('Bucket not found')
    })
  })
})

describe('createSignedUrl', () => {
  it('should return a signed URL on success', async () => {
    const { layer, mockClient } = createMockServerSupabaseClientLayer()
    // Override storage mock for signed URL
    const storageFromSpy = mockClient.storage.from as ReturnType<typeof import('vitest').vi.fn>
    storageFromSpy.mockReturnValue({
      createSignedUrl: () => Promise.resolve({
        data: { signedUrl: 'https://example.com/signed-url' },
        error: null,
      }),
    })

    const event = createMockEvent()

    const result = await createSignedUrl(event, 'path/to/file.txt').pipe(
      Effect.provide(layer),
      Effect.runPromise,
    )

    expect(result).toBe('https://example.com/signed-url')
  })

  it('should fail with CreateSignedUrlError when signing fails', async () => {
    const { layer, mockClient } = createMockServerSupabaseClientLayer()
    const storageFromSpy = mockClient.storage.from as ReturnType<typeof import('vitest').vi.fn>
    storageFromSpy.mockReturnValue({
      createSignedUrl: () => Promise.resolve({
        data: null,
        error: { message: 'Object not found' },
      }),
    })

    const event = createMockEvent()

    const exit = await createSignedUrl(event, 'path/to/nonexistent.txt').pipe(
      Effect.provide(layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(CreateSignedUrlError)
      expect(error.message).toContain('Object not found')
    })
  })
})
