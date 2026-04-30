import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { getCurrentUserEffect, GetCurrentUserError } from '../../../../src/runtime/server/utils/grizzle/user'
import { createMockDrizzle, expectFailure, mockDbUser } from '../../fixtures'

describe('getCurrentUserEffect', () => {
  it('should return the user when found', async () => {
    const drizzle = createMockDrizzle()
    // takeUniqueOrThrow returns the single element
    drizzle.setResult([mockDbUser])

    const result = await getCurrentUserEffect('https://galaxy.example.com', 'admin@example.org').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual(mockDbUser)
    expect(drizzle.mock.select).toHaveBeenCalled()
  })

  it('should return null when no user is found', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([]) // empty result -> takeUniqueOrThrow returns null

    const result = await getCurrentUserEffect('https://galaxy.example.com', 'nonexistent@example.org').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toBeNull()
  })

  it('should fail with GetCurrentUserError when database operation fails', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.select.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.from = () => chain
      chain.innerJoin = () => chain
      chain.where = () => chain
      chain.then = (_resolve: unknown, reject: (e: Error) => void) =>
        Promise.reject(new Error('Connection refused')).catch(reject)
      return chain
    })

    const exit = await getCurrentUserEffect('https://galaxy.example.com', 'admin@example.org').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(GetCurrentUserError)
      expect(error.message).toContain('Error getting current user')
    })
  })
})
