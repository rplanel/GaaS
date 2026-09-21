import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { getCurrentUserEffect, GetCurrentUserError } from '../../../../src/runtime/server/utils/grizzle/user'
import { createMockDrizzle, expectFailure, mockDbUser, mockDrizzleSelectRejects } from '../../fixtures'

describe('getCurrentUserEffect', () => {
  it('should return the user when found', async () => {
    const drizzle = createMockDrizzle()
    // takeUniqueOrNull returns the single element
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
    drizzle.setResult([]) // empty result -> takeUniqueOrNull returns null

    const result = await getCurrentUserEffect('https://galaxy.example.com', 'nonexistent@example.org').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toBeNull()
  })

  it('should fail with GetCurrentUserError when database operation fails', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.select.mockImplementation(
      mockDrizzleSelectRejects(['from', 'innerJoin', 'where'], new Error('Connection refused')),
    )

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
