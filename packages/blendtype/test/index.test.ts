import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { BlendTypeConfig, makeConfigLayer } from '../src/config'
import { GalaxyServiceUnavailable, toGalaxyServiceUnavailable } from '../src/galaxy'

describe('makeConfigLayer', () => {
  it('should create a layer that provides BlendTypeConfig', () =>
    Effect.gen(function* () {
      const config = yield* BlendTypeConfig
      expect(config.apiKey).toBe('my-key')
      expect(config.url).toBe('https://galaxy.example.com')
    }).pipe(
      Effect.provide(makeConfigLayer({ apiKey: 'my-key', url: 'https://galaxy.example.com' })),
      Effect.runPromise,
    ))
})

describe('toGalaxyServiceUnavailable', () => {
  it('should map Service Unavailable errors to GalaxyServiceUnavailable', async () => {
    const effect = Effect.fail(new Error('503 Service Unavailable')).pipe(
      toGalaxyServiceUnavailable,
    )

    const exit = await Effect.runPromiseExit(effect)
    expect(exit._tag).toBe('Failure')
    if (exit._tag === 'Failure' && exit.cause._tag === 'Fail') {
      expect(exit.cause.error).toBeInstanceOf(GalaxyServiceUnavailable)
      expect((exit.cause.error as GalaxyServiceUnavailable).message).toBe('Galaxy service is unavailable')
    }
  })

  it('should pass through non-Service-Unavailable errors unchanged', async () => {
    const originalError = new Error('404 Not Found')
    const effect = Effect.fail(originalError).pipe(
      toGalaxyServiceUnavailable,
    )

    const exit = await Effect.runPromiseExit(effect)
    expect(exit._tag).toBe('Failure')
    if (exit._tag === 'Failure' && exit.cause._tag === 'Fail') {
      expect(exit.cause.error).toBe(originalError)
    }
  })

  it('should not affect successful effects', async () => {
    const effect = Effect.succeed('ok').pipe(
      toGalaxyServiceUnavailable,
    )

    const result = await Effect.runPromise(effect)
    expect(result).toBe('ok')
  })
})
