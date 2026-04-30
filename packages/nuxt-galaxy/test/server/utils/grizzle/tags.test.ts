import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { insertTags, InsertTagsError } from '../../../../src/runtime/server/utils/grizzle/tags'
import { createMockDrizzle, expectFailure, mockDbTag } from '../../fixtures'

describe('insertTags', () => {
  it('should insert tags and return the inserted rows', async () => {
    const drizzle = createMockDrizzle()
    const expectedTags = [
      { id: 1, label: 'tag1' },
      { id: 2, label: 'tag2' },
    ]
    drizzle.setResult(expectedTags)

    const result = await insertTags(['tag1', 'tag2']).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual(expectedTags)
    expect(drizzle.mock.insert).toHaveBeenCalled()
  })

  it('should handle a single tag', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockDbTag])

    const result = await insertTags(['tag1']).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual([mockDbTag])
  })

  it('should handle an empty tag array', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const result = await insertTags([]).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual([])
  })

  it('should fail with InsertTagsError when database operation fails', async () => {
    const drizzle = createMockDrizzle()
    // Override insert to reject
    drizzle.mock.insert.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.values = () => chain
      chain.onConflictDoUpdate = () => chain
      chain.returning = () => chain
      chain.then = (_resolve: unknown, reject: (e: Error) => void) =>
        Promise.reject(new Error('DB connection failed')).catch(reject)
      return chain
    })

    const exit = await insertTags(['tag1']).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(InsertTagsError)
      expect(error.message).toContain('Error inserting analysis Output')
    })
  })
})
