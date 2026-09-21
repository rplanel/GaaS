import type { Datamap, GalaxyInvocation, GalaxyWorkflowInput, GalaxyWorkflowParameters } from 'blendtype'
import type { Context } from 'effect'
import type { NewAnalysis } from '../../../types/nuxt-galaxy'
import type { WorkflowSnapshot } from './analysisMonitoring'
import * as bt from 'blendtype'
import { and, eq } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { analyses } from '../../db/schema/galaxy/analyses'
import { histories } from '../../db/schema/galaxy/histories'
import { Drizzle } from '../drizzle'
import { finalizeAnalysisMonitoringEffect, insertAnalysisMonitoringEffect } from './analysisMonitoring'
import { insertAnalysisInputEffect } from './datasets/input'
import { takeExactlyOne, takeUniqueOrNull } from './helper'

export { isInvocationTerminalState } from './analysisMonitoring'

export function runAnalysis(
  analysisName: string,
  galaxyHistoryId: string,
  galaxyWorkflowId: string,
  historyId: number,
  workflowId: number,
  ownerId: string,
  inputs: GalaxyWorkflowInput,
  parameters: GalaxyWorkflowParameters,
  datamap: Datamap,
  workflowSnapshot?: WorkflowSnapshot,

) {
  return Effect.gen(function* () {
    const galaxyInvocation = yield* bt.invokeWorkflowEffect(
      galaxyHistoryId,
      galaxyWorkflowId,
      inputs,
      parameters,
    )

    const results: {
      id: undefined | number
      inputIds: number[] | undefined

    } = {
      id: undefined,
      inputIds: undefined,

    }
    const invocation = yield* bt.getInvocationEffect(galaxyInvocation.id)
    const newAnalysis = {
      name: analysisName,
      historyId,
      workflowId,
      state: galaxyInvocation.state,
      galaxyId: galaxyInvocation.id,
      ownerId,
      parameters,
      datamap,
      invocation,
    }
    // no guard on the insert: `insertAnalysis` takes its row with
    // `takeExactlyOne`, so a zero-row insert is refused there (#31) and the
    // `if (insertedAnalysis)` that used to wrap this block was unreachable
    const { insertedId: insertedAnalysisId } = yield* insertAnalysis(newAnalysis, workflowSnapshot)
    results.id = insertedAnalysisId
    const analysisInputs = yield* Effect.all(
      Object.entries(inputs).map(([_step, { dbid, id: galaxyDatasetId }]) => {
        return Effect.gen(function* () {
          if (dbid) {
            const dataset = yield* bt.getDatasetEffect(galaxyDatasetId, galaxyHistoryId)
            return yield* insertAnalysisInputEffect(
              insertedAnalysisId,
              dbid,
              dataset.state,
            )
          }
        })
      }),
    )
    results.inputIds = analysisInputs
      .filter(input => input !== undefined && input !== null)
      .map(({ id }) => id)
    return results
  })
}

export class DeleteAnalysisError extends Data.TaggedError('DeleteAnalysisError')<{
  readonly message: string
}> { }
export function deleteAnalysis(
  analysisId: number,
  ownerId: string,
) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    const { finalizedRow, deleted } = yield* getHistoryAnalysis(analysisId, ownerId).pipe(
      Effect.flatMap((historyAnalysis) => {
        if (historyAnalysis) {
          return bt.deleteHistoryEffect(historyAnalysis.histories.galaxyId)
            .pipe(Effect.flatMap(() => Effect.tryPromise({
              try: () => useDrizzle.transaction(async (tx) => {
                // First finalize a stranded `pending` monitoring row to
                // `cancelled` while `analysis_id` is still set (D-08: the
                // `ON DELETE SET NULL` FK would null it after the delete), then
                // delete the analysis row — both atomically on this `tx` (D-07).
                const finalizedRow = await finalizeAnalysisMonitoringEffect(
                  analysisId,
                  ownerId,
                  tx,
                ).pipe(Effect.runPromise)
                const deleted = await tx
                  .delete(analyses)
                  .where(and(eq(analyses.id, analysisId), eq(analyses.ownerId, ownerId)))
                  .returning()
                return { finalizedRow, deleted }
              }),
              catch: error => new DeleteAnalysisError({ message: `Error deleting analysis: ${error}` }),
            })))
        }
        return Effect.fail(new DeleteAnalysisError({ message: `Error deleting analysis: Analysis not found` }))
      }),
    )
    // Emit from the deleteAnalysis Effect scope (under runGalaxyEffect's evlog
    // layers), symmetric with the sync task's 'monitoring outcome updated', only
    // when a row was actually finalised (D-09: a no-op stays silent).
    if (finalizedRow) {
      yield* Effect.logInfo('monitoring outcome finalized', { analysisId, ownerId, outcome: 'cancelled' })
    }
    return deleted
  })
}

export class InsertAnalysisError extends Data.TaggedError('InsertAnalysisError')<{
  readonly message: string
}> { }

export function insertAnalysis(analysis: NewAnalysis, workflowSnapshot?: WorkflowSnapshot) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle.transaction(async (tx) => {
        const inserted = await tx
          .insert(analyses)
          .values(analysis)
          .returning({ insertedId: analyses.id })
          .then(takeExactlyOne)
        // Delegate the monitoring insert to the canonical helper, running it on
        // the passed `tx` (D-03/D-04). The helper is an Effect that yields
        // `Drizzle`; provide that service with the same `tx` client so it never
        // opens a separate connection — keeping both writes atomic in this
        // transaction. (The provided service is inert: the helper uses `tx`
        // directly, so D-04 holds.)
        await insertAnalysisMonitoringEffect(
          inserted.insertedId,
          analysis.ownerId,
          analysis.workflowId,
          analysis.name,
          analysis.galaxyId,
          workflowSnapshot,
          tx,
        ).pipe(
          Effect.provideService(Drizzle, tx as unknown as Context.Tag.Service<typeof Drizzle>),
          Effect.runPromise,
        )
        return inserted
      }),
      catch: error => new InsertAnalysisError({ message: `Error inserting analysis: ${error}` }),
    })
  })
}

export class GetAnalysisError extends Data.TaggedError('GetAnalysisError')<{
  readonly message: string
}> { }

export function getAnalysis(analysisId: number, ownerId: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .select()
        .from(analyses)
        .where(and(eq(analyses.id, analysisId), eq(analyses.ownerId, ownerId)))
        .then(takeUniqueOrNull),
      catch: error => new GetAnalysisError({ message: `Error getting analysis: ${error}` }),
    })
  })
}

export function updateAnalysisState(analysisId: number, invocation: GalaxyInvocation, ownerId: string) {
  return Effect.gen(function* () {
    const drizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => drizzle
        .update(analyses)
        .set({ state: invocation.state, invocation })
        .where(
          and(
            eq(analyses.id, analysisId),
            eq(analyses.ownerId, ownerId),
          ),
        ),
      catch: error => new GetAnalysisError({ message: `Error updating analysis state: ${error}` }),
    })
  })
}

export class UpdateAnalysisIsSyncError extends Data.TaggedError('UpdateAnalysisIsSyncError')<{
  readonly message: string
}> { }

export function updateAnalysisIsSync(isSync: boolean, analysisId: number, ownerId: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .update(analyses)
        .set({ isSync })
        .where(and(eq(analyses.id, analysisId), eq(analyses.ownerId, ownerId)))
        .returning({ updatedState: analyses.state })
        .then(takeUniqueOrNull),
      catch: error => new UpdateAnalysisIsSyncError({ message: `Error updating analysis state: ${error}` }),
    })
  })
}

export function getAllAnalyses(ownerId: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => {
        return useDrizzle
          .select()
          .from(analyses)
          .where(eq(analyses.ownerId, ownerId))
      },
      catch: error => new GetAnalysisError({ message: `Error getting all analyses: ${error}` }),
    })
  })
}

export function getWorkflowAnalyses(workflowId: number, ownerId: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .select()
        .from(analyses)
        .where(
          and(
            eq(analyses.workflowId, workflowId),
            eq(analyses.ownerId, ownerId),
          ),
        ),
      catch: error => new GetAnalysisError({ message: `Error getting workflow analyses: ${error}` }),
    })
  })
}

export class GetHistoryAnalysisError extends Data.TaggedError('GetHistoryAnalysisError')<{
  readonly message: string
}> { }

export function getHistoryAnalysis(analysisId: number, ownerId: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .select()
        .from(analyses)
        .innerJoin(histories, eq(histories.id, analyses.historyId))
        .where(
          and(
            eq(analyses.id, analysisId),
            eq(analyses.ownerId, ownerId),
          ),
        )
        .then(takeUniqueOrNull),
      catch: error => new GetHistoryAnalysisError({ message: `Error getting history analysis: ${error}` }),
    })
  })
}
