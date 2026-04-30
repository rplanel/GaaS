import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  getAnalysisOutputDataset,
  GetAnalysisOutputError,
  insertAnalysisOutputEffect,
  InsertAnalysisOutputError,
  insertAnalysisOutputTags,
  InsertAnalysisOutputTagsError,
} from '../../../../src/runtime/server/utils/grizzle/datasets/output'
import {
  createMockDrizzle,
  expectFailure,
  mockDbAnalysisOutput,
  mockDbDataset,
  mockDbTag,
} from '../../fixtures'

describe('getAnalysisOutputDataset', () => {
  it('should return output dataset when found', async () => {
    const drizzle = createMockDrizzle()
    const joinResult = {
      datasets: mockDbDataset,
      analysis_outputs: mockDbAnalysisOutput,
    }
    drizzle.setResult([joinResult])

    const result = await getAnalysisOutputDataset('galaxy-dataset-1', 1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual(joinResult)
  })

  it('should return null when output dataset is not found', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const result = await getAnalysisOutputDataset('nonexistent', 1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toBeNull()
  })

  it('should fail with GetAnalysisOutputError on database error', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.select.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.from = () => chain
      chain.innerJoin = () => chain
      chain.where = () => chain
      chain.then = (_r: unknown, reject: (e: Error) => void) =>
        Promise.reject(new Error('DB error')).catch(reject)
      return chain
    })

    const exit = await getAnalysisOutputDataset('galaxy-dataset-1', 1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(GetAnalysisOutputError)
    })
  })
})

describe('insertAnalysisOutputEffect', () => {
  it('should insert an analysis output and return the result', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockDbAnalysisOutput])

    const result = await insertAnalysisOutputEffect(1, 1, 1, 'ok').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual(mockDbAnalysisOutput)
    expect(drizzle.mock.insert).toHaveBeenCalled()
  })

  it('should fail with InsertAnalysisOutputError on database error', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.insert.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.values = () => chain
      chain.returning = () => chain
      chain.onConflictDoNothing = () => chain
      chain.then = (_r: unknown, reject: (e: Error) => void) =>
        Promise.reject(new Error('Insert failed')).catch(reject)
      return chain
    })

    const exit = await insertAnalysisOutputEffect(1, 1, 1, 'ok').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(InsertAnalysisOutputError)
    })
  })
})

describe('insertAnalysisOutputTags', () => {
  it('should insert tag associations and return the results', async () => {
    const drizzle = createMockDrizzle()
    const expectedResult = [{ tagId: 1, analysisOutputId: 1 }]
    drizzle.setResult(expectedResult)

    const result = await insertAnalysisOutputTags([mockDbTag], 1).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual(expectedResult)
    expect(drizzle.mock.insert).toHaveBeenCalled()
  })

  it('should handle empty tags array', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const result = await insertAnalysisOutputTags([], 1).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual([])
  })

  it('should fail with InsertAnalysisOutputTagsError on database error', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.insert.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.values = () => chain
      chain.onConflictDoNothing = () => chain
      chain.returning = () => chain
      chain.then = (_r: unknown, reject: (e: Error) => void) =>
        Promise.reject(new Error('Insert failed')).catch(reject)
      return chain
    })

    const exit = await insertAnalysisOutputTags([mockDbTag], 1).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(InsertAnalysisOutputTagsError)
    })
  })
})
