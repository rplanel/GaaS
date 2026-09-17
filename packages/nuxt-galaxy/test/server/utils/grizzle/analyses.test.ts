import { and, eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { analyses } from '../../../../src/runtime/server/db/schema/galaxy/analyses'
import { analysisMonitoring } from '../../../../src/runtime/server/db/schema/galaxy/analysisMonitoring'
import {
  deleteAnalysis,
  DeleteAnalysisError,
  getAllAnalyses,
  getAnalysis,
  GetAnalysisError,
  getHistoryAnalysis,
  insertAnalysis,
  InsertAnalysisError,
  isInvocationTerminalState,
} from '../../../../src/runtime/server/utils/grizzle/analyses'
import { finalizeAnalysisMonitoringEffect } from '../../../../src/runtime/server/utils/grizzle/analysisMonitoring'
import {
  createFailingGalaxyLayer,
  createMockDrizzle,
  createMockDrizzleResult,
  createMockGalaxyLayer,
  expectFailure,
  mockDbAnalysis,
  mockDbHistory,
  mockDrizzleInsertRejects,
  mockDrizzleSelectRejects,
  mockGalaxyHistory,
  mockGalaxyInvocation,
} from '../../fixtures'

describe('isInvocationTerminalState', () => {
  it('should return true for terminal invocation states', () => {
    expect(isInvocationTerminalState('cancelled')).toBe(true)
    expect(isInvocationTerminalState('failed')).toBe(true)
    expect(isInvocationTerminalState('completed')).toBe(true)
  })

  it('should return false for non-terminal invocation states', () => {
    expect(isInvocationTerminalState('new')).toBe(false)
    expect(isInvocationTerminalState('requires_materialization')).toBe(false)
    expect(isInvocationTerminalState('ready')).toBe(false)
    expect(isInvocationTerminalState('scheduled')).toBe(false)
    expect(isInvocationTerminalState('cancelling')).toBe(false)
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
    expect(drizzle.mock.transaction).toHaveBeenCalledTimes(1)
    expect(drizzle.mock.insert).toHaveBeenCalled()
  })

  it('should insert a monitoring row with pending outcome when inserting an analysis', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ insertedId: 1 }])

    await insertAnalysis({
      name: 'Test Analysis',
      historyId: 1,
      workflowId: 2,
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

    expect(drizzle.mock.transaction).toHaveBeenCalledTimes(1)
    expect(drizzle.mock.insert).toHaveBeenCalledTimes(2)
    expect(drizzle.mock.insert).toHaveBeenCalledWith(analysisMonitoring)
    const monitoringValues = drizzle.mock.insert.mock.results[1]?.value.values.mock.calls[0]?.[0]
    expect(monitoringValues).toMatchObject({
      analysisId: 1,
      ownerId: 'owner-uuid-1',
      workflowId: 2,
      name: 'Test Analysis',
      galaxyInvocationId: 'galaxy-invocation-1',
      outcome: 'pending',
    })
  })

  it('should write workflow snapshot values to the monitoring row', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ insertedId: 1 }])

    await insertAnalysis({
      name: 'Test Analysis',
      historyId: 1,
      workflowId: 2,
      state: 'scheduled',
      galaxyId: 'galaxy-invocation-1',
      ownerId: 'owner-uuid-1',
      parameters: {},
      datamap: {},
      invocation: mockGalaxyInvocation as any,
    }, {
      workflowName: 'My Workflow',
      galaxyWorkflowId: 'galaxy-wf-1',
      workflowVersion: '1.0',
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(drizzle.mock.transaction).toHaveBeenCalledTimes(1)
    expect(drizzle.mock.insert).toHaveBeenCalledTimes(2)
    expect(drizzle.mock.insert).toHaveBeenCalledWith(analysisMonitoring)
    const monitoringValues = drizzle.mock.insert.mock.results[1]?.value.values.mock.calls[0]?.[0]
    expect(monitoringValues).toMatchObject({
      analysisId: 1,
      ownerId: 'owner-uuid-1',
      workflowId: 2,
      name: 'Test Analysis',
      galaxyInvocationId: 'galaxy-invocation-1',
      outcome: 'pending',
      workflowName: 'My Workflow',
      galaxyWorkflowId: 'galaxy-wf-1',
      workflowVersion: '1.0',
    })
  })

  it('should persist NULL snapshot columns when no snapshot is provided (D-05)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ insertedId: 1 }])

    const result = await insertAnalysis({
      name: 'Test Analysis',
      historyId: 1,
      workflowId: 2,
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
    const monitoringValues = drizzle.mock.insert.mock.results[1]?.value.values.mock.calls[0]?.[0]
    expect(monitoringValues.workflowName).toBeNull()
    expect(monitoringValues.galaxyWorkflowId).toBeNull()
    expect(monitoringValues.workflowVersion).toBeNull()
  })

  it('should fail with InsertAnalysisError on database error', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.insert.mockImplementation(mockDrizzleInsertRejects(['values', 'returning'], new Error('Insert failed')))

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
    drizzle.mock.select.mockImplementation(mockDrizzleSelectRejects(['from', 'where'], new Error('DB error')))

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
  /**
   * Configures the drizzle mock so the delete path resolves:
   * - select -> history+analysis join (getHistoryAnalysis)
   * - update -> configurable finalize result
   * - delete -> configurable delete result
   * The default transaction callback passes the root `mock`, so update/delete
   * land on `drizzle.mock.update` / `drizzle.mock.delete` unless overridden.
   */
  function setupDeletePath(
    drizzle: ReturnType<typeof createMockDrizzle>,
    { updateResult = [{ updatedId: 5 }], deleteResult = [{ id: 1 }] }: {
      updateResult?: unknown
      deleteResult?: unknown
    } = {},
  ) {
    drizzle.mock.select.mockImplementation(() =>
      createMockDrizzleResult([{ analyses: mockDbAnalysis, histories: mockDbHistory }]),
    )
    drizzle.mock.update.mockImplementation(() => createMockDrizzleResult(updateResult))
    drizzle.mock.delete.mockImplementation(() => createMockDrizzleResult(deleteResult))
  }

  it('should delete Galaxy history then finalize monitoring and delete the DB record in one transaction', async () => {
    const drizzle = createMockDrizzle()
    setupDeletePath(drizzle)

    const galaxyLayer = createMockGalaxyLayer(mockGalaxyHistory)

    const result = await deleteAnalysis(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxyLayer),
      Effect.runPromise,
    )

    expect(result).toEqual([{ id: 1 }])
    // The finalize + delete run inside a single transaction, after the Galaxy delete.
    expect(drizzle.mock.transaction).toHaveBeenCalledTimes(1)
    expect(drizzle.mock.update).toHaveBeenCalledWith(analysisMonitoring)
    expect(drizzle.mock.delete).toHaveBeenCalledWith(analyses)
  })

  it('should finalize the monitoring row instead of deleting it (migration-survival intent)', async () => {
    const drizzle = createMockDrizzle()
    setupDeletePath(drizzle, { updateResult: [{ updatedId: 5 }] })

    const galaxyLayer = createMockGalaxyLayer(mockGalaxyHistory)

    await deleteAnalysis(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxyLayer),
      Effect.runPromise,
    )

    // The monitoring row is finalized (updated to cancelled), never deleted.
    expect(drizzle.mock.update).toHaveBeenCalledWith(analysisMonitoring)
    const setCall = drizzle.mock.update.mock.results[0]?.value.set.mock.calls[0]?.[0]
    expect(setCall).toMatchObject({
      outcome: 'cancelled',
      completedAt: expect.any(Date) as unknown,
    })
    expect(drizzle.mock.delete).toHaveBeenCalledWith(analyses)
    expect(drizzle.mock.delete).toHaveBeenCalledTimes(1)
    expect(drizzle.mock.delete).not.toHaveBeenCalledWith(analysisMonitoring)
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

  it('finalizes only a pending row, guarded by outcome + analysisId + ownerId (D-08/D-09)', async () => {
    const drizzle = createMockDrizzle()
    setupDeletePath(drizzle, { updateResult: [{ updatedId: 5 }] })

    const galaxyLayer = createMockGalaxyLayer(mockGalaxyHistory)

    await deleteAnalysis(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxyLayer),
      Effect.runPromise,
    )

    const whereCall = drizzle.mock.update.mock.results[0]?.value.where.mock.calls[0]?.[0]
    expect(whereCall).toEqual(and(
      eq(analysisMonitoring.analysisId, 1),
      eq(analysisMonitoring.ownerId, 'owner-uuid-1'),
      eq(analysisMonitoring.outcome, 'pending'),
    ))
  })

  it('returns undefined (not a numeric count) when the pending-guarded update matches 0 rows', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.update.mockImplementation(() => createMockDrizzleResult([]))

    const finalized = await finalizeAnalysisMonitoringEffect(1, 'owner-uuid-1', drizzle.mock as never)
      .pipe(Effect.runPromise)

    // Drizzle `.returning()` yields rows, not counts: a 0-row no-op is undefined.
    expect(finalized).toBeUndefined()
  })

  it('treats a 0-row finalize match as a no-op and still deletes the analysis without throwing', async () => {
    const drizzle = createMockDrizzle()
    setupDeletePath(drizzle, { updateResult: [] })

    const galaxyLayer = createMockGalaxyLayer(mockGalaxyHistory)

    const result = await deleteAnalysis(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxyLayer),
      Effect.runPromise,
    )

    expect(result).toEqual([{ id: 1 }])
    // The update ran (matched 0 rows) and was a no-op — no throw, delete proceeds.
    expect(drizzle.mock.update).toHaveBeenCalledTimes(1)
  })

  it('runs the finalize UPDATE before the analyses DELETE inside the same transaction (D-08)', async () => {
    const drizzle = createMockDrizzle()
    const order: string[] = []
    drizzle.mock.select.mockImplementation(() =>
      createMockDrizzleResult([{ analyses: mockDbAnalysis, histories: mockDbHistory }]),
    )
    drizzle.mock.update.mockImplementation(() => {
      order.push('update')
      return createMockDrizzleResult([{ updatedId: 5 }])
    })
    drizzle.mock.delete.mockImplementation(() => {
      order.push('delete')
      return createMockDrizzleResult([{ id: 1 }])
    })

    const galaxyLayer = createMockGalaxyLayer(mockGalaxyHistory)

    await deleteAnalysis(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxyLayer),
      Effect.runPromise,
    )

    // The finalize must run while `analysis_id` is still set (the ON DELETE SET
    // NULL FK would otherwise null it after the delete).
    expect(order).toEqual(['update', 'delete'])
    expect(drizzle.mock.transaction).toHaveBeenCalledTimes(1)
  })

  it('never overwrites a real terminal outcome (success) with cancelled (D-09)', async () => {
    const drizzle = createMockDrizzle()
    // Row already at a real terminal outcome -> pending-guard matches 0 rows -> no-op.
    setupDeletePath(drizzle, { updateResult: [] })

    const galaxyLayer = createMockGalaxyLayer(mockGalaxyHistory)

    const result = await deleteAnalysis(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxyLayer),
      Effect.runPromise,
    )

    expect(result).toEqual([{ id: 1 }])
    // The pending guard is what protects a `success` row from being rewritten.
    const setCall = drizzle.mock.update.mock.results[0]?.value.set.mock.calls[0]?.[0]
    expect(setCall).toMatchObject({ outcome: 'cancelled' })
    const whereCall = drizzle.mock.update.mock.results[0]?.value.where.mock.calls[0]?.[0]
    expect(whereCall).toEqual(and(
      eq(analysisMonitoring.analysisId, 1),
      eq(analysisMonitoring.ownerId, 'owner-uuid-1'),
      eq(analysisMonitoring.outcome, 'pending'),
    ))
  })

  it('does not finalize or delete when the Galaxy history delete fails (D-07, transaction unreached)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.select.mockImplementation(() =>
      createMockDrizzleResult([{ analyses: mockDbAnalysis, histories: mockDbHistory }]),
    )

    const galaxyLayer = createFailingGalaxyLayer(new Error('Galaxy down'))

    const exit = await deleteAnalysis(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxyLayer),
      Effect.runPromiseExit,
    )

    // The Galaxy failure propagates; the DB transaction is never entered.
    expectFailure(exit, (error) => {
      expect(error).toBeTruthy()
    })
    expect(drizzle.mock.transaction).not.toHaveBeenCalled()
    expect(drizzle.mock.update).not.toHaveBeenCalled()
    expect(drizzle.mock.delete).not.toHaveBeenCalled()
  })

  it('runs the finalize on the transaction client, not the root mock (distinct tx, D-04/D-07)', async () => {
    const drizzle = createMockDrizzle()
    const tx = {
      update: vi.fn(() => createMockDrizzleResult([{ updatedId: 5 }])),
      delete: vi.fn(() => createMockDrizzleResult([{ id: 1 }])),
    }
    drizzle.mock.select.mockImplementation(() =>
      createMockDrizzleResult([{ analyses: mockDbAnalysis, histories: mockDbHistory }]),
    )
    drizzle.mock.transaction.mockImplementation((cb: (client: typeof tx) => Promise<unknown>) => cb(tx))

    const galaxyLayer = createMockGalaxyLayer(mockGalaxyHistory)

    const result = await deleteAnalysis(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxyLayer),
      Effect.runPromise,
    )

    expect(result).toEqual([{ id: 1 }])
    // The helper finalizes on the passed tx, never the root mock.
    expect(tx.update).toHaveBeenCalledWith(analysisMonitoring)
    expect(drizzle.mock.update).not.toHaveBeenCalled()
    expect(tx.delete).toHaveBeenCalledWith(analyses)
  })
})
