import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import {
  deleteAnalysis,
  DeleteAnalysisError,
  getAllAnalyses,
  getAnalysis,
  GetAnalysisError,
  getHistoryAnalysis,
  insertAnalysis,
  InsertAnalysisError,
  isAnalysisTerminalState,
} from '../../../../src/runtime/server/utils/grizzle/analyses'
import {
  createMockDrizzle,
  createMockGalaxyLayer,
  expectFailure,
  mockDbAnalysis,
  mockDbHistory,
  mockGalaxyHistory,
  mockGalaxyInvocation,
} from '../../fixtures'

// Mock dependencies to avoid deep chains
vi.mock('../../../../src/runtime/server/utils/grizzle/datasets/input', () => ({
  insertAnalysisInputEffect: vi.fn(() => Effect.succeed({ id: 1 })),
  getAllAnalysisInputDatasets: vi.fn(() => Effect.succeed([])),
  synchronizeInputDatasetEffect: vi.fn(() => Effect.succeed(undefined)),
}))

vi.mock('../../../../src/runtime/server/utils/grizzle/jobs', () => ({
  synchronizeJobEffect: vi.fn(() => Effect.succeed(undefined)),
  getAnalysisJobs: vi.fn(() => Effect.succeed(null)),
  isJobSyncEffect: vi.fn(() => Effect.succeed(true)),
}))

vi.mock('../../../../src/runtime/server/utils/grizzle/histories', () => ({
  isHistorySyncEffect: vi.fn(() => Effect.succeed(false)),
  synchronizeHistoryEffect: vi.fn(() => Effect.succeed(undefined)),
}))

describe('isAnalysisTerminalState', () => {
  it('should return true for terminal invocation states', () => {
    expect(isAnalysisTerminalState('scheduled')).toBe(true)
    expect(isAnalysisTerminalState('cancelled')).toBe(true)
    expect(isAnalysisTerminalState('failed')).toBe(true)
  })

  it('should return false for non-terminal invocation states', () => {
    expect(isAnalysisTerminalState('new')).toBe(false)
    expect(isAnalysisTerminalState('ready')).toBe(false)
    expect(isAnalysisTerminalState('cancelling')).toBe(false)
  })
})

describe('insertAnalysis', () => {
  it('should insert an analysis and return the inserted id', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ insertedId: 1 }])

    const result = await insertAnalysis({
      name: 'Test Analysis',
      historyId: 1,
      workflowId: 1,
      state: 'scheduled',
      galaxyId: 'galaxy-invocation-1',
      ownerId: 'owner-uuid-1',
      parameters: {},
      datamap: {},
      invocation: mockGalaxyInvocation as any,
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual({ insertedId: 1 })
    expect(drizzle.mock.insert).toHaveBeenCalled()
  })

  it('should fail with InsertAnalysisError on database error', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.insert.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.values = () => chain
      chain.returning = () => chain
      chain.then = (_r: unknown, reject: (e: Error) => void) =>
        Promise.reject(new Error('Insert failed')).catch(reject)
      return chain
    })

    const exit = await insertAnalysis({
      name: 'Test',
      historyId: 1,
      workflowId: 1,
      state: 'scheduled',
      galaxyId: 'galaxy-inv-1',
      ownerId: 'owner-uuid-1',
      parameters: {},
      datamap: {},
      invocation: mockGalaxyInvocation as any,
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(InsertAnalysisError)
    })
  })
})

describe('getAnalysis', () => {
  it('should return an analysis when found', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockDbAnalysis])

    const result = await getAnalysis(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual(mockDbAnalysis)
  })

  it('should return null when not found', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const result = await getAnalysis(999, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toBeNull()
  })

  it('should fail with GetAnalysisError on database error', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.select.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.from = () => chain
      chain.where = () => chain
      chain.then = (_r: unknown, reject: (e: Error) => void) =>
        Promise.reject(new Error('DB error')).catch(reject)
      return chain
    })

    const exit = await getAnalysis(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(GetAnalysisError)
    })
  })
})

describe('getAllAnalyses', () => {
  it('should return all analyses for an owner', async () => {
    const drizzle = createMockDrizzle()
    const analysesResult = [mockDbAnalysis, { ...mockDbAnalysis, id: 2 }]
    drizzle.setResult(analysesResult)

    const result = await getAllAnalyses('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual(analysesResult)
  })

  it('should return empty array when no analyses exist', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const result = await getAllAnalyses('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual([])
  })
})

describe('getHistoryAnalysis', () => {
  it('should return analysis+history join when found', async () => {
    const drizzle = createMockDrizzle()
    const joinResult = {
      analyses: mockDbAnalysis,
      histories: mockDbHistory,
    }
    drizzle.setResult([joinResult])

    const result = await getHistoryAnalysis(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual(joinResult)
  })

  it('should return null when not found', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const result = await getHistoryAnalysis(999, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toBeNull()
  })
})

describe('deleteAnalysis', () => {
  it('should delete Galaxy history then DB record', async () => {
    const drizzle = createMockDrizzle()

    // getHistoryAnalysis returns history+analysis join
    drizzle.mock.select.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.from = () => chain
      chain.innerJoin = () => chain
      chain.where = () => chain
      chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve([{
          analyses: mockDbAnalysis,
          histories: mockDbHistory,
        }])),
      )
      return chain
    })

    // delete returns something
    drizzle.mock.delete.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.where = () => chain
      chain.returning = () => chain
      chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve([{ id: 1 }])),
      )
      return chain
    })

    const galaxyLayer = createMockGalaxyLayer(mockGalaxyHistory)

    const result = await deleteAnalysis(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxyLayer),
      Effect.runPromise,
    )

    expect(result).toEqual([{ id: 1 }])
  })

  it('should fail with DeleteAnalysisError when analysis not found', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([]) // no analysis found

    const galaxyLayer = createMockGalaxyLayer(mockGalaxyHistory)

    const exit = await deleteAnalysis(999, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxyLayer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(DeleteAnalysisError)
      expect((error as DeleteAnalysisError).message).toContain('Analysis not found')
    })
  })
})
