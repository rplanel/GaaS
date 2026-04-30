import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import {
  getAnalysisJobs,
  GetAnalysisJobsError,
  getOrCreateJobEffect,
  insertAnalysisJob,
  InsertAnalysisJobError,
  isJobTerminalState,
} from '../../../../src/runtime/server/utils/grizzle/jobs'
import {
  createMockDrizzle,
  createMockGalaxyLayer,
  expectFailure,
  mockDbJob,
  mockGalaxyJob,
} from '../../fixtures'

// Mock datasets/output to avoid deep dependency chain
vi.mock('../../../../src/runtime/server/utils/grizzle/datasets/output.js', () => ({
  isOutputDatasetSyncEffect: vi.fn(() => Effect.succeed(true)),
  synchronizeOutputDatasetEffect: vi.fn(() => Effect.succeed(undefined)),
}))

describe('isJobTerminalState', () => {
  it('should return true for terminal states', () => {
    expect(isJobTerminalState('ok')).toBe(true)
    expect(isJobTerminalState('error')).toBe(true)
    expect(isJobTerminalState('deleted')).toBe(true)
  })

  it('should return true for paused state (special case)', () => {
    expect(isJobTerminalState('paused')).toBe(true)
  })

  it('should return false for non-terminal states', () => {
    expect(isJobTerminalState('new')).toBe(false)
    expect(isJobTerminalState('running')).toBe(false)
    expect(isJobTerminalState('queued')).toBe(false)
    expect(isJobTerminalState('waiting')).toBe(false)
  })
})

describe('getAnalysisJobs', () => {
  it('should return a job when found', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockDbJob])

    const result = await getAnalysisJobs(1, 'galaxy-job-1', 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual(mockDbJob)
  })

  it('should return null when no job is found', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const result = await getAnalysisJobs(1, 'nonexistent-job', 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toBeNull()
  })

  it('should fail with GetAnalysisJobsError on database error', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.select.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.from = () => chain
      chain.where = () => chain
      chain.then = (_r: unknown, reject: (e: Error) => void) =>
        Promise.reject(new Error('DB error')).catch(reject)
      return chain
    })

    const exit = await getAnalysisJobs(1, 'galaxy-job-1', 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(GetAnalysisJobsError)
    })
  })
})

describe('insertAnalysisJob', () => {
  it('should upsert a job and return the result', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockDbJob])

    const result = await insertAnalysisJob({
      galaxyId: 'galaxy-job-1',
      stepId: 0,
      state: 'ok',
      toolId: 'test-tool-id',
      ownerId: 'owner-uuid-1',
      analysisId: 1,
      stderr: '',
      stdout: 'Done',
      exitCode: 0,
      createdAt: new Date('2024-01-01'),
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual(mockDbJob)
    expect(drizzle.mock.insert).toHaveBeenCalled()
  })

  it('should fail with InsertAnalysisJobError on database error', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.insert.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.values = () => chain
      chain.onConflictDoUpdate = () => chain
      chain.returning = () => chain
      chain.then = (_r: unknown, reject: (e: Error) => void) =>
        Promise.reject(new Error('Insert failed')).catch(reject)
      return chain
    })

    const exit = await insertAnalysisJob({
      galaxyId: 'galaxy-job-1',
      stepId: 0,
      state: 'ok',
      toolId: 'test-tool-id',
      ownerId: 'owner-uuid-1',
      analysisId: 1,
      createdAt: new Date(),
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(InsertAnalysisJobError)
    })
  })
})

describe('getOrCreateJobEffect', () => {
  it('should return existing job if it exists in the DB', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockDbJob])

    const galaxyLayer = createMockGalaxyLayer(mockGalaxyJob)

    const result = await getOrCreateJobEffect(1, 'galaxy-job-1', 0, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxyLayer),
      Effect.runPromise,
    )

    expect(result).toEqual(mockDbJob)
  })

  it('should fetch from Galaxy and create if not in DB', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.select.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.from = () => chain
      chain.where = () => chain
      // getAnalysisJobs returns null (not found)
      chain.then = vi.fn((resolve: (v: unknown) => unknown) => {
        return Promise.resolve(resolve([]))
      })
      return chain
    })
    // insertAnalysisJob will use insert
    const insertedJob = { ...mockDbJob, id: 2 }
    drizzle.mock.insert.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.values = () => chain
      chain.onConflictDoUpdate = () => chain
      chain.returning = () => chain
      chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve([insertedJob])),
      )
      return chain
    })

    const galaxyLayer = createMockGalaxyLayer(mockGalaxyJob)

    const result = await getOrCreateJobEffect(1, 'galaxy-job-1', 0, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxyLayer),
      Effect.runPromise,
    )

    expect(result).toEqual(insertedJob)
  })
})
