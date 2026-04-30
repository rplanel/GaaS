import { Effect, pipe } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchDatasetEffect, getDataset, getDatasetEffect } from '../src/datasets'
import { DatasetError } from '../src/errors'
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
} from './fixtures'

describe('getDatasetEffect', () => {
  describe('success cases', () => {
    it('should successfully retrieve a dataset', () =>
      pipe(
        Effect.gen(function* () {
          const dataset = yield* getDatasetEffect(
            'test-dataset-id',
            'test-history-id',
          )

          expect(dataset).toEqual(mockGalaxyDataset)
          expect(dataset.dataset_id).toBe('test-dataset-id')
          expect(dataset.history_id).toBe('test-history-id')
          expect(dataset.name).toBe('Test Dataset')
        }),
        Effect.provide(createSuccessLayer(mockGalaxyDataset)),
        Effect.runPromise,
      ))

    it('should construct correct API URL with dataset and history IDs', () =>
      pipe(
        Effect.gen(function* () {
          const trackingLayer = createUrlTrackingLayer(mockGalaxyDataset)
          const dataset = yield* getDatasetEffect(
            'my-dataset-123',
            'my-history-456',
          ).pipe(Effect.provide(trackingLayer))

          expect(dataset).toEqual(mockGalaxyDataset)
          expect(trackingLayer.getLastUrl()).toBe(
            'api/histories/my-history-456/contents/my-dataset-123',
          )
        }),
        Effect.runPromise,
      ))
  })

  describe('error cases', () => {
    it('should handle network failures', () =>
      pipe(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            getDatasetEffect('test-dataset', 'test-history'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(DatasetError)
            expect(error.message).toContain(
              'Error getting dataset test-dataset',
            )
            expect(error.message).toContain(ERROR_MESSAGES.NETWORK_REFUSED)
            expect(error.datasetId).toBe('test-dataset')
            expect(error.historyId).toBe('test-history')
            expect(error.cause).toBeInstanceOf(Error)
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
            getDatasetEffect('non-existent-dataset', 'test-history'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(DatasetError)
            expect(error.statusCode).toBe(HTTP_STATUS_CODES.NOT_FOUND)
            expect(error.message).toContain('404')
            expect(error.datasetId).toBe('non-existent-dataset')
          })
        }),
        Effect.provide(
          createHttpErrorLayer(HTTP_STATUS_CODES.NOT_FOUND, 'Not Found'),
        ),
        Effect.runPromise,
      ))

    it('should handle 403 forbidden error', () =>
      pipe(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            getDatasetEffect('restricted-dataset', 'test-history'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(DatasetError)
            expect(error.statusCode).toBe(HTTP_STATUS_CODES.FORBIDDEN)
            expect(error.message).toContain('403')
          })
        }),
        Effect.provide(
          createHttpErrorLayer(HTTP_STATUS_CODES.FORBIDDEN, 'Forbidden'),
        ),
        Effect.runPromise,
      ))

    it('should handle 500 server error', () =>
      pipe(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            getDatasetEffect('broken-dataset', 'test-history'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(DatasetError)
            expect(error.statusCode).toBe(HTTP_STATUS_CODES.SERVER_ERROR)
            expect(error.message).toContain('500')
          })
        }),
        Effect.provide(
          createHttpErrorLayer(
            HTTP_STATUS_CODES.SERVER_ERROR,
            'Internal Server Error',
          ),
        ),
        Effect.runPromise,
      ))

    it('should preserve original error in cause', () =>
      pipe(
        Effect.gen(function* () {
          const originalError = new Error('Original fetch error')
          const exit = yield* Effect.exit(
            getDatasetEffect('test-dataset', 'test-history').pipe(
              Effect.provide(createFailureLayer(originalError)),
            ),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(DatasetError)
            expect(error.cause).toBe(originalError)
          })
        }),
        Effect.runPromise,
      ))
  })
})

describe('getDataset (Promise wrapper)', () => {
  it('should resolve with dataset data when given a success layer', async () => {
    const result = await getDataset('test-dataset-id', 'test-history-id', createSuccessLayer(mockGalaxyDataset))
    expect(result).toEqual(mockGalaxyDataset)
    expect(result.dataset_id).toBe('test-dataset-id')
  })

  it('should reject when given a failure layer', async () => {
    await expect(
      getDataset('test-dataset-id', 'test-history-id', createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED))),
    ).rejects.toThrow()
  })

  it('should map Service Unavailable to GalaxyServiceUnavailable', async () => {
    try {
      await getDataset('test-dataset-id', 'test-history-id', createServiceUnavailableLayer())
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect((inner as any)._tag).toBe('GalaxyServiceUnavailable')
    }
  })

  it('should propagate HTTP status codes through the wrapper', async () => {
    try {
      await getDataset('test-dataset-id', 'test-history-id', createHttpErrorLayer(HTTP_STATUS_CODES.NOT_FOUND, 'Not Found'))
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect(inner).toBeInstanceOf(DatasetError)
      expect((inner as DatasetError).statusCode).toBe(HTTP_STATUS_CODES.NOT_FOUND)
    }
  })
})

describe('fetchDatasetEffect', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('success cases', () => {
    it('should successfully fetch dataset from URL', () =>
      pipe(
        Effect.gen(function* () {
          const mockResponse = new Response('dataset content', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          })

          vi.mocked(fetch).mockResolvedValue(mockResponse)

          const result = yield* fetchDatasetEffect(
            'https://example.com/dataset.txt',
          )

          expect(result).toBeInstanceOf(Response)
          expect(result.status).toBe(200)
          const text = yield* Effect.promise(() => result.text())
          expect(text).toBe('dataset content')
          expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            'https://example.com/dataset.txt',
          )
          expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
        }),
        Effect.runPromise,
      ))
  })

  describe('error cases', () => {
    it('should handle fetch failures', () =>
      pipe(
        Effect.gen(function* () {
          vi.mocked(fetch).mockRejectedValue(
            new Error(ERROR_MESSAGES.NETWORK_REFUSED),
          )

          const exit = yield* Effect.exit(
            fetchDatasetEffect('https://example.com/dataset.txt'),
          )

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(DatasetError)
            expect(error.message).toContain('Error fetching dataset from URL')
            expect(error.message).toContain(ERROR_MESSAGES.NETWORK_REFUSED)
          })
        }),
        Effect.runPromise,
      ))

    it('should preserve URL in error message', () =>
      pipe(
        Effect.gen(function* () {
          vi.mocked(fetch).mockRejectedValue(new Error('Connection timeout'))

          const testUrl = 'https://galaxy.example.com/api/datasets/123'
          const exit = yield* Effect.exit(fetchDatasetEffect(testUrl))

          expectFailure(exit, (error) => {
            expect(error).toBeInstanceOf(DatasetError)
            expect(error.message).toContain(testUrl)
          })
        }),
        Effect.runPromise,
      ))
  })
})
