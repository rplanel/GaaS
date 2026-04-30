import { Effect, pipe } from 'effect'
import { describe, expect, it } from 'vitest'
import { JobError } from '../src/errors'
import { getJob, getJobEffect } from '../src/jobs'
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
  mockGalaxyJob,
} from './fixtures'

// ============================================================================
// getJobEffect
// ============================================================================

describe('getJobEffect', () => {
  describe('success cases', () => {
    it('should successfully retrieve a job', () =>
      pipe(
        Effect.gen(function* () {
          const job = yield* getJobEffect('test-job-id')

          expect(job).toEqual(mockGalaxyJob)
          expect(job.id).toBe('test-job-id')
          expect(job.state).toBe('ok')
          expect(job.tool_id).toBe('test-tool-id')
        }),
        Effect.provide(createSuccessLayer(mockGalaxyJob)),
        Effect.runPromise,
      ))

    it('should construct correct API URL with full=true', () =>
      pipe(
        Effect.gen(function* () {
          const trackingLayer = createUrlTrackingLayer(mockGalaxyJob)
          yield* getJobEffect('job-abc').pipe(
            Effect.provide(trackingLayer),
          )
          expect(trackingLayer.getLastUrl()).toBe('api/jobs/job-abc?full=true')
        }),
        Effect.runPromise,
      ))
  })

  describe('error cases', () => {
    it('should handle network failures', () =>
      pipe(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            getJobEffect('test-job-id'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(JobError)
            expect(error.message).toContain('Error getting job test-job-id')
            expect(error.jobId).toBe('test-job-id')
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
            getJobEffect('non-existent'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(JobError)
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
            getJobEffect('broken-job'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(JobError)
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
            getJobEffect('test-job').pipe(
              Effect.provide(createFailureLayer(originalError)),
            ),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(JobError)
            expect(error.cause).toBe(originalError)
          })
        }),
        Effect.runPromise,
      ))
  })
})

// ============================================================================
// getJob (Promise wrapper)
// ============================================================================

describe('getJob (Promise wrapper)', () => {
  it('should resolve with job data when given a success layer', async () => {
    const result = await getJob('test-job-id', createSuccessLayer(mockGalaxyJob))
    expect(result).toEqual(mockGalaxyJob)
    expect(result.id).toBe('test-job-id')
  })

  it('should reject when given a failure layer', async () => {
    await expect(
      getJob('test-job-id', createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED))),
    ).rejects.toThrow()
  })

  it('should map Service Unavailable to GalaxyServiceUnavailable', async () => {
    try {
      await getJob('test-job-id', createServiceUnavailableLayer())
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect((inner as any)._tag).toBe('GalaxyServiceUnavailable')
    }
  })

  it('should propagate HTTP status codes through the wrapper', async () => {
    try {
      await getJob('test-job-id', createHttpErrorLayer(HTTP_STATUS_CODES.NOT_FOUND, 'Not Found'))
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect(inner).toBeInstanceOf(JobError)
      expect((inner as JobError).statusCode).toBe(HTTP_STATUS_CODES.NOT_FOUND)
    }
  })
})
