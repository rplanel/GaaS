import type { DatasetState } from 'blendtype'
import type { EventHandlerRequest, H3Event } from 'h3'
import type { Database } from '../../../../types/database'
import { createError } from '#imports'
import { serverSupabaseClient } from '#supabase/server'
import { downloadDataset, downloadDatasetEffect, getDataset, getDatasetEffect } from 'blendtype'
import { and, eq } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { analysisInputs } from '../../../db/schema/galaxy/analysisInputs'
import { datasets } from '../../../db/schema/galaxy/datasets'
import { histories } from '../../../db/schema/galaxy/histories'
import { useDrizzle } from '../../drizzle'
import { insertDatasetEffect, isDatasetTerminalState } from '../datasets'
import { takeUniqueOrThrow } from '../helper'
import { getHistoryDb } from '../histories'
import { uploadFileToStorage } from '../supabase'

// eslint-disable-next-line unicorn/throw-new-error
export class GetAnalysisInputError extends Data.TaggedError('GetAnalysisInputError')<{
  readonly message: string
}> {}

export function getAnalysisInputDataset(galaxyDatasetId: string, historyId: number, ownerId: string) {
  return Effect.tryPromise({
    try: () => useDrizzle()
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
  })
}

export function getOrCreateInputDatasetEffect(galaxyDatasetId: string, analysisId: number, historyId: number, event: H3Event<EventHandlerRequest>, ownerId: string) {
  return Effect.gen(function* () {
    const datasetDb = yield* getAnalysisInputDataset(galaxyDatasetId, historyId, ownerId)
    if (datasetDb)
      return datasetDb.analysis_inputs

    const historyDb = yield* getHistoryDb(historyId, ownerId)
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
  return Effect.tryPromise({
    try: () => useDrizzle().insert(analysisInputs).values({
      analysisId,
      datasetId,
      state,
    }).returning().onConflictDoNothing().then(takeUniqueOrThrow),
    catch: error => new InsertAnalysisInputError({ message: `Error inserting analysis input: ${error}` }),
  })
}

export async function getOrCreateInputDataset(
  galaxyDatasetId: string,
  analysisId: number,
  historyId: number,
  event: H3Event<EventHandlerRequest>,
  ownerId: string,
): Promise<{
  id: number
  state: any
  datasetId: number
  analysisId: number
} | undefined> {
  // check if dataset exists
  const datasetDb = await useDrizzle()
    .select()
    .from(datasets)
    .innerJoin(analysisInputs, eq(datasets.id, analysisInputs.datasetId))
    .where(and(
      eq(datasets.galaxyId, galaxyDatasetId),
      eq(datasets.historyId, historyId),
      eq(datasets.ownerId, ownerId),
    ))
    .then(takeUniqueOrThrow)
  if (datasetDb)
    return datasetDb.analysis_inputs

  const historyDb = await useDrizzle()
    .select()
    .from(histories)
    .where(and(
      eq(histories.id, historyId),
      eq(histories.ownerId, ownerId),
    ))
    .then(takeUniqueOrThrow)
  const galaxyDataset = await getDataset(galaxyDatasetId, historyDb.galaxyId)
  const isDatasetTerminal = isDatasetTerminalState(galaxyDataset.state)
  if (isDatasetTerminal) {
    const datasetBlob = await downloadDataset(
      historyDb.galaxyId,
      galaxyDatasetId,
    )
    if (datasetBlob) {
      const supabase = await serverSupabaseClient<Database>(event)
      const { data, error } = await supabase.storage
        .from('analysis_files')
        .upload(`${crypto.randomUUID()}/${galaxyDataset.name}`, datasetBlob)
      if (error) {
        throw createError({ statusCode: 500, statusMessage: error.message })
      }
      if (data) {
        return useDrizzle()
          .insert(datasets)
          .values({
            galaxyId: galaxyDatasetId,
            datasetName: galaxyDataset.name,
            ownerId,
            storageObjectId: data.id,
            historyId,
            uuid: galaxyDataset.uuid,
            dataLines: galaxyDataset.metadata_comment_lines || 0,
            extension: galaxyDataset.extension,
            // fileSize: galaxyDataset.file_size,
          })
          .onConflictDoNothing()
          .returning()
          .then(takeUniqueOrThrow)
          .then((datasetDb) => {
            if (datasetDb) {
              return useDrizzle()
                .insert(analysisInputs)
                .values({
                  analysisId,
                  datasetId: datasetDb.id,
                  state: galaxyDataset.state,
                })
                .returning()
                .onConflictDoNothing()
                .then(takeUniqueOrThrow)
            }
          })
      }
    }
  }
}

export function synchronizeInputDatasetEffect(
  galaxyDatasetId: string,
  analysisId: number,
  historyId: number,
  event: H3Event<EventHandlerRequest>,
  ownerId: string,
) {
  return Effect.gen(function* () {
    const datasetDb = yield* getOrCreateInputDatasetEffect(galaxyDatasetId, analysisId, historyId, event, ownerId)
    if (datasetDb) {
      const isSync = yield* isInputDatasetSyncEffect(galaxyDatasetId, ownerId)
      if (isSync) {
        return
      }
      const isTerminal = isDatasetTerminalState(datasetDb.state)
      if (!isTerminal) {
        const historyDb = yield* getHistoryDb(historyId, ownerId)
        const galaxyDataset = yield* getDatasetEffect(galaxyDatasetId, historyDb.galaxyId)
        if (datasetDb.state !== galaxyDataset.state) {
          yield* updateAnalysisInputStateEffect(galaxyDataset.state, galaxyDatasetId, ownerId)
        }
      }
    }
  })
}

export async function synchronizeInputDataset(
  galaxyDatasetId: string,
  analysisId: number,
  historyId: number,
  event: H3Event<EventHandlerRequest>,
  ownerId: string,
): Promise<void> {
  const datasetDb = await getOrCreateInputDataset(galaxyDatasetId, analysisId, historyId, event, ownerId)
  if (datasetDb) {
    const isSync = await isInputDatasetSync(galaxyDatasetId, ownerId)
    if (isSync)
      return
    const isTerminal = isDatasetTerminalState(datasetDb.state)
    if (!isTerminal) {
      const historyDb = await useDrizzle()
        .select()
        .from(histories)
        .where(and(
          eq(histories.id, historyId),
          eq(histories.ownerId, ownerId),
        ))
        .then(takeUniqueOrThrow)
      const galaxyDataset = await getDataset(galaxyDatasetId, historyDb.galaxyId)
      if (datasetDb.state !== galaxyDataset.state) {
        await useDrizzle()
          .update(analysisInputs)
          .set({ state: galaxyDataset.state })
          .where(eq(analysisInputs.id, datasetDb.id))
          .returning({ updatedId: analysisInputs.id })
          .then(takeUniqueOrThrow)
      }
    }
  }
}

// eslint-disable-next-line unicorn/throw-new-error
export class GetAnalysisInputStateError extends Data.TaggedError('GetAnalysisInputStateError')<{
  readonly message: string
}> {}

export function getAnalysisInputState(galaxyDatasetId: string, ownerId: string) {
  return Effect.tryPromise({
    try: () => useDrizzle()
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
    Effect.map(({ state }) => state),
  )
}

// eslint-disable-next-line unicorn/throw-new-error
export class UpdateAnalysisInputStateError extends Data.TaggedError('UpdateAnalysisInputStateError')<{
  readonly message: string
}> {}

export function updateAnalysisInputStateEffect(state: DatasetState, galaxyDatasetId: string, ownerId: string) {
  return Effect.tryPromise({
    try: () => useDrizzle()
      .update(analysisInputs)
      .set({ state })
      .where(
        and(
          eq(datasets.galaxyId, galaxyDatasetId),
          eq(datasets.ownerId, ownerId),
        ),
      )
      .returning({ updatedId: analysisInputs.id })
      .then(takeUniqueOrThrow),
    catch: error => new UpdateAnalysisInputStateError({ message: `Error updating dataset: ${error}` }),
  })
}

export function isInputDatasetSyncEffect(galaxyDatasetId: string, ownerId: string) {
  return Effect.gen(function* () {
    const state = yield* getAnalysisInputState(galaxyDatasetId, ownerId)
    return state ? isDatasetTerminalState(state) : false
  })
}

export async function isInputDatasetSync(galaxyDatasetId: string, ownerId: string): Promise<boolean> {
  const datasetDb = await useDrizzle()
    .select({ state: analysisInputs.state })
    .from(analysisInputs)
    .innerJoin(datasets, eq(datasets.id, analysisInputs.datasetId))
    .where(
      and(
        eq(datasets.galaxyId, galaxyDatasetId),
        eq(datasets.ownerId, ownerId),
      ),
    )
    .then(takeUniqueOrThrow)
  return datasetDb?.state ? isDatasetTerminalState(datasetDb.state) : false
}
