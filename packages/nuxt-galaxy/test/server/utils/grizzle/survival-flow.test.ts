import { and, eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { analyses } from '../../../../src/runtime/server/db/schema/galaxy/analyses'
import { analysisMonitoring } from '../../../../src/runtime/server/db/schema/galaxy/analysisMonitoring'
import { deleteAnalysis } from '../../../../src/runtime/server/utils/grizzle/analyses'
import {
  getWorkflowUsage,
  insertAnalysisMonitoringEffect,
} from '../../../../src/runtime/server/utils/grizzle/analysisMonitoring'
import {
  createMockDrizzle,
  createMockDrizzleResult,
  createMockGalaxyLayer,
  mockDbAnalysis,
  mockDbHistory,
  mockGalaxyHistory,
} from '../../fixtures'

describe('analysis monitoring stats survive workflow deletion (D-07)', () => {
  it('threads create -> delete -> query so the snapshotted name surfaces, not the unknown bucket', async () => {
    const drizzle = createMockDrizzle()

    // ---- Step 1 — CREATE: snapshot provenance is frozen at write time (D-10).
    drizzle.setResult([{ id: 1 }])
    await insertAnalysisMonitoringEffect(
      1,
      'owner-uuid-1',
      2,
      'Test Analysis',
      'galaxy-invocation-1',
      { workflowName: 'Pancake Wrapper', galaxyWorkflowId: 'galaxy-wf-9', workflowVersion: '2.0' },
    ).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    const createdValues = drizzle.mock.insert.mock.results[0]?.value.values.mock.calls[0]?.[0]
    expect(createdValues).toMatchObject({
      workflowName: 'Pancake Wrapper',
      galaxyWorkflowId: 'galaxy-wf-9',
      workflowVersion: '2.0',
    })

    // ---- Step 2 — DELETE: route through the REAL deleteAnalysis with a
    // distinct tx client so the finalize UPDATE lands on the tx, not the root
    // mock (copies analyses.test.ts distinct-tx pattern L503-527).
    const tx = {
      update: vi.fn(() => createMockDrizzleResult([{ updatedId: 5 }])),
      delete: vi.fn(() => createMockDrizzleResult([{ id: 1 }])),
    }
    drizzle.mock.select.mockImplementation(() =>
      createMockDrizzleResult([{ analyses: mockDbAnalysis, histories: mockDbHistory }]),
    )
    drizzle.mock.transaction.mockImplementation((cb: (client: typeof tx) => Promise<unknown>) => cb(tx))

    const galaxyLayer = createMockGalaxyLayer(mockGalaxyHistory)

    const deleted = await deleteAnalysis(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxyLayer),
      Effect.runPromise,
    )

    expect(deleted).toEqual([{ id: 1 }])
    // Finalize UPDATE lands on the transaction-issued client, not the root mock.
    expect(tx.update).toHaveBeenCalledWith(analysisMonitoring)
    expect(drizzle.mock.update).not.toHaveBeenCalled()
    const finalizeSet = tx.update.mock.results[0]?.value.set.mock.calls[0]?.[0]
    expect(finalizeSet).toMatchObject({
      outcome: 'cancelled',
      completedAt: expect.any(Date) as unknown,
    })
    // Pending-guard WHERE asserted inside the integrated flow (D-08/D-09).
    const finalizeWhere = tx.update.mock.results[0]?.value.where.mock.calls[0]?.[0]
    expect(finalizeWhere).toEqual(and(
      eq(analysisMonitoring.analysisId, 1),
      eq(analysisMonitoring.ownerId, 'owner-uuid-1'),
      eq(analysisMonitoring.outcome, 'pending'),
    ))
    // The analysis row is deleted (never the monitoring row).
    expect(tx.delete).toHaveBeenCalledWith(analyses)
    expect(tx.delete).not.toHaveBeenCalledWith(analysisMonitoring)

    // ---- Step 3 — QUERY (survive): after deletion the monitoring row remains,
    // keyed by its snapshotted name. Re-point the select for the follow-up
    // per-workflow query consumed by getWorkflowUsage.
    drizzle.mock.select.mockImplementation(() =>
      createMockDrizzleResult([
        { workflowId: 2, name: 'Pancake Wrapper', version: '2.0', total: 1, success: 0, error: 0, cancelled: 1, pending: 0 },
      ]),
    )

    const usage = await getWorkflowUsage('owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    // The SURVIVED row is surfaced by its snapshotted name — NOT the unknown bucket.
    expect(usage).toHaveLength(1)
    expect(usage[0]).toMatchObject({
      workflowId: 2,
      name: 'Pancake Wrapper',
      version: '2.0',
      cancelled: 1,
    })
    // D-14 / STAT-04 zero-denominator edge: no terminal outcomes => 0, not null.
    expect(usage[0].successRate).toBe(0)
  })
})
