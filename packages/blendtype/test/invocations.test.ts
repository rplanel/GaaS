import { Effect, pipe } from 'effect'
import { describe, expect, it } from 'vitest'
import { InvocationError } from '../src/errors'
import { getInvocation, getInvocationEffect, getInvocationJobsSummary, getInvocationJobsSummaryEffect } from '../src/invocations'
import { InvocationStates, InvocationTerminalStates } from '../src/types/invocation'
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
  mockGalaxyInvocationJobsSummary,
} from './fixtures'

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

    it('should construct correct API URL and URL-encode the invocation id', () =>
      pipe(
        Effect.gen(function* () {
          const trackingLayer = createUrlTrackingLayer(mockGalaxyInvocation)
          yield* getInvocationEffect('inv/abc').pipe(
            Effect.provide(trackingLayer),
          )
          expect(trackingLayer.getLastUrl()).toBe('api/invocations/inv%2Fabc')
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

describe('invocation state constants', () => {
  it('includes all Galaxy OpenAPI invocation states', () => {
    expect(InvocationStates).toEqual(expect.arrayContaining([
      'new',
      'requires_materialization',
      'ready',
      'scheduled',
      'cancelled',
      'cancelling',
      'failed',
      'completed',
    ]))
  })

  it('contains only the true Galaxy terminal states', () => {
    expect(InvocationTerminalStates).toEqual(['cancelled', 'failed', 'completed'])
  })
})

describe('getInvocationJobsSummaryEffect', () => {
  describe('success cases', () => {
    it('should successfully retrieve an invocation jobs summary', () =>
      pipe(
        Effect.gen(function* () {
          const summary = yield* getInvocationJobsSummaryEffect('test-invocation-id')

          expect(summary).toEqual(mockGalaxyInvocationJobsSummary)
          expect(summary.id).toBe('test-invocation-id')
          expect(summary.states).toEqual({ ok: 1 })
          expect(summary.populated_state).toBe('ok')
        }),
        Effect.provide(createSuccessLayer(mockGalaxyInvocationJobsSummary)),
        Effect.runPromise,
      ))

    it('should construct correct API URL and URL-encode the invocation id', () =>
      pipe(
        Effect.gen(function* () {
          const trackingLayer = createUrlTrackingLayer(mockGalaxyInvocationJobsSummary)
          yield* getInvocationJobsSummaryEffect('inv/abc').pipe(
            Effect.provide(trackingLayer),
          )
          expect(trackingLayer.getLastUrl()).toBe('api/invocations/inv%2Fabc/jobs_summary')
        }),
        Effect.runPromise,
      ))
  })

  describe('error cases', () => {
    it('should handle network failures', () =>
      pipe(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            getInvocationJobsSummaryEffect('test-invocation-id'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(InvocationError)
            expect(error.message).toContain('Error getting invocation jobs summary test-invocation-id')
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
            getInvocationJobsSummaryEffect('non-existent'),
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
  })
})

describe('getInvocationJobsSummary (Promise wrapper)', () => {
  it('should resolve with jobs summary data when given a success layer', async () => {
    const result = await getInvocationJobsSummary('test-invocation-id', createSuccessLayer(mockGalaxyInvocationJobsSummary))
    expect(result).toEqual(mockGalaxyInvocationJobsSummary)
    expect(result.id).toBe('test-invocation-id')
  })

  it('should reject when given a failure layer', async () => {
    await expect(
      getInvocationJobsSummary('test-invocation-id', createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED))),
    ).rejects.toThrow()
  })

  it('should map Service Unavailable to GalaxyServiceUnavailable', async () => {
    try {
      await getInvocationJobsSummary('test-invocation-id', createServiceUnavailableLayer())
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect((inner as any)._tag).toBe('GalaxyServiceUnavailable')
    }
  })

  it('should propagate HTTP status codes through the wrapper', async () => {
    try {
      await getInvocationJobsSummary('test-invocation-id', createHttpErrorLayer(HTTP_STATUS_CODES.NOT_FOUND, 'Not Found'))
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect(inner).toBeInstanceOf(InvocationError)
      expect((inner as InvocationError).statusCode).toBe(HTTP_STATUS_CODES.NOT_FOUND)
    }
  })
})
