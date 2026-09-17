import type { RoleType } from '../../../../src/runtime/types/nuxt-galaxy'
import { useRuntimeConfig } from '#imports'
import { and, eq } from 'drizzle-orm'
import { Effect, Either } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { roles } from '../../../../src/runtime/server/db/schema/galaxyRbac/roles'
import { userRoles } from '../../../../src/runtime/server/db/schema/galaxyRbac/userRoles'
import {
  createServiceRoleSupabaseClient,
  createSignedUrl,
  CreateSignedUrlError,
  getSupabaseUser,
  GetSupabaseUserError,
  requireRole,
  uploadFileToStorage,
  UploadFileToStorageError,
  uploadStreamToStorage,
} from '../../../../src/runtime/server/utils/grizzle/supabase'
import {
  createMockDrizzle,
  createMockEvent,
  createMockServerSupabaseClientLayer,
  expectFailure,
  mockDrizzleSelectRejects,
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
    const { layer, mockClient } = createMockServerSupabaseClientLayer({
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
    expect(mockClient.storage.from).toHaveBeenCalledWith('analysis_files')
    const storageChain = mockClient.storage.from.mock.results[0]?.value
    expect(storageChain.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]+\/test-file\.txt$/),
      expect.any(ReadableStream),
    )
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
    const createSignedUrlSpy = vi.fn(() =>
      Promise.resolve({
        data: { signedUrl: 'https://example.com/signed-url' },
        error: null,
      }),
    )
    const storageFromSpy = vi.spyOn(mockClient.storage, 'from').mockReturnValue({
      createSignedUrl: createSignedUrlSpy,
    } as any)

    const event = createMockEvent()

    const result = await createSignedUrl(event, 'path/to/file.txt').pipe(
      Effect.provide(layer),
      Effect.runPromise,
    )

    expect(result).toBe('https://example.com/signed-url')
    expect(storageFromSpy).toHaveBeenCalledWith('analysis_files')
    expect(createSignedUrlSpy).toHaveBeenCalledWith('path/to/file.txt', 60)
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

describe('createServiceRoleSupabaseClient', () => {
  it('creates a client from runtime config', async () => {
    vi.mocked(useRuntimeConfig).mockReturnValueOnce({
      public: { supabase: { url: 'http://localhost:54321' } },
      supabase: { serviceKey: 'test-service-key' },
    } as any)

    const client = await Effect.runPromise(createServiceRoleSupabaseClient())
    expect(client).toBeDefined()
    expect(vi.mocked(useRuntimeConfig)).toHaveBeenCalled()
  })

  it('fails when service key is missing', async () => {
    vi.mocked(useRuntimeConfig).mockReturnValueOnce({
      public: { supabase: { url: 'http://localhost:54321' } },
      supabase: {},
    } as any)

    const originalEnv = { ...process.env }
    const keysToRemove = [
      'SUPABASE_SERVICE_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'NUXT_SUPABASE_SECRET_KEY',
      'NUXT_SUPABASE_SERVICE_KEY',
      'NUXT_SUPABASE_SERVICE_ROLE_KEY',
    ]
    for (const key of keysToRemove) delete process.env[key]

    try {
      const exit = await Effect.runPromiseExit(createServiceRoleSupabaseClient())
      expect(exit._tag).toBe('Failure')
    }
    finally {
      process.env = originalEnv
    }
  })
})

describe('uploadStreamToStorage', () => {
  it('uploads a stream to analysis_files bucket', async () => {
    const uploadSpy = vi.fn(() => Promise.resolve({ data: { id: 'oid', path: 'path' }, error: null }))
    const fromSpy = vi.fn(() => ({ upload: uploadSpy }))
    const supabase = {
      storage: {
        from: fromSpy,
      },
    } as any
    const stream = new ReadableStream()

    const result = await Effect.runPromise(uploadStreamToStorage(supabase, 'folder/file.txt', stream))

    expect(result).toEqual({ id: 'oid', path: 'path' })
    expect(fromSpy).toHaveBeenCalledWith('analysis_files')
    expect(uploadSpy).toHaveBeenCalledWith('folder/file.txt', expect.any(ReadableStream))
  })
})

describe('requireRole', () => {
  async function resolveRequireRoleFor(drizzle: ReturnType<typeof createMockDrizzle>, role: string) {
    const either = await Effect.runPromise(
      Effect.either(requireRole({ id: 'user-id' }, role as RoleType).pipe(Effect.provide(drizzle.layer))),
    )
    return Either.match(either, {
      onRight: () => ({ _tag: '__success__' }),
      onLeft: error => error,
    })
  }

  function resolveRequireRole(drizzle: ReturnType<typeof createMockDrizzle>) {
    return resolveRequireRoleFor(drizzle, 'admin')
  }

  it('succeeds (Unit) when the user holds the requested role (D-03)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ userId: 'user-id' }])

    const outcome = await resolveRequireRole(drizzle)

    expect(outcome).toEqual({ _tag: '__success__' })
    expect(drizzle.mock.select).toHaveBeenCalledTimes(1)
    const limitCall = drizzle.mock.select.mock.results[0]?.value.limit.mock.calls[0]?.[0]
    expect(limitCall).toBe(1)
  })

  it('fails with ForbiddenError when the user has no matching role row (403)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const outcome = await resolveRequireRole(drizzle)

    expect(outcome).not.toEqual({ _tag: '__success__' })
    expect((outcome as { _tag: string })._tag).toBe('ForbiddenError')
  })

  it('catches a rejected role query into AdminRoleCheckError (500)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.select.mockImplementation(
      mockDrizzleSelectRejects(['from', 'innerJoin', 'where', 'limit'], new Error('boom')),
    )

    const outcome = await resolveRequireRole(drizzle)

    expect((outcome as { _tag: string })._tag).toBe('AdminRoleCheckError')
    expect((outcome as { message: string }).message).toContain('boom')
  })

  it('is role-agnostic: works for a non-admin role name (D-06)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ userId: 'user-id' }])

    const outcome = await resolveRequireRoleFor(drizzle, 'user')

    // The same userRoles ⋈ roles join grants a non-admin role name too.
    expect(outcome).toEqual({ _tag: '__success__' })
    // The built WHERE filters on the passed role name, not a hardcoded 'admin'.
    const whereCall = drizzle.mock.select.mock.results[0]?.value.where.mock.calls[0]?.[0]
    expect(whereCall).toEqual(and(
      eq(userRoles.userId, 'user-id'),
      eq(roles.name, 'user'),
    ))
  })
})
