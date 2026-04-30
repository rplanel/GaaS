import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  getAllAnalysisInputDatasets,
  getAnalysisInputDataset,
  GetAnalysisInputError,
  insertAnalysisInputEffect,
  InsertAnalysisInputError,
} from '../../../../src/runtime/server/utils/grizzle/datasets/input'
import {
  createMockDrizzle,
  expectFailure,
  mockDbAnalysisInput,
  mockDbDataset,
} from '../../fixtures'

describe('getAllAnalysisInputDatasets', () => {
  it('should return all input datasets for an analysis', async () => {
    const drizzle = createMockDrizzle()
    const inputs = [
      { analysis_inputs: mockDbAnalysisInput, datasets: mockDbDataset },
    ]
    drizzle.setResult(inputs)

    const result = await getAllAnalysisInputDatasets(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual(inputs)
  })

  it('should return empty array when no inputs exist', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const result = await getAllAnalysisInputDatasets(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual([])
  })

  it('should fail with GetAnalysisInputError on database error', async () => {
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

    const exit = await getAllAnalysisInputDatasets(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(GetAnalysisInputError)
    })
  })
})

describe('getAnalysisInputDataset', () => {
  it('should return input dataset when found', async () => {
    const drizzle = createMockDrizzle()
    const joinResult = {
      datasets: mockDbDataset,
      analysis_inputs: mockDbAnalysisInput,
    }
    drizzle.setResult([joinResult])

    const result = await getAnalysisInputDataset('galaxy-dataset-1', 1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual(joinResult)
  })

  it('should return null when input dataset is not found', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const result = await getAnalysisInputDataset('nonexistent', 1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toBeNull()
  })
})

describe('insertAnalysisInputEffect', () => {
  it('should insert an analysis input and return the result', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockDbAnalysisInput])

    const result = await insertAnalysisInputEffect(1, 1, 'ok').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual(mockDbAnalysisInput)
    expect(drizzle.mock.insert).toHaveBeenCalled()
  })

  it('should fail with InsertAnalysisInputError on database error', async () => {
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

    const exit = await insertAnalysisInputEffect(1, 1, 'ok').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(InsertAnalysisInputError)
    })
  })
})
