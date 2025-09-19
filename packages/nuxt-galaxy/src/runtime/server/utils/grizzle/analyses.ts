import type { Datamap, GalaxyInvocation, GalaxyInvocationIO, GalaxyWorkflowInput, GalaxyWorkflowParameters, InvocationState, InvocationTerminalState } from 'blendtype'
import type { EventHandlerRequest, H3Event } from 'h3'
import type { NewAnalysis } from '~/src/runtime/types/nuxt-galaxy'
import * as bt from 'blendtype'
import { and, eq } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { analyses } from '../../db/schema/galaxy/analyses'
import { histories } from '../../db/schema/galaxy/histories'
import { Drizzle } from '../drizzle'
import { insertAnalysisInputEffect } from './datasets/input'
import { takeUniqueOrThrow } from './helper'
import { isHistorySyncEffect, synchronizeHistoryEffect } from './histories'
import { synchronizeJobEffect } from './jobs'

export function isAnalysisTerminalState(state: InvocationState): boolean {
  return bt.InvocationTerminalStates.includes(state as InvocationTerminalState)
}

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

) {
  return Effect.gen(function* () {
    const galaxyInvocation = yield* bt.invokeWorkflowEffect (
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
    const insertedAnalysis = yield* insertAnalysis(newAnalysis)
    if (insertedAnalysis) {
      const { insertedId: insertedAnalysisId } = insertedAnalysis
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
    }
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
    return yield* getHistoryAnalysis(analysisId, ownerId).pipe(
      Effect.flatMap((historyAnalysis) => {
        if (historyAnalysis) {
          return bt.deleteHistoryEffect(historyAnalysis.histories.galaxyId)
            .pipe(Effect.flatMap(() => Effect.tryPromise({
              try: () => useDrizzle
                .delete(analyses)
                .where(and(eq(analyses.id, analysisId), eq(analyses.ownerId, ownerId)))
                .returning(),
              catch: error => new DeleteAnalysisError({ message: `Error deleting analysis: ${error}` }),
            })))
        }
        return Effect.fail(new DeleteAnalysisError({ message: `Error deleting analysis: Analysis not found` }))
      }),
    )
  })
}

export class InsertAnalysisError extends Data.TaggedError('InsertAnalysisError')<{
  readonly message: string
}> { }

export function insertAnalysis(analysis: NewAnalysis) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .insert(analyses)
        .values(analysis)
        .returning({
          insertedId: analyses.id,
        })
        .then(takeUniqueOrThrow),
      catch: error => new InsertAnalysisError({ message: `Error inserting analysis: ${error}` }),
    })
  })
}
export function getInvocationOutputs(analysisId: number, ownerId: string) {
  return Effect.gen(function* () {
    const invocationDb = yield* getAnalysis(analysisId, ownerId)
    if (!invocationDb) {
      return
    }
    const analysisInvocationDb = invocationDb.invocation as GalaxyInvocation
    if (analysisInvocationDb?.outputs) {
      const outputDatasetsExpected = Object.values(analysisInvocationDb.outputs) as GalaxyInvocationIO[]
      const stepToJob = new Map(analysisInvocationDb.steps.map(s => ([s.workflow_step_id, { jobId: s.job_id, stepId: s.order_index }])))
      const jobsWithOutputs = outputDatasetsExpected.reduce((acc, curr) => {
        const jobInfo = stepToJob.get(curr.workflow_step_id)
        if (jobInfo?.jobId) {
          const { jobId, stepId } = jobInfo
          if (!acc?.[jobId]) {
            acc[jobId] = { galaxyDatasetIds: [curr.id], galaxyJobId: jobId, stepId }
          }
          else {
            const jobIdFromAcc = acc?.[jobId]
            if (jobIdFromAcc !== undefined)
              jobIdFromAcc.galaxyDatasetIds.push(curr.id)
          }
        }
        return acc
      }, {} as Record<string, { galaxyDatasetIds: string[], galaxyJobId: string, stepId: number }>)
      return jobsWithOutputs
    }
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
        .then(takeUniqueOrThrow),
      catch: error => new GetAnalysisError({ message: `Error getting analysis: ${error}` }),
    })
  })
}

export function synchronizeJobsEffect(analysisId: number, historyId: number, ownerId: string, event: H3Event<EventHandlerRequest>) {
  return Effect.gen(function* () {
    const invocationOutputs = yield* getInvocationOutputs(analysisId, ownerId)
    if (invocationOutputs) {
      return yield* Effect.all(
        Object
          .entries(invocationOutputs)
          .map(([galaxyJobId, { galaxyDatasetIds, stepId }]) => {
            return synchronizeJobEffect(
              galaxyJobId,
              stepId,
              analysisId,
              historyId,
              galaxyDatasetIds,
              ownerId,
              event,
            )
          }),
      )
    }
  })
}

export function synchronizeAnalysisEffect(
  analysisId: number,
  ownerId: string,
  event: H3Event<EventHandlerRequest>,
) {
  return Effect.gen(function* () {
    const invocationDb = yield* getHistoryAnalysis(analysisId, ownerId)

    if (!invocationDb || invocationDb.analyses.isSync) {
      return
    }
    yield* synchronizeHistoryEffect(invocationDb.histories.id, ownerId, event)
    const galaxyInvocationId = invocationDb.analyses.galaxyId
    const invocation = yield* bt.getInvocationEffect(galaxyInvocationId)

    if (!isAnalysisTerminalState(invocationDb.analyses.state)) {
      if (invocation.state !== invocationDb.analyses.state) {
        yield* updateAnalysisState(analysisId, invocation, ownerId)
      }
    }
    else {
      const isSync = yield* isHistorySyncEffect(invocationDb.histories.id, analysisId, ownerId)
      if (isSync) {
        yield* updateAnalysisIsSync(isSync, analysisId, ownerId)
      }
    }
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
        .then(takeUniqueOrThrow),
      catch: error => new UpdateAnalysisIsSyncError({ message: `Error updating analysis state: ${error}` }),
    })
  })
}

export function synchronizeAnalysesEffect(event: H3Event<EventHandlerRequest>, ownerId: string) {
  return Effect.gen(function* () {
    const analysesDb = yield* getAllAnalyses(ownerId)
    return yield* Effect.all(
      analysesDb.map(({ id: analysisId }) => {
        return synchronizeAnalysisEffect(analysisId, ownerId, event)
      }),
    )
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
        .then(takeUniqueOrThrow),
      catch: error => new GetHistoryAnalysisError({ message: `Error getting history analysis: ${error}` }),
    })
  })
}
