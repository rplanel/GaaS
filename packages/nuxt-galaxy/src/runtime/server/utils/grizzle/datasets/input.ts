import type { DatasetState } from 'blendtype'
import type { EventHandlerRequest, H3Event } from 'h3'
import { downloadDatasetEffect, getDatasetEffect } from 'blendtype'
import { and, eq } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { analysisInputs } from '../../../db/schema/galaxy/analysisInputs'
import { datasets } from '../../../db/schema/galaxy/datasets'
import { Drizzle } from '../../drizzle'
import { insertDatasetEffect, isDatasetTerminalState } from '../datasets'
import { takeUniqueOrThrow } from '../helper'
import { getHistoryDb } from '../histories'
import { uploadFileToStorage } from '../supabase'

// eslint-disable-next-line unicorn/throw-new-error
export class GetAnalysisInputError extends Data.TaggedError('GetAnalysisInputError')<{
  readonly message: string
}> {}

export function getAllAnalysisInputDatasets(analysisId: number, ownerId: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .select()
        .from(analysisInputs)
        .innerJoin(datasets, eq(datasets.id, analysisInputs.datasetId))
        .where(
          and(
            eq(analysisInputs.analysisId, analysisId),
            eq(datasets.ownerId, ownerId),
          ),
        ),
      catch: error => new GetAnalysisInputError({ message: `Error getting datasets: ${error}` }),
    })
  })
}
export function getAnalysisInputDataset(galaxyDatasetId: string, historyId: number, ownerId: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .select()
        .from(datasets)
        .innerJoin(analysisInputs, eq(datasets.id, analysisInputs.datasetId))
        .where(and(
          eq(datasets.galaxyId, galaxyDatasetId),
          eq(datasets.historyId, historyId),
          eq(datasets.ownerId, ownerId),
        ))
        .then(takeUniqueOrThrow),
      catch: error => new GetAnalysisInputError({ message: `Error getting dataset:  ${error}` }),
    },
    )
  })
}

export function getOrCreateInputDatasetEffect(galaxyDatasetId: string, analysisId: number, historyId: number, event: H3Event<EventHandlerRequest>, ownerId: string) {
  return Effect.gen(function* () {
    const datasetDb = yield* getAnalysisInputDataset(galaxyDatasetId, historyId, ownerId)
    if (datasetDb)
      return datasetDb.analysis_inputs

    const historyDb = yield* getHistoryDb(historyId, ownerId)
    if (!historyDb) {
      return
    }
    const galaxyDataset = yield* getDatasetEffect(galaxyDatasetId, historyDb.galaxyId)
    const isDatasetTerminal = isDatasetTerminalState(galaxyDataset.state)
    if (isDatasetTerminal) {
      const datasetBlob = yield* downloadDatasetEffect(historyDb.galaxyId, galaxyDatasetId)
      if (datasetBlob) {
        const data = yield* uploadFileToStorage(event, galaxyDataset.name, datasetBlob)
        if (data) {
          const insertedDataset = yield* insertDatasetEffect({
            galaxyId: galaxyDatasetId,
            datasetName: galaxyDataset.name,
            ownerId,
            storageObjectId: data.id,
            historyId,
            uuid: galaxyDataset.uuid,
            dataLines: galaxyDataset.metadata_comment_lines || 0,
            extension: galaxyDataset.extension,
          })
          if (insertedDataset) {
            return yield* insertAnalysisInputEffect(analysisId, insertedDataset.id, galaxyDataset.state)
          }
        }
      }
    }
  })
}

// eslint-disable-next-line unicorn/throw-new-error
export class InsertAnalysisInputError extends Data.TaggedError('InsertAnalysisInputError')<{
  readonly message: string

}> {}

export function insertAnalysisInputEffect(analysisId: number, datasetId: number, state: DatasetState) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .insert(analysisInputs)
        .values({
          analysisId,
          datasetId,
          state,
        })
        .returning()
        .onConflictDoNothing()
        .then(takeUniqueOrThrow),
      catch: error => new InsertAnalysisInputError({ message: `Error inserting analysis input: ${error}` }),
    })
  })
}

export function synchronizeInputDatasetEffect(
  galaxyDatasetId: string,
  analysisId: number,
  historyId: number,
  event: H3Event<EventHandlerRequest>,
  ownerId: string,
) {
  return Effect.gen(function* () {
    const inputDatasetDb = yield* getOrCreateInputDatasetEffect(
      galaxyDatasetId,
      analysisId,
      historyId,
      event,
      ownerId,
    )
    if (inputDatasetDb) {
      const isSync = yield* isInputDatasetSyncEffect(galaxyDatasetId, ownerId)
      if (isSync) {
        return
      }
      const isTerminal = isDatasetTerminalState(inputDatasetDb.state)
      if (!isTerminal) {
        const historyDb = yield* getHistoryDb(historyId, ownerId)
        if (!historyDb) {
          return
        }
        const galaxyDataset = yield* getDatasetEffect(galaxyDatasetId, historyDb.galaxyId)
        if (inputDatasetDb.state !== galaxyDataset.state) {
          yield* updateAnalysisInputStateEffect(galaxyDataset.state, inputDatasetDb.id)
        }
      }
    }
  })
}

// eslint-disable-next-line unicorn/throw-new-error
export class GetAnalysisInputStateError extends Data.TaggedError('GetAnalysisInputStateError')<{
  readonly message: string
}> {}

export function getAnalysisInputState(galaxyDatasetId: string, ownerId: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .select({ state: analysisInputs.state })
        .from(analysisInputs)
        .innerJoin(datasets, eq(datasets.id, analysisInputs.datasetId))
        .where(
          and(
            eq(datasets.galaxyId, galaxyDatasetId),
            eq(datasets.ownerId, ownerId),
          ),
        )
        .then(takeUniqueOrThrow),
      catch: error => new GetAnalysisInputStateError({ message: `Error getting dataset: ${error}` }),
    }).pipe(
      Effect.map(d => d?.state),
    )
  })
}

// eslint-disable-next-line unicorn/throw-new-error
export class UpdateAnalysisInputStateError extends Data.TaggedError('UpdateAnalysisInputStateError')<{
  readonly message: string
}> {}

export function updateAnalysisInputStateEffect(state: DatasetState, datasetDbId: number) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return Effect.tryPromise({
      try: () => useDrizzle
        .update(analysisInputs)
        .set({ state })
        .where(
          and(
            eq(analysisInputs.id, datasetDbId),
          ),
        )
        .returning({ updatedId: analysisInputs.id, state: analysisInputs.state })
        .then(takeUniqueOrThrow),
      catch: (error) => {
        return new UpdateAnalysisInputStateError({ message: `Error updating dataset: ${error}` })
      },
    })
  })
}

export function isInputDatasetSyncEffect(galaxyDatasetId: string, ownerId: string) {
  return Effect.gen(function* () {
    const state = yield* getAnalysisInputState(galaxyDatasetId, ownerId)
    return state ? isDatasetTerminalState(state) : false
  })
}
