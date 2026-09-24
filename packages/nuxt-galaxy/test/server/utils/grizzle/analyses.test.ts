import type { Context } from 'effect'
import { GalaxyFetch } from 'blendtype'
import { and, eq } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { analyses } from '../../../../src/runtime/server/db/schema/galaxy/analyses'
import { analysisMonitoring } from '../../../../src/runtime/server/db/schema/galaxy/analysisMonitoring'
import {
  deleteAnalysis,
  DeleteAnalysisError,
  getAllAnalyses,
  GetAnalysisError,
  getHistoryAnalysis,
  insertAnalysis,
  InsertAnalysisError,
  isInvocationTerminalState,
  runAnalysis,
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

/** One Galaxy request as `runAnalysis` made it, body included. */
interface RecordedRequest {
  url: string
  body: Record<string, unknown> | undefined
}

/**
 * A Galaxy layer that records the body of every request and answers all of
 * them with `response`. The shared `createRecordingGalaxyLayer` keeps the
 * method and the URL only, and what #48 has to see is a field in the body.
 */
function createBodyRecordingGalaxyLayer<T>(response: T): { requests: RecordedRequest[], layer: Layer.Layer<GalaxyFetch> } {
  const requests: RecordedRequest[] = []
  return {
    requests,
    layer: Layer.succeed(
      GalaxyFetch,
      (async (url: string, options?: { body?: Record<string, unknown> }) => {
        requests.push({ url, body: options?.body })
        return response
      }) as unknown as Context.Tag.Service<typeof GalaxyFetch>,
    ),
  }
}

/**
 * #48. Galaxy invokes the latest revision of a stored workflow unless the
 * request names one, and until now the request named none: a save in Galaxy's
 * editor after activation changed what the next analysis ran, under the same
 * name and version. The revision that was activated is the `version` the
 * export carried, stored as `revision`, and it now travels in two places:
 * the invocation, so that it is what runs, and the analysis row, so that it
 * is known afterwards.
 */
describe('runAnalysis', () => {
  const galaxyWorkflow = { galaxyId: 'galaxy-wf-1', revision: 3 }

  function start(layer: Layer.Layer<GalaxyFetch>, drizzle: ReturnType<typeof createMockDrizzle>) {
    return runAnalysis(
      'Test Analysis',
      'galaxy-history-1',
      galaxyWorkflow,
      1,
      1,
      'owner-uuid-1',
      {},
      {},
      {},
    ).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(layer),
      Effect.runPromise,
    )
  }

  it('names the activated revision in the invocation it asks Galaxy for', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ insertedId: 1 }])
    const galaxy = createBodyRecordingGalaxyLayer(mockGalaxyInvocation)

    await start(galaxy.layer, drizzle)

    const invocation = galaxy.requests.find(request => request.url === 'api/workflows/galaxy-wf-1/invocations')
    expect(invocation?.body).toMatchObject({ history_id: 'galaxy-history-1', version: 3 })
  })

  it('records the revision it started on the analysis row', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ insertedId: 1 }])
    const galaxy = createBodyRecordingGalaxyLayer(mockGalaxyInvocation)

    const result = await start(galaxy.layer, drizzle)

    expect(result.id).toBe(1)
    expect(drizzle.mock.insert).toHaveBeenCalledWith(analyses)
    const analysisValues = drizzle.mock.insert.mock.results[0]?.value.values.mock.calls[0]?.[0]
    expect(analysisValues).toMatchObject({ workflowId: 1, workflowRevision: 3 })
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

  it('refuses an insert that returned no row', async () => {
    // the row was just written, so none coming back means the database broke
    // a promise rather than that anything was legitimately absent
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const exit = await insertAnalysis({
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
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect((error as { message: string }).message).toContain('Expected exactly one row')
    })
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

  // `GetAnalysisError` is shared by several queries in this file. This
  // assertion used to live on `getAnalysis`; it moved here when that function
  // was deleted, so the class keeps a test against a caller that still exists.
  it('should fail with GetAnalysisError on database error', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.select.mockImplementation(mockDrizzleSelectRejects(['from', 'where'], new Error('DB error')))

    const exit = await getAllAnalyses('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(GetAnalysisError)
    })
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
      // A transaction client exposes the whole query surface; this test only
      // drives update and delete through it.
      select: vi.fn(() => createMockDrizzleResult([])),
      insert: vi.fn(() => createMockDrizzleResult([])),
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
