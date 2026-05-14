import { Effect, Exit, Layer, pipe } from 'effect'
import { describe, expect, it } from 'vitest'
import { BlendTypeConfig } from '../src/config'
import { GalaxyFetch, getVersion, getVersionEffect, isRetryableError, makeGalaxyLayer } from '../src/galaxy'
import {
  createFailureLayer,
  createServiceUnavailableLayer,
  createSuccessLayer,
  ERROR_MESSAGES,
  expectFailure,
  extractFiberFailure,
  mockGalaxyVersion,
} from './fixtures'

describe('makeGalaxyLayer', () => {
  it('should create a layer that provides GalaxyFetch', () =>
    pipe(
      Effect.gen(function* () {
        // Verify we can access GalaxyFetch from the layer
        const fetchApi = yield* GalaxyFetch
        expect(fetchApi).toBeDefined()
        expect(typeof fetchApi).toBe('function')
      }),
      Effect.provide(makeGalaxyLayer({ apiKey: 'test-key', url: 'https://galaxy.test' })),
      Effect.runPromise,
    ))

  it('should create a layer that also provides BlendTypeConfig', () =>
    pipe(
      Effect.gen(function* () {
        // Verify we can access BlendTypeConfig from the layer
        // This is needed by uploadFileToHistoryEffect which reads config directly
        const config = yield* BlendTypeConfig
        expect(config.apiKey).toBe('test-key')
        expect(config.url).toBe('https://galaxy.test')
      }),
      Effect.provide(makeGalaxyLayer({ apiKey: 'test-key', url: 'https://galaxy.test' })),
      Effect.runPromise,
    ))

  it('should create independent layers from different configs', () =>
    pipe(
      Effect.gen(function* () {
        const config = yield* BlendTypeConfig
        expect(config.url).toBe('https://other-galaxy.test')
        expect(config.apiKey).toBe('other-key')
      }),
      Effect.provide(makeGalaxyLayer({ apiKey: 'other-key', url: 'https://other-galaxy.test' })),
      Effect.runPromise,
    ))
})

describe('getVersionEffect', () => {
  it('should successfully retrieve the Galaxy version', () =>
    pipe(
      Effect.gen(function* () {
        const version = yield* getVersionEffect

        expect(version).toEqual(mockGalaxyVersion)
        expect(version.version_major).toBe('23')
        expect(version.version_minor).toBe('1')
      }),
      Effect.provide(createSuccessLayer(mockGalaxyVersion)),
      Effect.runPromise,
    ))

  it('should fail with GalaxyApiError on network failure', () =>
    pipe(
      Effect.gen(function* () {
        const exit = yield* Effect.exit(getVersionEffect)

        expectFailure(exit, (error) => {
          expect(error).toBeDefined()
          expect((error as { message: string }).message).toContain('version')
        })
      }),
      Effect.provide(
        createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED)),
      ),
      Effect.runPromise,
    ))
})

describe('getVersion (Promise wrapper)', () => {
  it('should resolve with version data when given a success layer', async () => {
    const result = await getVersion(createSuccessLayer(mockGalaxyVersion))
    expect(result).toEqual(mockGalaxyVersion)
    expect(result.version_major).toBe('23')
  })

  it('should reject when given a failure layer', async () => {
    await expect(
      getVersion(createFailureLayer(new Error(ERROR_MESSAGES.NETWORK_REFUSED))),
    ).rejects.toThrow()
  })

  it('should map Service Unavailable to GalaxyServiceUnavailable', async () => {
    try {
      await getVersion(createServiceUnavailableLayer())
      expect.unreachable('Should have thrown')
    }
    catch (error) {
      const inner = extractFiberFailure(error)
      expect((inner as any)._tag).toBe('GalaxyServiceUnavailable')
    }
  })
})

describe('isRetryableError', () => {
  it('should return true for 503 errors', () => {
    expect(isRetryableError({ statusCode: 503 })).toBe(true)
  })

  it('should return true for 429 errors', () => {
    expect(isRetryableError({ statusCode: 429 })).toBe(true)
  })

  it('should return false for 404 errors', () => {
    expect(isRetryableError({ statusCode: 404 })).toBe(false)
  })

  it('should return false for 500 errors', () => {
    expect(isRetryableError({ statusCode: 500 })).toBe(false)
  })

  it('should return false for non-object errors', () => {
    expect(isRetryableError('string error')).toBe(false)
  })
})

describe('withRetry', () => {
  it('should succeed after transient 503 failures', () =>
    pipe(
      Effect.gen(function* () {
        let attempts = 0
        const layer = Layer.succeed(
          GalaxyFetch,
          (async () => {
            attempts++
            if (attempts < 3) {
              throw Object.assign(new Error('Service Unavailable'), { statusCode: 503 })
            }
            return mockGalaxyVersion
          }) as unknown as typeof GalaxyFetch.Service,
        )

        const result = yield* getVersionEffect.pipe(Effect.provide(layer))

        expect(result.version_major).toBe('23')
        expect(attempts).toBe(3)
      }),
      Effect.runPromise,
    ))

  it('should not retry on 404 errors', () =>
    pipe(
      Effect.gen(function* () {
        let attempts = 0
        const layer = Layer.succeed(
          GalaxyFetch,
          (async () => {
            attempts++
            throw Object.assign(new Error('Not Found'), { statusCode: 404 })
          }) as unknown as typeof GalaxyFetch.Service,
        )

        const exit = yield* Effect.exit(getVersionEffect.pipe(Effect.provide(layer)))

        expect(Exit.isFailure(exit)).toBe(true)
        expect(attempts).toBe(1)
      }),
      Effect.runPromise,
    ))

  it('should fail after max retries exceeded', () =>
    pipe(
      Effect.gen(function* () {
        let attempts = 0
        const layer = Layer.succeed(
          GalaxyFetch,
          (async () => {
            attempts++
            throw Object.assign(new Error('Service Unavailable'), { statusCode: 503 })
          }) as unknown as typeof GalaxyFetch.Service,
        )

        const exit = yield* Effect.exit(getVersionEffect.pipe(Effect.provide(layer)))

        expect(Exit.isFailure(exit)).toBe(true)
        expect(attempts).toBe(4) // initial + 3 retries
      }),
      Effect.runPromise,
    ))
})
