import type { InvocationJobsSummary } from 'blendtype'
import { and, eq } from 'drizzle-orm'
import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'
import { analysisMonitoring } from '../../../../src/runtime/server/db/schema/galaxy/analysisMonitoring'
import {
  computeSuccessRate,
  deriveInvocationOutcomeFromJobsSummary,
  getAllAnalysisMonitoringCounts,
  getAllAnalysisMonitoringStats,
  getAllTrend,
  getAllWorkflowUsage,
  getAnalysisMonitoringCounts,
  getAnalysisMonitoringStats,
  getTrend,
  getWorkflowUsage,
  GetWorkflowUsageError,
  insertAnalysisMonitoringEffect,
  nonTerminalJobStates,
  terminalJobStates,
  TREND_INTERVALS,
  updateAnalysisMonitoringEffect,
} from '../../../../src/runtime/server/utils/grizzle/analysisMonitoring'
import { createMockDrizzle, createMockDrizzleResult, mockDrizzleSelectRejects } from '../../fixtures'

describe('insertAnalysisMonitoringEffect', () => {
  it('should insert a monitoring row with pending outcome', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 1 }])

    await insertAnalysisMonitoringEffect(
      1,
      'owner-uuid-1',
      2,
      'Test Analysis',
      'galaxy-invocation-1',
    ).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(drizzle.mock.insert).toHaveBeenCalledTimes(1)
    expect(drizzle.mock.insert).toHaveBeenCalledWith(analysisMonitoring)
    const values = drizzle.mock.insert.mock.results[0]?.value.values.mock.calls[0]?.[0]
    expect(values).toMatchObject({
      analysisId: 1,
      ownerId: 'owner-uuid-1',
      workflowId: 2,
      name: 'Test Analysis',
      galaxyInvocationId: 'galaxy-invocation-1',
      outcome: 'pending',
    })
  })

  it('should not fabricate provenance when no snapshot is provided (NULL passthrough, D-05)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 1 }])

    await insertAnalysisMonitoringEffect(
      1,
      'owner-uuid-1',
      2,
      'Test Analysis',
      'galaxy-invocation-1',
    ).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    const values = drizzle.mock.insert.mock.results[0]?.value.values.mock.calls[0]?.[0]
    expect(values.workflowName).toBeNull()
    expect(values.galaxyWorkflowId).toBeNull()
    expect(values.workflowVersion).toBeNull()
  })

  it('should write workflow snapshot values when provided', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 1 }])

    await insertAnalysisMonitoringEffect(
      1,
      'owner-uuid-1',
      2,
      'Test Analysis',
      'galaxy-invocation-1',
      {
        workflowName: 'My Workflow',
        galaxyWorkflowId: 'galaxy-wf-1',
        workflowVersion: '1.0',
      },
    ).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    const values = drizzle.mock.insert.mock.results[0]?.value.values.mock.calls[0]?.[0]
    expect(values).toMatchObject({
      workflowName: 'My Workflow',
      galaxyWorkflowId: 'galaxy-wf-1',
      workflowVersion: '1.0',
    })
  })

  it('should resolve each snapshot field independently (D-05): unresolved fields stay NULL', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 1 }])

    await insertAnalysisMonitoringEffect(
      1,
      'owner-uuid-1',
      2,
      'Test Analysis',
      'galaxy-invocation-1',
      {
        workflowName: null,
        galaxyWorkflowId: 'galaxy-wf-1',
        workflowVersion: null,
      },
    ).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    const values = drizzle.mock.insert.mock.results[0]?.value.values.mock.calls[0]?.[0]
    expect(values.workflowName).toBeNull()
    expect(values.galaxyWorkflowId).toBe('galaxy-wf-1')
    expect(values.workflowVersion).toBeNull()
  })

  it('should run on the supplied tx client instead of the root Drizzle mock (D-04 interop)', async () => {
    const drizzle = createMockDrizzle()
    const distinctTx = createMockDrizzleResult([{ id: 1 }])
    drizzle.setResult([{ id: 1 }])

    await insertAnalysisMonitoringEffect(
      1,
      'owner-uuid-1',
      2,
      'Test Analysis',
      'galaxy-invocation-1',
      {
        workflowName: 'My Workflow',
        galaxyWorkflowId: 'galaxy-wf-1',
        workflowVersion: '1.0',
      },
      distinctTx as never,
    ).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    // The helper must use the passed tx and never acquire a separate connection.
    expect(drizzle.mock.insert).not.toHaveBeenCalled()
    expect(distinctTx.insert).toHaveBeenCalledTimes(1)
    expect(distinctTx.insert).toHaveBeenCalledWith(analysisMonitoring)
    const txValues = distinctTx.insert.mock.results[0]?.value.values.mock.calls[0]?.[0]
    expect(txValues).toMatchObject({
      workflowName: 'My Workflow',
      galaxyWorkflowId: 'galaxy-wf-1',
      workflowVersion: '1.0',
    })
  })
})

describe('updateAnalysisMonitoringEffect', () => {
  it('should be a no-op when invocation state is scheduled', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 1 }])

    const result = await updateAnalysisMonitoringEffect({
      galaxyInvocationId: 'galaxy-invocation-1',
      state: 'scheduled',
      stderr: null,
      ownerId: 'owner-uuid-1',
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toBeUndefined()
    expect(drizzle.mock.update).not.toHaveBeenCalled()
  })

  it('should update monitoring row to error and capture stderr when invocation state is failed', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 1 }])

    await updateAnalysisMonitoringEffect({
      galaxyInvocationId: 'galaxy-invocation-1',
      state: 'failed',
      stderr: 'something went wrong',
      ownerId: 'owner-uuid-1',
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(drizzle.mock.update).toHaveBeenCalledTimes(1)
    const setCall = drizzle.mock.update.mock.results[0]?.value.set.mock.calls[0]?.[0]
    expect(setCall).toMatchObject({
      outcome: 'error',
      completedAt: expect.any(Date) as unknown,
      errorMessage: 'something went wrong',
    })
  })

  it('should update monitoring row to cancelled when invocation state is cancelled', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 1 }])

    await updateAnalysisMonitoringEffect({
      galaxyInvocationId: 'galaxy-invocation-1',
      state: 'cancelled',
      stderr: null,
      ownerId: 'owner-uuid-1',
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(drizzle.mock.update).toHaveBeenCalledTimes(1)
    const setCall = drizzle.mock.update.mock.results[0]?.value.set.mock.calls[0]?.[0]
    expect(setCall).toMatchObject({
      outcome: 'cancelled',
      completedAt: expect.any(Date) as unknown,
    })
    expect(setCall.errorMessage).toBeNull()
  })

  it('should update monitoring row to success when invocation state is completed', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 1 }])

    await updateAnalysisMonitoringEffect({
      galaxyInvocationId: 'galaxy-invocation-1',
      state: 'completed',
      stderr: null,
      ownerId: 'owner-uuid-1',
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(drizzle.mock.update).toHaveBeenCalledTimes(1)
    const setCall = drizzle.mock.update.mock.results[0]?.value.set.mock.calls[0]?.[0]
    expect(setCall).toMatchObject({
      outcome: 'success',
      completedAt: expect.any(Date) as unknown,
    })
    expect(setCall.errorMessage).toBeNull()
  })

  it('should update a monitoring row even after the parent analysis is deleted', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 1, analysisId: null }])

    const result = await updateAnalysisMonitoringEffect({
      galaxyInvocationId: 'galaxy-invocation-1',
      state: 'completed',
      stderr: null,
      ownerId: 'owner-uuid-1',
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual({ id: 1, analysisId: null })
  })

  it('should be a no-op when the invocation state is not terminal', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const result = await updateAnalysisMonitoringEffect({
      galaxyInvocationId: 'galaxy-invocation-1',
      state: 'requires_materialization',
      stderr: null,
      ownerId: 'owner-uuid-1',
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toBeUndefined()
    expect(drizzle.mock.update).not.toHaveBeenCalled()
  })

  it('should be a no-op when the terminal row is already finalized', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const result = await updateAnalysisMonitoringEffect({
      galaxyInvocationId: 'galaxy-invocation-1',
      state: 'completed',
      stderr: null,
      ownerId: 'owner-uuid-1',
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toBeUndefined()
    expect(drizzle.mock.update).toHaveBeenCalledTimes(1)
  })
})

describe('getAnalysisMonitoringCounts', () => {
  it('should return aggregated counts for the owner in a single query', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ total: 7, success: 3, error: 2, cancelled: 1, pending: 1 }])

    const result = await getAnalysisMonitoringCounts('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual({
      total: 7,
      success: 3,
      error: 2,
      cancelled: 1,
      pending: 1,
    })
    expect(drizzle.mock.select).toHaveBeenCalledTimes(1)
    const whereCall = drizzle.mock.select.mock.results[0]?.value.where.mock.calls[0]?.[0]
    expect(whereCall).toEqual(and(eq(analysisMonitoring.ownerId, 'owner-uuid-1')))
  })
})

describe('terminalJobStates', () => {
  it('includes known terminal job states', () => {
    expect(terminalJobStates.has('ok')).toBe(true)
    expect(terminalJobStates.has('error')).toBe(true)
    expect(terminalJobStates.has('failed')).toBe(true)
    expect(terminalJobStates.has('stopped')).toBe(true)
    expect(terminalJobStates.has('stop')).toBe(true)
    expect(terminalJobStates.has('deleted')).toBe(true)
    expect(terminalJobStates.has('skipped')).toBe(true)
  })

  it('excludes non-terminal job states', () => {
    expect(terminalJobStates.has('running')).toBe(false)
    expect(terminalJobStates.has('paused')).toBe(false)
    expect(terminalJobStates.has('queued')).toBe(false)
  })
})

describe('nonTerminalJobStates', () => {
  it('includes known non-terminal job states', () => {
    expect(nonTerminalJobStates.has('running')).toBe(true)
    expect(nonTerminalJobStates.has('paused')).toBe(true)
    expect(nonTerminalJobStates.has('queued')).toBe(true)
  })

  it('excludes terminal job states', () => {
    expect(nonTerminalJobStates.has('ok')).toBe(false)
    expect(nonTerminalJobStates.has('error')).toBe(false)
    expect(nonTerminalJobStates.has('deleted')).toBe(false)
  })
})

describe('deriveInvocationOutcomeFromJobsSummary', () => {
  it('returns success when all jobs are ok', () => {
    expect(deriveInvocationOutcomeFromJobsSummary({
      model: 'WorkflowInvocation',
      id: 'inv-1',
      states: { ok: 3 },
      populated_state: 'ok',
    })).toBe('success')
  })

  it('returns success when all jobs are skipped', () => {
    expect(deriveInvocationOutcomeFromJobsSummary({
      model: 'WorkflowInvocation',
      id: 'inv-1',
      states: { skipped: 2 },
      populated_state: 'ok',
    })).toBe('success')
  })

  it('returns success when jobs are a mix of ok and skipped', () => {
    expect(deriveInvocationOutcomeFromJobsSummary({
      model: 'WorkflowInvocation',
      id: 'inv-1',
      states: { ok: 1, skipped: 1 },
      populated_state: 'ok',
    })).toBe('success')
  })

  it('returns error when any job is error', () => {
    expect(deriveInvocationOutcomeFromJobsSummary({
      model: 'WorkflowInvocation',
      id: 'inv-1',
      states: { ok: 1, error: 1 },
      populated_state: 'ok',
    })).toBe('error')
  })

  it('returns error when any job is failed', () => {
    expect(deriveInvocationOutcomeFromJobsSummary({
      model: 'WorkflowInvocation',
      id: 'inv-1',
      states: { ok: 1, failed: 1 },
      populated_state: 'ok',
    })).toBe('error')
  })

  it('returns error when any job is stopped', () => {
    expect(deriveInvocationOutcomeFromJobsSummary({
      model: 'WorkflowInvocation',
      id: 'inv-1',
      states: { ok: 1, stopped: 1 },
      populated_state: 'ok',
    })).toBe('error')
  })

  it('returns error when any job is stop', () => {
    expect(deriveInvocationOutcomeFromJobsSummary({
      model: 'WorkflowInvocation',
      id: 'inv-1',
      states: { ok: 1, stop: 1 },
      populated_state: 'ok',
    })).toBe('error')
  })

  it('returns cancelled when all terminal jobs are deleted', () => {
    expect(deriveInvocationOutcomeFromJobsSummary({
      model: 'WorkflowInvocation',
      id: 'inv-1',
      states: { deleted: 2 },
      populated_state: 'ok',
    })).toBe('cancelled')
  })

  it('returns undefined when a job is running', () => {
    expect(deriveInvocationOutcomeFromJobsSummary({
      model: 'WorkflowInvocation',
      id: 'inv-1',
      states: { ok: 1, running: 1 },
      populated_state: 'running',
    })).toBeUndefined()
  })

  it('returns undefined when a job is paused', () => {
    expect(deriveInvocationOutcomeFromJobsSummary({
      model: 'WorkflowInvocation',
      id: 'inv-1',
      states: { ok: 1, paused: 1 },
      populated_state: 'running',
    })).toBeUndefined()
  })

  it('returns undefined when a job is queued', () => {
    expect(deriveInvocationOutcomeFromJobsSummary({
      model: 'WorkflowInvocation',
      id: 'inv-1',
      states: { ok: 1, queued: 1 },
      populated_state: 'running',
    })).toBeUndefined()
  })

  it('returns undefined for an empty states object', () => {
    expect(deriveInvocationOutcomeFromJobsSummary({
      model: 'WorkflowInvocation',
      id: 'inv-1',
      states: {},
      populated_state: 'new',
    })).toBeUndefined()
  })

  it('returns undefined when all job counts are zero', () => {
    expect(deriveInvocationOutcomeFromJobsSummary({
      model: 'WorkflowInvocation',
      id: 'inv-1',
      states: { ok: 0, running: 0 },
      populated_state: 'new',
    })).toBeUndefined()
  })

  it('returns undefined for unknown states', () => {
    expect(deriveInvocationOutcomeFromJobsSummary({
      model: 'WorkflowInvocation',
      id: 'inv-1',
      states: { unknown_state: 1 } as InvocationJobsSummary['states'],
      populated_state: 'new',
    })).toBeUndefined()
  })

  it('returns undefined when populated_state is not ok', () => {
    expect(deriveInvocationOutcomeFromJobsSummary({
      model: 'WorkflowInvocation',
      id: 'inv-1',
      states: { ok: 1 },
      populated_state: 'new',
    })).toBeUndefined()
  })

  it('returns undefined when a count is negative', () => {
    expect(deriveInvocationOutcomeFromJobsSummary({
      model: 'WorkflowInvocation',
      id: 'inv-1',
      states: { ok: -1 },
      populated_state: 'ok',
    })).toBeUndefined()
  })

  it('returns undefined when a count is not a number', () => {
    expect(deriveInvocationOutcomeFromJobsSummary({
      model: 'WorkflowInvocation',
      id: 'inv-1',
      states: { ok: Number.NaN },
      populated_state: 'ok',
    })).toBeUndefined()
  })

  it('returns error before success when both error and ok are present', () => {
    expect(deriveInvocationOutcomeFromJobsSummary({
      model: 'WorkflowInvocation',
      id: 'inv-1',
      states: { ok: 2, error: 1 },
      populated_state: 'ok',
    })).toBe('error')
  })
})

describe('getAllAnalysisMonitoringCounts', () => {
  it('should return global aggregated counts in a single query', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ total: 12, success: 5, error: 4, cancelled: 2, pending: 1 }])

    const result = await getAllAnalysisMonitoringCounts().pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual({
      total: 12,
      success: 5,
      error: 4,
      cancelled: 2,
      pending: 1,
    })
    expect(drizzle.mock.select).toHaveBeenCalledTimes(1)
    expect(drizzle.mock.select.mock.results[0]?.value.where.mock.calls.length).toBe(0)
  })
})

describe('computeSuccessRate', () => {
  it('computes success / (success + error) for terminal outcomes (D-01)', () => {
    expect(computeSuccessRate(3, 2)).toBe(3 / 5)
  })

  it('returns 0 when there are no terminal outcomes (D-02 zero denominator)', () => {
    expect(computeSuccessRate(0, 0)).toBe(0)
  })

  it('returns 1 when there are no errors', () => {
    expect(computeSuccessRate(5, 0)).toBe(1)
  })
})

describe('getWorkflowUsage', () => {
  it('shapes per-workflow usage and emits a WHERE on ownerId (D-12)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([
      { workflowId: 1, name: 'Workflow A', version: '1.0', total: 5, success: 3, error: 2, cancelled: 0, pending: 0 },
      { workflowId: 2, name: 'Workflow B', version: '2.0', total: 4, success: 2, error: 1, cancelled: 1, pending: 0 },
    ])

    const result = await getWorkflowUsage('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual([
      { workflowId: 1, name: 'Workflow A', version: '1.0', total: 5, success: 3, error: 2, cancelled: 0, pending: 0, successRate: 3 / 5 },
      { workflowId: 2, name: 'Workflow B', version: '2.0', total: 4, success: 2, error: 1, cancelled: 1, pending: 0, successRate: 2 / 3 },
    ])
    const whereCall = drizzle.mock.select.mock.results[0]?.value.where.mock.calls[0]?.[0]
    expect(whereCall).toEqual(and(eq(analysisMonitoring.ownerId, 'owner-uuid-1')))
  })

  it('collapses orphaned workflows into a single unknown bucket with summed counts (D-09)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([
      { workflowId: 10, name: null, version: null, total: 2, success: 1, error: 1, cancelled: 0, pending: 0 },
      { workflowId: 11, name: null, version: null, total: 3, success: 2, error: 0, cancelled: 1, pending: 0 },
      { workflowId: 7, name: 'Real WF', version: '3.0', total: 4, success: 4, error: 0, cancelled: 0, pending: 0 },
    ])

    const result = await getWorkflowUsage('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual([
      { workflowId: 7, name: 'Real WF', version: '3.0', total: 4, success: 4, error: 0, cancelled: 0, pending: 0, successRate: 1 },
      { workflowId: null, name: 'unknown', version: null, total: 5, success: 3, error: 1, cancelled: 1, pending: 0, successRate: 3 / 4 },
    ])
  })

  it('keeps same-name different-version workflows distinct (D-10 version first-class)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([
      { workflowId: 1, name: 'Same Name', version: '1.0', total: 3, success: 3, error: 0, cancelled: 0, pending: 0 },
      { workflowId: 2, name: 'Same Name', version: '2.0', total: 5, success: 4, error: 1, cancelled: 0, pending: 0 },
    ])

    const result = await getWorkflowUsage('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toHaveLength(2)
    expect(result[0].workflowId).toBe(1)
    expect(result[0].version).toBe('1.0')
    expect(result[1].workflowId).toBe(2)
    expect(result[1].version).toBe('2.0')
  })
})

describe('getAllWorkflowUsage', () => {
  it('shapes per-workflow usage and emits no WHERE (D-12)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([
      { workflowId: 1, name: 'Workflow A', version: '1.0', total: 5, success: 3, error: 2, cancelled: 0, pending: 0 },
    ])

    const result = await getAllWorkflowUsage().pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual([
      { workflowId: 1, name: 'Workflow A', version: '1.0', total: 5, success: 3, error: 2, cancelled: 0, pending: 0, successRate: 3 / 5 },
    ])
    expect(drizzle.mock.select.mock.results[0]?.value.where.mock.calls.length).toBe(0)
  })
})

describe('getWorkflowUsage boundary and error paths', () => {
  it('returns an empty array for an empty result set (no unknown bucket emitted)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const result = await getWorkflowUsage('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual([])
  })

  it('returns successRate 0 for a workflow with no terminal outcomes (D-02)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([
      { workflowId: 1, name: 'No Terminal', version: '1.0', total: 4, success: 0, error: 0, cancelled: 3, pending: 1 },
    ])

    const result = await getWorkflowUsage('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toHaveLength(1)
    expect(result[0].successRate).toBe(0)
  })

  it('surfaces GetWorkflowUsageError with the underlying message when the query rejects', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.select.mockImplementation(mockDrizzleSelectRejects(['from', 'groupBy', 'where'], new Error('boom')))

    const exit = await getWorkflowUsage('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) {
      return
    }
    if (exit.cause._tag === 'Fail') {
      expect(exit.cause.error).toBeInstanceOf(GetWorkflowUsageError)
      expect((exit.cause.error as GetWorkflowUsageError)._tag).toBe('GetWorkflowUsageError')
      expect((exit.cause.error as GetWorkflowUsageError).message).toContain('boom')
    }
    else {
      throw new Error(`Unexpected cause: ${exit.cause._tag}`)
    }
  })

  it('returns deep-equal, identically ordered arrays across repeated calls', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([
      { workflowId: 2, name: 'Workflow B', version: '2.0', total: 4, success: 2, error: 1, cancelled: 1, pending: 0 },
      { workflowId: 1, name: 'Workflow A', version: '1.0', total: 5, success: 3, error: 2, cancelled: 0, pending: 0 },
    ])

    const first = await getWorkflowUsage('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )
    const second = await getWorkflowUsage('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(second).toEqual(first)
  })

  it('keeps non-orphan row order invariant under repeated calls', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([
      { workflowId: 3, name: 'C', version: '1.0', total: 1, success: 1, error: 0, cancelled: 0, pending: 0 },
      { workflowId: 1, name: 'A', version: '1.0', total: 2, success: 1, error: 1, cancelled: 0, pending: 0 },
      { workflowId: 2, name: 'B', version: '1.0', total: 3, success: 2, error: 0, cancelled: 1, pending: 0 },
    ])

    const first = await getWorkflowUsage('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )
    const second = await getWorkflowUsage('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(first.map(entry => entry.workflowId)).toEqual([3, 1, 2])
    expect(second).toEqual(first)
  })
})

describe('tREND_INTERVALS', () => {
  it('is a closed allowlist mapping each granularity to its SQL interval literal', () => {
    expect(TREND_INTERVALS).toEqual({ day: '1 day', week: '1 week', month: '1 month' })
  })
})

describe('getTrend', () => {
  it('returns [] when the range query has no data (null min/max, STAT-03 empty edge)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([{ min: null, max: null }])
    drizzle.enqueueResult([])

    const result = await getTrend('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual([])
  })

  it('returns a single point matching its bucket row with successRate through computeSuccessRate', async () => {
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([
      { min: new Date('2026-08-10T00:00:00Z'), max: new Date('2026-08-10T00:00:00Z') },
    ])
    drizzle.enqueueResult([
      { bucket: '2026-08-10T00:00:00.000Z', total: 5, success: 3, error: 2, cancelled: 0, pending: 0 },
    ])

    const result = await getTrend('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual([
      { bucket: '2026-08-10', total: 5, success: 3, error: 2, cancelled: 0, pending: 0, successRate: 3 / 5 },
    ])
  })

  it('zero-fills an empty middle bucket across a three-day span (continuous series)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([
      { min: new Date('2026-08-10T00:00:00Z'), max: new Date('2026-08-12T00:00:00Z') },
    ])
    drizzle.enqueueResult([
      { bucket: '2026-08-10T00:00:00.000Z', total: 2, success: 1, error: 1, cancelled: 0, pending: 0 },
      { bucket: '2026-08-12T00:00:00.000Z', total: 3, success: 3, error: 0, cancelled: 0, pending: 0 },
    ])

    const result = await getTrend('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result.map(point => point.bucket)).toEqual(['2026-08-10', '2026-08-11', '2026-08-12'])
    expect(result[0]).toEqual({ bucket: '2026-08-10', total: 2, success: 1, error: 1, cancelled: 0, pending: 0, successRate: 1 / 2 })
    expect(result[1]).toEqual({ bucket: '2026-08-11', total: 0, success: 0, error: 0, cancelled: 0, pending: 0, successRate: 0 })
    expect(result[2]).toEqual({ bucket: '2026-08-12', total: 3, success: 3, error: 0, cancelled: 0, pending: 0, successRate: 1 })
  })

  it('steps months calendar-aware across a month boundary (no fixed-ms drift)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([
      { min: new Date('2026-01-15T10:00:00Z'), max: new Date('2026-03-10T10:00:00Z') },
    ])
    drizzle.enqueueResult([
      { bucket: '2026-02-01T00:00:00.000Z', total: 1, success: 1, error: 0, cancelled: 0, pending: 0 },
    ])

    const result = await getTrend('owner-uuid-1', 'month').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result.map(point => point.bucket)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(result[1].total).toBe(1)
  })

  it('emits WHERE eq(ownerId) on both queries while getAllTrend emits none', async () => {
    const self = createMockDrizzle()
    self.enqueueResult([
      { min: new Date('2026-08-10T00:00:00Z'), max: new Date('2026-08-10T00:00:00Z') },
    ])
    self.enqueueResult([
      { bucket: '2026-08-10T00:00:00.000Z', total: 1, success: 1, error: 0, cancelled: 0, pending: 0 },
    ])
    await getTrend('owner-uuid-1').pipe(
      Effect.provide(self.layer),
      Effect.runPromise,
    )
    const selfWheres = self.mock.select.mock.results.flatMap((selectResult: any) =>
      selectResult.value.where?.mock?.calls?.map((call: any) => call[0]) ?? [],
    )
    expect(selfWheres).toEqual([
      and(eq(analysisMonitoring.ownerId, 'owner-uuid-1')),
      and(eq(analysisMonitoring.ownerId, 'owner-uuid-1')),
    ])

    const admin = createMockDrizzle()
    admin.enqueueResult([
      { min: new Date('2026-08-10T00:00:00Z'), max: new Date('2026-08-10T00:00:00Z') },
    ])
    admin.enqueueResult([
      { bucket: '2026-08-10T00:00:00.000Z', total: 1, success: 1, error: 0, cancelled: 0, pending: 0 },
    ])
    await getAllTrend().pipe(
      Effect.provide(admin.layer),
      Effect.runPromise,
    )
    const adminWhereCount = admin.mock.select.mock.results.reduce(
      (count: number, selectResult: any) => count + (selectResult.value.where?.mock?.calls?.length ?? 0),
      0,
    )
    expect(adminWhereCount).toBe(0)
  })
})

describe('getTrend boundary and consistency invariants', () => {
  it('bucket sums equal the total by construction (D-05/D-06)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([
      { min: new Date('2026-08-10T00:00:00Z'), max: new Date('2026-08-12T00:00:00Z') },
    ])
    drizzle.enqueueResult([
      { bucket: '2026-08-10T00:00:00.000Z', total: 4, success: 2, error: 1, cancelled: 1, pending: 0 },
      { bucket: '2026-08-12T00:00:00.000Z', total: 3, success: 3, error: 0, cancelled: 0, pending: 0 },
    ])

    const result = await getTrend('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    const summed = result.reduce((total, point) => total + point.total, 0)
    expect(summed).toBe(7)
    expect(summed).toBe(4 + 3)
  })

  it('places every row count in exactly one bucket (no dropped or duplicated rows)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([
      { min: new Date('2026-08-10T00:00:00Z'), max: new Date('2026-08-12T00:00:00Z') },
    ])
    drizzle.enqueueResult([
      { bucket: '2026-08-10T00:00:00.000Z', total: 4, success: 2, error: 1, cancelled: 1, pending: 0 },
      { bucket: '2026-08-12T00:00:00.000Z', total: 3, success: 3, error: 0, cancelled: 0, pending: 0 },
    ])

    const result = await getTrend('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    // Each non-empty bucket carries exactly its row's counts; the empty middle stays zero.
    expect(result[0]).toMatchObject({ total: 4, success: 2, error: 1, cancelled: 1, pending: 0 })
    expect(result[2]).toMatchObject({ total: 3, success: 3, error: 0, cancelled: 0, pending: 0 })
    expect(result[1]).toMatchObject({ total: 0, success: 0 })
    // And no outcome count is duplicated across buckets.
    expect(result.reduce((s, p) => s + p.success, 0)).toBe(5)
  })

  it('returns deep-equal, identically ordered arrays across repeated calls (idempotency)', async () => {
    const drizzle = createMockDrizzle()
    for (let i = 0; i < 2; i++) {
      drizzle.enqueueResult([
        { min: new Date('2026-08-10T00:00:00Z'), max: new Date('2026-08-12T00:00:00Z') },
      ])
      drizzle.enqueueResult([
        { bucket: '2026-08-10T00:00:00.000Z', total: 2, success: 1, error: 0, cancelled: 1, pending: 0 },
        { bucket: '2026-08-12T00:00:00.000Z', total: 3, success: 3, error: 0, cancelled: 0, pending: 0 },
      ])
    }

    const first = await getTrend('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )
    const second = await getTrend('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(second).toEqual(first)
    expect(second.map(point => point.bucket)).toEqual(['2026-08-10', '2026-08-11', '2026-08-12'])
  })

  it('normalizes bucket keys to a canonical UTC day independent of session timezone', async () => {
    // 03:00Z on Aug 10 falls on Aug 9 in a US-Pacific (UTC-7) session; the UTC
    // bucket must remain Aug 10, and the driver-shaped SQL key must align with
    // the JS-generated key.
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([
      { min: new Date('2026-08-10T03:00:00Z'), max: new Date('2026-08-10T03:00:00Z') },
    ])
    drizzle.enqueueResult([
      { bucket: '2026-08-10T00:00:00.000Z', total: 1, success: 1, error: 0, cancelled: 0, pending: 0 },
    ])

    const result = await getTrend('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toHaveLength(1)
    expect(result[0].bucket).toBe('2026-08-10')
    expect(result[0].total).toBe(1)
  })
})

describe('getAnalysisMonitoringStats', () => {
  it('assembles counts + perWorkflow + trend into the additive stats shape and filters owner_id (D-11/D-12)', async () => {
    const drizzle = createMockDrizzle()
    const counts = { total: 7, success: 3, error: 2, cancelled: 1, pending: 1 }
    const perWorkflow = [
      { workflowId: 1, name: 'Workflow A', version: '1.0', total: 5, success: 3, error: 2, cancelled: 0, pending: 0, successRate: 3 / 5 },
    ]
    // The composite runs counts, perWorkflow, then trend (range + buckets) — four
    // distinct `.select()` results popped sequentially from the queue.
    drizzle.enqueueResult([counts])
    drizzle.enqueueResult(perWorkflow)
    drizzle.enqueueResult([
      { min: new Date('2026-08-10T00:00:00Z'), max: new Date('2026-08-10T00:00:00Z') },
    ])
    drizzle.enqueueResult([
      { bucket: '2026-08-10T00:00:00.000Z', total: 5, success: 3, error: 2, cancelled: 0, pending: 0 },
    ])

    const result = await getAnalysisMonitoringStats('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    // Superset of AnalysisMonitoringCounts plus successRate/perWorkflow/trend.
    expect(result).toEqual({
      total: 7,
      success: 3,
      error: 2,
      cancelled: 1,
      pending: 1,
      successRate: computeSuccessRate(3, 2),
      perWorkflow,
      trend: [
        { bucket: '2026-08-10', total: 5, success: 3, error: 2, cancelled: 0, pending: 0, successRate: 3 / 5 },
      ],
    })

    // Every constituent select (counts, perWorkflow, trend range, trend buckets)
    // filters owner_id server-side — T-14-09 mitigation.
    const whereCalls = drizzle.mock.select.mock.results.flatMap((selectResult: any) =>
      selectResult.value.where?.mock?.calls?.map((call: any) => call[0]) ?? [],
    )
    expect(whereCalls).toHaveLength(4)
    expect(whereCalls[0]).toEqual(and(eq(analysisMonitoring.ownerId, 'owner-uuid-1')))
    expect(whereCalls[1]).toEqual(and(eq(analysisMonitoring.ownerId, 'owner-uuid-1')))
    expect(whereCalls[2]).toEqual(and(eq(analysisMonitoring.ownerId, 'owner-uuid-1')))
    expect(whereCalls[3]).toEqual(and(eq(analysisMonitoring.ownerId, 'owner-uuid-1')))
  })

  it('returns successRate 0 (never null, D-02) when there are no terminal outcomes overall', async () => {
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([{ total: 5, success: 0, error: 0, cancelled: 2, pending: 3 }])
    drizzle.enqueueResult([])
    drizzle.enqueueResult([{ min: null, max: null }])
    drizzle.enqueueResult([])

    const result = await getAnalysisMonitoringStats('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result.successRate).toBe(0)
  })
})

describe('getAllAnalysisMonitoringStats', () => {
  it('assembles the same additive shape from all-rows helpers with zero WHERE calls (D-12, T-14-10)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([{ total: 12, success: 5, error: 4, cancelled: 2, pending: 1 }])
    drizzle.enqueueResult([
      { workflowId: 1, name: 'Workflow A', version: '1.0', total: 5, success: 3, error: 2, cancelled: 0, pending: 0 },
    ])
    drizzle.enqueueResult([
      { min: new Date('2026-08-10T00:00:00Z'), max: new Date('2026-08-10T00:00:00Z') },
    ])
    drizzle.enqueueResult([
      { bucket: '2026-08-10T00:00:00.000Z', total: 5, success: 3, error: 2, cancelled: 0, pending: 0 },
    ])

    const result = await getAllAnalysisMonitoringStats().pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result.successRate).toBe(computeSuccessRate(5, 4))
    expect(result.total).toBe(12)
    expect(result.perWorkflow).toHaveLength(1)
    expect(result.trend).toHaveLength(1)

    const whereCount = drizzle.mock.select.mock.results.reduce(
      (count: number, selectResult: any) => count + (selectResult.value.where?.mock?.calls?.length ?? 0),
      0,
    )
    expect(whereCount).toBe(0)
  })
})

describe('cross-dimension success-rate parity and uniformity (STAT-04)', () => {
  it('yields the same successRate from the single formula on every query path (STAT-04)', async () => {
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([{ total: 9, success: 4, error: 5, cancelled: 0, pending: 0 }])
    drizzle.enqueueResult([
      { workflowId: 1, name: 'A', version: '1.0', total: 5, success: 3, error: 2, cancelled: 0, pending: 0 },
      { workflowId: 2, name: 'B', version: '2.0', total: 4, success: 1, error: 3, cancelled: 0, pending: 0 },
    ])
    drizzle.enqueueResult([
      { min: new Date('2026-08-10T00:00:00Z'), max: new Date('2026-08-11T00:00:00Z') },
    ])
    drizzle.enqueueResult([
      { bucket: '2026-08-10T00:00:00.000Z', total: 1, success: 1, error: 0, cancelled: 0, pending: 0 },
      { bucket: '2026-08-11T00:00:00.000Z', total: 8, success: 3, error: 5, cancelled: 0, pending: 0 },
    ])

    const result = await getAnalysisMonitoringStats('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    // Every successRate-bearing entry is produced by computeSuccessRate —
    // recomputing the formula from that entry's (success, error) must agree.
    expect(result.successRate).toBe(computeSuccessRate(4, 5))
    expect(result.perWorkflow[0].successRate).toBe(computeSuccessRate(3, 2))
    expect(result.perWorkflow[1].successRate).toBe(computeSuccessRate(1, 3))
    expect(result.trend[0].successRate).toBe(computeSuccessRate(1, 0))
    expect(result.trend[1].successRate).toBe(computeSuccessRate(3, 5))
  })

  it('passes perWorkflow and trend through unchanged from the underlying helpers (no re-shaping)', async () => {
    const perWorkflowRows = [
      { workflowId: 1, name: 'A', version: '1.0', total: 5, success: 3, error: 2, cancelled: 0, pending: 0 },
      { workflowId: 2, name: 'B', version: '2.0', total: 4, success: 1, error: 3, cancelled: 0, pending: 0 },
    ]
    const rangeRow = [{ min: new Date('2026-08-10T00:00:00Z'), max: new Date('2026-08-11T00:00:00Z') }]
    const bucketRows = [
      { bucket: '2026-08-10T00:00:00.000Z', total: 1, success: 1, error: 0, cancelled: 0, pending: 0 },
      { bucket: '2026-08-11T00:00:00.000Z', total: 8, success: 3, error: 5, cancelled: 0, pending: 0 },
    ]

    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([{ total: 9, success: 4, error: 5, cancelled: 0, pending: 0 }])
    drizzle.enqueueResult(perWorkflowRows)
    drizzle.enqueueResult(rangeRow)
    drizzle.enqueueResult(bucketRows)
    const result = await getAnalysisMonitoringStats('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    // Standalone underlying helpers over the same rows.
    const perWorkflowDrizzle = createMockDrizzle()
    perWorkflowDrizzle.enqueueResult(perWorkflowRows)
    const standalonePerWorkflow = await getWorkflowUsage('owner-uuid-1').pipe(
      Effect.provide(perWorkflowDrizzle.layer),
      Effect.runPromise,
    )

    const trendDrizzle = createMockDrizzle()
    trendDrizzle.enqueueResult(rangeRow)
    trendDrizzle.enqueueResult(bucketRows)
    const standaloneTrend = await getTrend('owner-uuid-1').pipe(
      Effect.provide(trendDrizzle.layer),
      Effect.runPromise,
    )

    // The composite neither re-aggregates nor re-shapes these dimensions.
    expect(result.perWorkflow).toEqual(standalonePerWorkflow)
    expect(result.trend).toEqual(standaloneTrend)
  })
})

describe('getTrend over a requested range', () => {
  // the exclusive bound the endpoint hands down for "8 to 11 August"
  const FROM = new Date('2026-08-08T00:00:00.000Z')
  const TO = new Date('2026-08-12T00:00:00.000Z')

  it('spans the range asked for, not the days that happen to carry rows', async () => {
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([
      { min: new Date('2026-08-10T00:00:00Z'), max: new Date('2026-08-10T00:00:00Z') },
    ])
    drizzle.enqueueResult([
      { bucket: '2026-08-10T00:00:00.000Z', total: 2, success: 2, error: 0, cancelled: 0, pending: 0 },
    ])

    const result = await getTrend('owner-uuid-1', 'day', { from: FROM, to: TO }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    // the last bucket is the 11th: `to` is exclusive
    expect(result.map(point => point.bucket)).toEqual(['2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11'])
  })

  it('still sums to the counts total, because the buckets it adds are empty', async () => {
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([
      { min: new Date('2026-08-10T00:00:00Z'), max: new Date('2026-08-10T00:00:00Z') },
    ])
    drizzle.enqueueResult([
      { bucket: '2026-08-10T00:00:00.000Z', total: 2, success: 2, error: 0, cancelled: 0, pending: 0 },
    ])

    const result = await getTrend('owner-uuid-1', 'day', { from: FROM, to: TO }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result.reduce((sum, point) => sum + point.total, 0)).toBe(2)
  })

  it('shows a window with nothing in it as empty buckets rather than as no trend', async () => {
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([{ min: null, max: null }])
    drizzle.enqueueResult([])

    const result = await getTrend('owner-uuid-1', 'day', { from: FROM, to: TO }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result.map(point => point.bucket)).toEqual(['2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11'])
    expect(result.every(point => point.total === 0)).toBe(true)
  })

  it('takes the start from the data when only an end is asked for', async () => {
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([
      { min: new Date('2026-08-10T00:00:00Z'), max: new Date('2026-08-14T00:00:00Z') },
    ])
    drizzle.enqueueResult([])

    const result = await getTrend('owner-uuid-1', 'day', { to: new Date('2026-08-12T00:00:00.000Z') }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    // the earliest analysis to the day before the exclusive bound
    expect(result.map(point => point.bucket)).toEqual(['2026-08-10', '2026-08-11'])
  })
})

describe('getTrend over buckets as the driver delivers them', () => {
  it('matches a bucket arriving as canonical text, whatever zone the machine keeps', async () => {
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([
      { min: new Date('2026-08-08T21:35:27Z'), max: new Date('2026-08-09T12:32:08Z') },
    ])
    // what the query now returns: text, not a timestamp for the driver to read
    drizzle.enqueueResult([
      { bucket: '2026-08-08', total: 1, success: 1, error: 0, cancelled: 0, pending: 0 },
      { bucket: '2026-08-09', total: 1, success: 1, error: 0, cancelled: 0, pending: 0 },
    ])

    const result = await getTrend('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result.map(point => point.bucket)).toEqual(['2026-08-08', '2026-08-09'])
    // the invariant: every counted analysis lands in a bucket
    expect(result.reduce((sum, point) => sum + point.total, 0)).toBe(2)
  })
})

describe('getTrend over a one-sided range', () => {
  /** Midnight UTC, so many days back from today. */
  function daysAgo(days: number) {
    const today = new Date()
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - days))
  }

  it('runs an open-ended range up to today, keeping the empty buckets it asks for', async () => {
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([{ min: null, max: null }])
    drizzle.enqueueResult([])

    const result = await getTrend('owner-uuid-1', 'day', { from: daysAgo(2) }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    // "since Tuesday" means up to now, so the window is drawn even though
    // nothing in it ran
    expect(result).toHaveLength(3)
    expect(result.every(point => point.total === 0)).toBe(true)
  })
})

describe('admin usage over a range', () => {
  it('narrows every dimension for the admin variant too', async () => {
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([{ total: 4, success: 2, error: 2, cancelled: 0, pending: 0 }])
    drizzle.enqueueResult([{ workflowId: 1, name: 'A', version: '1.0', total: 4, success: 2, error: 2, cancelled: 0, pending: 0 }])
    drizzle.enqueueResult([{ min: new Date('2026-08-10T00:00:00Z'), max: new Date('2026-08-11T00:00:00Z') }])
    drizzle.enqueueResult([
      { bucket: '2026-08-10', total: 3, success: 2, error: 1, cancelled: 0, pending: 0 },
      { bucket: '2026-08-11', total: 1, success: 0, error: 1, cancelled: 0, pending: 0 },
    ])

    const stats = await getAllAnalysisMonitoringStats({
      from: new Date('2026-08-10T00:00:00.000Z'),
      to: new Date('2026-08-12T00:00:00.000Z'),
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    // the invariant the ticket asks for, at the level the endpoint returns
    expect(stats.trend.reduce((sum, point) => sum + point.total, 0)).toBe(stats.total)
    expect(stats.successRate).toBe(computeSuccessRate(stats.success, stats.error))
  })
})

describe('usage statistics at each granularity', () => {
  /**
   * What the endpoint hands down for "1 August to 31 August": from inclusive,
   * to exclusive.
   */
  const AUGUST = {
    from: new Date('2026-08-01T00:00:00.000Z'),
    to: new Date('2026-09-01T00:00:00.000Z'),
  }

  /** Counts, per-workflow, trend range, trend buckets — in the order they run. */
  function enqueueStats(drizzle: ReturnType<typeof createMockDrizzle>, buckets: Array<Record<string, unknown>>) {
    const total = buckets.reduce((sum, bucket) => sum + (bucket.total as number), 0)
    const success = buckets.reduce((sum, bucket) => sum + (bucket.success as number), 0)
    const error = buckets.reduce((sum, bucket) => sum + (bucket.error as number), 0)
    drizzle.enqueueResult([{ total, success, error, cancelled: 0, pending: 0 }])
    drizzle.enqueueResult([{ workflowId: 1, name: 'A', version: '1.0', total, success, error, cancelled: 0, pending: 0 }])
    drizzle.enqueueResult([{ min: new Date('2026-08-04T09:00:00Z'), max: new Date('2026-08-27T09:00:00Z') }])
    drizzle.enqueueResult(buckets)
  }

  it('buckets a month by ISO week, starting each one on a Monday', async () => {
    const drizzle = createMockDrizzle()
    // Mondays: 27 July, then every seventh day. 1 August is a Saturday, so the
    // week holding it starts before the range does.
    enqueueStats(drizzle, [
      { bucket: '2026-08-03', total: 4, success: 3, error: 1, cancelled: 0, pending: 0 },
      { bucket: '2026-08-24', total: 2, success: 1, error: 1, cancelled: 0, pending: 0 },
    ])

    const stats = await getAnalysisMonitoringStats('owner-uuid-1', AUGUST, 'week').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(stats.trend.map(point => point.bucket)).toEqual([
      '2026-07-27',
      '2026-08-03',
      '2026-08-10',
      '2026-08-17',
      '2026-08-24',
      '2026-08-31',
    ])
    // zero-fill survives the coarser bucket
    expect(stats.trend.filter(point => point.total === 0)).toHaveLength(4)
    expect(stats.trend.reduce((sum, point) => sum + point.total, 0)).toBe(stats.total)
  })

  it('buckets a quarter by calendar month', async () => {
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([{ total: 9, success: 6, error: 3, cancelled: 0, pending: 0 }])
    drizzle.enqueueResult([{ workflowId: 1, name: 'A', version: '1.0', total: 9, success: 6, error: 3, cancelled: 0, pending: 0 }])
    drizzle.enqueueResult([{ min: new Date('2026-06-14T09:00:00Z'), max: new Date('2026-08-27T09:00:00Z') }])
    drizzle.enqueueResult([
      { bucket: '2026-06-01', total: 5, success: 4, error: 1, cancelled: 0, pending: 0 },
      { bucket: '2026-08-01', total: 4, success: 2, error: 2, cancelled: 0, pending: 0 },
    ])

    const stats = await getAnalysisMonitoringStats('owner-uuid-1', {
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-09-01T00:00:00.000Z'),
    }, 'month').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(stats.trend.map(point => point.bucket)).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(stats.trend[1].total).toBe(0)
    expect(stats.trend.reduce((sum, point) => sum + point.total, 0)).toBe(stats.total)
  })

  it.each(['day', 'week', 'month'] as const)('sums its trend to the counts total at %s', async (granularity) => {
    const drizzle = createMockDrizzle()
    // whatever the bucket width, the same analyses are counted: one row from
    // the SQL side at each width, holding everything in range
    enqueueStats(drizzle, [
      { bucket: granularity === 'month' ? '2026-08-01' : '2026-08-03', total: 6, success: 4, error: 2, cancelled: 0, pending: 0 },
    ])

    const stats = await getAnalysisMonitoringStats('owner-uuid-1', AUGUST, granularity).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(stats.total).toBe(6)
    expect(stats.trend.reduce((sum, point) => sum + point.total, 0)).toBe(stats.total)
    expect(stats.successRate).toBe(computeSuccessRate(stats.success, stats.error))
  })

  it('buckets by day when no granularity is asked for, as it always has', async () => {
    const drizzle = createMockDrizzle()
    enqueueStats(drizzle, [
      { bucket: '2026-08-30', total: 1, success: 1, error: 0, cancelled: 0, pending: 0 },
      { bucket: '2026-08-31', total: 1, success: 1, error: 0, cancelled: 0, pending: 0 },
    ])

    const stats = await getAnalysisMonitoringStats('owner-uuid-1', AUGUST).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(stats.trend).toHaveLength(31)
  })

  it('carries the granularity through the admin variant too', async () => {
    const drizzle = createMockDrizzle()
    drizzle.enqueueResult([{ total: 3, success: 3, error: 0, cancelled: 0, pending: 0 }])
    drizzle.enqueueResult([{ workflowId: 1, name: 'A', version: '1.0', total: 3, success: 3, error: 0, cancelled: 0, pending: 0 }])
    drizzle.enqueueResult([{ min: new Date('2026-08-04T09:00:00Z'), max: new Date('2026-08-27T09:00:00Z') }])
    drizzle.enqueueResult([{ bucket: '2026-08-01', total: 3, success: 3, error: 0, cancelled: 0, pending: 0 }])

    const stats = await getAllAnalysisMonitoringStats(AUGUST, 'month').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(stats.trend.map(point => point.bucket)).toEqual(['2026-08'])
    expect(stats.trend.reduce((sum, point) => sum + point.total, 0)).toBe(stats.total)
  })
})
