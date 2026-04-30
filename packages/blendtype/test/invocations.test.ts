import { Effect, pipe } from 'effect'
import { describe, expect, it } from 'vitest'
import { InvocationError } from '../src/errors'
import { getInvocation, getInvocationEffect } from '../src/invocations'
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
  mockGalaxyInvocation,
} from './fixtures'

// ============================================================================
// getInvocationEffect
// ============================================================================

describe('getInvocationEffect', () => {
  describe('success cases', () => {
    it('should successfully retrieve an invocation', () =>
      pipe(
        Effect.gen(function* () {
          const invocation = yield* getInvocationEffect('test-invocation-id')

          expect(invocation).toEqual(mockGalaxyInvocation)
          expect(invocation.id).toBe('test-invocation-id')
          expect(invocation.state).toBe('scheduled')
          expect(invocation.workflow_id).toBe('test-workflow-id')
        }),
        Effect.provide(createSuccessLayer(mockGalaxyInvocation)),
        Effect.runPromise,
      ))

    it('should construct correct API URL', () =>
      pipe(
        Effect.gen(function* () {
          const trackingLayer = createUrlTrackingLayer(mockGalaxyInvocation)
          yield* getInvocationEffect('inv-abc').pipe(
            Effect.provide(trackingLayer),
          )
          expect(trackingLayer.getLastUrl()).toBe('api/invocations/inv-abc')
        }),
        Effect.runPromise,
      ))
  })

  describe('error cases', () => {
    it('should handle network failures', () =>
      pipe(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            getInvocationEffect('test-invocation-id'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(InvocationError)
            expect(error.message).toContain('Error getting invocation test-invocation-id')
            expect(error.invocationId).toBe('test-invocation-id')
          })
        }),
        Effect.provide(
          createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED)),
        ),
        Effect.runPromise,
      ))

    it('should handle 404 not found error', () =>
      pipe(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            getInvocationEffect('non-existent'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(InvocationError)
            expect(error.statusCode).toBe(HTTP_STATUS_CODES.NOT_FOUND)
          })
        }),
        Effect.provide(
          createHttpErrorLayer(HTTP_STATUS_CODES.NOT_FOUND, 'Not Found'),
        ),
        Effect.runPromise,
      ))

    it('should handle 500 server error', () =>
      pipe(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            getInvocationEffect('broken-invocation'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(InvocationError)
            expect(error.statusCode).toBe(HTTP_STATUS_CODES.SERVER_ERROR)
          })
        }),
        Effect.provide(
          createHttpErrorLayer(HTTP_STATUS_CODES.SERVER_ERROR, 'Internal Server Error'),
        ),
        Effect.runPromise,
      ))

    it('should preserve original error in cause', () =>
      pipe(
        Effect.gen(function* () {
          const originalError = new Error('Original fetch error')
          const exit = yield* Effect.exit(
            getInvocationEffect('test-invocation').pipe(
              Effect.provide(createFailureLayer(originalError)),
            ),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(InvocationError)
            expect(error.cause).toBe(originalError)
          })
        }),
        Effect.runPromise,
      ))
  })
})

// ============================================================================
// getInvocation (Promise wrapper)
// ============================================================================

describe('getInvocation (Promise wrapper)', () => {
  it('should resolve with invocation data when given a success layer', async () => {
    const result = await getInvocation('test-invocation-id', createSuccessLayer(mockGalaxyInvocation))
    expect(result).toEqual(mockGalaxyInvocation)
    expect(result.id).toBe('test-invocation-id')
  })

  it('should reject when given a failure layer', async () => {
    await expect(
      getInvocation('test-invocation-id', createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED))),
    ).rejects.toThrow()
  })

  it('should map Service Unavailable to GalaxyServiceUnavailable', async () => {
    try {
      await getInvocation('test-invocation-id', createServiceUnavailableLayer())
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect((inner as any)._tag).toBe('GalaxyServiceUnavailable')
    }
  })

  it('should propagate HTTP status codes through the wrapper', async () => {
    try {
      await getInvocation('test-invocation-id', createHttpErrorLayer(HTTP_STATUS_CODES.NOT_FOUND, 'Not Found'))
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect(inner).toBeInstanceOf(InvocationError)
      expect((inner as InvocationError).statusCode).toBe(HTTP_STATUS_CODES.NOT_FOUND)
    }
  })
})
