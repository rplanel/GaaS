import type { DatasetState } from 'blendtype'
import type { EventHandlerRequest, H3Event } from 'h3'
import type { Database } from '../../../../types/database'

import type { GetTag } from '~/src/runtime/types/nuxt-galaxy'
import { createError } from '#imports'
import { serverSupabaseClient } from '#supabase/server'
import { downloadDataset, downloadDatasetEffect, getDataset, getDatasetEffect } from 'blendtype'
import { and, eq, sql } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { analysisOutputs, analysisOutputsToTags } from '../../../db/schema/galaxy/analysisOutputs'
import { datasets } from '../../../db/schema/galaxy/datasets'
import { histories } from '../../../db/schema/galaxy/histories'
import { tags } from '../../../db/schema/galaxy/tags'
import { useDrizzle } from '../../drizzle'
import { insertDatasetEffect, isDatasetTerminalState } from '../datasets'
import { takeUniqueOrThrow } from '../helper'
import { getHistoryDb } from '../histories'
import { uploadFileToStorage } from '../supabase'
import { insertTags } from '../tags'

export function synchronizeOuputDatasetEffect(galaxyDatasetId: string, analysisId: number, historyId: number, jobId: number, event: H3Event<EventHandlerRequest>, ownerId: string) {
  return Effect.gen(function* () {
    const datasetDb = yield* getOrCreateOutputDatasetEffect(galaxyDatasetId, analysisId, historyId, jobId, event, ownerId)
    if (datasetDb) {
      const isSync = yield* isOutputDatasetSyncEffect(galaxyDatasetId, jobId, ownerId)
      if (isSync) {
        return
      }
      const isTerminal = isDatasetTerminalState(datasetDb.state)
      if (!isTerminal) {
        const historyDb = yield* getHistoryDb(historyId, ownerId)
        const galaxyDataset = yield* getDatasetEffect(galaxyDatasetId, historyDb.galaxyId)
        if (datasetDb.state !== galaxyDataset.state) {
          yield* updateAnalysisOuputStateEffect(galaxyDataset.state, galaxyDatasetId, ownerId)
        }
      }
    }
  })
}

export async function synchronizeOutputDataset(
  galaxyDatasetId: string,
  analysisId: number,
  historyId: number,
  jobId: number,
  event: H3Event<EventHandlerRequest>,
  ownerId: string,
): Promise<void> {
  const datasetDb = await getOrCreateOutputDataset(galaxyDatasetId, analysisId, historyId, jobId, event, ownerId)
  if (datasetDb) {
    const isSync = await isOutputDatasetSync(galaxyDatasetId, jobId, ownerId)
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
          .update(analysisOutputs)
          .set({ state: galaxyDataset.state })
          .where(eq(analysisOutputs.id, datasetDb.id))
          .returning({ updatedId: analysisOutputs.id })
          .then(takeUniqueOrThrow)
      }
    }
  }
}

// eslint-disable-next-line unicorn/throw-new-error
export class GetAnalysisOutputError extends Data.TaggedError('GetAnalysisOutputError')<{
  readonly message: string
}> {}

export function getAnalysisOutputDataset(galaxyDatasetId: string, historyId: number, ownerId: string) {
  return Effect.tryPromise({
    try: () => useDrizzle()
      .select()
      .from(datasets)
      .innerJoin(analysisOutputs, eq(datasets.id, analysisOutputs.datasetId))
      .where(and(
        eq(datasets.galaxyId, galaxyDatasetId),
        eq(datasets.historyId, historyId),
        eq(datasets.ownerId, ownerId),
      ))
      .then(takeUniqueOrThrow),
    catch: error => new GetAnalysisOutputError({ message: `Error getting dataset:  ${error}` }),
  })
}

export function getOrCreateOutputDatasetEffect(
  galaxyDatasetId: string,
  analysisId: number,
  historyId: number,
  jobId: number,
  event: H3Event<EventHandlerRequest>,
  ownerId: string,
) {
  return Effect.gen(function* () {
    const datasetDb = yield* getAnalysisOutputDataset(galaxyDatasetId, historyId, ownerId)
    if (datasetDb) {
      return datasetDb.analysis_outputs
    }
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
            const instertedOutputs = yield* insertAnalysisOutputEffect(analysisId, insertedDataset.id, jobId, galaxyDataset.state)
            if (instertedOutputs) {
              const insertedTags = yield* insertTags(galaxyDataset.tags)
              yield* insertAnalysisOutputTags(insertedTags, insertedDataset.id)
            }
          }
        }
      }
    }
  })
}

// eslint-disable-next-line unicorn/throw-new-error
export class InsertAnalysisOutputTagsError extends Data.TaggedError('InsertAnalysisOutputTagsError')<{
  readonly message: string
}> {}

export function insertAnalysisOutputTags(datasetTags: GetTag[], analysisOutputId: number) {
  return Effect.tryPromise({
    try: () => useDrizzle()
      .insert(analysisOutputsToTags)
      .values(datasetTags.map(tagDb => ({
        tagId: tagDb.id,
        analysisOutputId,
      }))),
    catch: error => new InsertAnalysisOutputTagsError({ message: `Error inserting analysis Output tags: ${error}` }),
  })
}
// eslint-disable-next-line unicorn/throw-new-error
export class InsertAnalysisOutputError extends Data.TaggedError('InsertAnalysisOutputError')<{
  readonly message: string

}> {}

export function insertAnalysisOutputEffect(analysisId: number, datasetId: number, jobId: number, state: DatasetState) {
  return Effect.tryPromise({
    try: () => useDrizzle().insert(analysisOutputs).values({
      analysisId,
      datasetId,
      jobId,
      state,
    }).returning().onConflictDoNothing().then(takeUniqueOrThrow),
    catch: error => new InsertAnalysisOutputError({ message: `Error inserting analysis Output: ${error}` }),
  })
}

export async function getOrCreateOutputDataset(
  galaxyDatasetId: string,
  analysisId: number,
  historyId: number,
  jobId: number,
  event: H3Event<EventHandlerRequest>,
  ownerId: string,
): Promise<{
  id: number
  state: any
  datasetId: number
  analysisId: number
  jobId: number
} | undefined> {
  // check if dataset exists
  const datasetDb = await useDrizzle()
    .select()
    .from(datasets)
    .innerJoin(analysisOutputs, eq(datasets.id, analysisOutputs.datasetId))
    .where(and(
      eq(datasets.galaxyId, galaxyDatasetId),
      eq(datasets.historyId, historyId),
      eq(datasets.ownerId, ownerId),
    ))
    .then(takeUniqueOrThrow)
  if (datasetDb)
    return datasetDb.analysis_outputs

  // get the galaxy client
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
                .insert(analysisOutputs)
                .values({
                  analysisId,
                  datasetId: datasetDb.id,
                  jobId,
                  state: galaxyDataset.state,
                })
                .returning()
                .onConflictDoNothing()
                .then(takeUniqueOrThrow)
            }
          })
          .then((analysisOutputDb) => {
            if (analysisOutputDb) {
              return useDrizzle()
                .insert(tags)
                .values(galaxyDataset.tags.map(label => ({ label })))
                .onConflictDoUpdate({ target: tags.label, set: { label: sql`excluded.label` } })
                .returning()
                .then((tagsDb) => {
                  return useDrizzle()
                    .insert(analysisOutputsToTags)
                    .values(tagsDb.map(tagDb => ({ tagId: tagDb.id, analysisOutputId: analysisOutputDb.id })))
                })
                .then(() => {
                  return analysisOutputDb
                })
            }
          })
      }
    }
  }
}

// eslint-disable-next-line unicorn/throw-new-error
export class GetAnalysisOutputStateError extends Data.TaggedError('GetAnalysisOutputStateError')<{
  readonly message: string
}> {}

/**
 *
 * @param galaxyDatasetId
 * @param jobId
 * @param ownerId
 * @returns Effect.Effect<"ok" | "empty" | "error" | "discarded" | "failed_metadata" | "new" | "upload" | "queued" | "running" | "paused" | "setting_metadata" | "deferred", GetAnalysisOutputStateError, never>
 */
export function getAnalysisOutputState(galaxyDatasetId: string, jobId: number, ownerId: string) {
  return Effect.tryPromise({
    try: () => useDrizzle()
      .select({ state: analysisOutputs.state })
      .from(analysisOutputs)
      .innerJoin(datasets, eq(datasets.id, analysisOutputs.datasetId))
      .where(
        and(
          eq(datasets.galaxyId, galaxyDatasetId),
          eq(datasets.ownerId, ownerId),
          eq(analysisOutputs.jobId, jobId),
        ),
      )
      .then(takeUniqueOrThrow),
    catch: e => new GetAnalysisOutputStateError({ message: `Failed to get analysis output state: ${e}` }),
  }).pipe(
    Effect.map(({ state }) => state),
  )
}

export function isOutputDatasetSyncEffect(galaxyDatasetId: string, jobId: number, ownerId: string) {
  return Effect.gen(function* () {
    const state = yield* getAnalysisOutputState(galaxyDatasetId, jobId, ownerId)
    return state ? isDatasetTerminalState(state) : false
  })
}
export async function isOutputDatasetSync(galaxyDatasetId: string, jobId: number, ownerId: string): Promise<boolean> {
  const datasetDb = await useDrizzle()
    .select({ state: analysisOutputs.state })
    .from(analysisOutputs)
    .innerJoin(datasets, eq(datasets.id, analysisOutputs.datasetId))
    .where(
      and(
        eq(datasets.galaxyId, galaxyDatasetId),
        eq(datasets.ownerId, ownerId),
        eq(analysisOutputs.jobId, jobId),
      ),
    )
    .then(takeUniqueOrThrow)
  return datasetDb?.state ? isDatasetTerminalState(datasetDb.state) : false
}

// eslint-disable-next-line unicorn/throw-new-error
export class UpdateAnalysisOuputStateError extends Data.TaggedError('UpdateAnalysisOuputStateError')<{
  readonly message: string
}> {}

export function updateAnalysisOuputStateEffect(state: DatasetState, galaxyDatasetId: string, ownerId: string) {
  return Effect.tryPromise({
    try: () => useDrizzle()
      .update(analysisOutputs)
      .set({ state })
      .where(
        and(
          eq(datasets.galaxyId, galaxyDatasetId),
          eq(datasets.ownerId, ownerId),
        ),
      )
      .returning({ updatedId: analysisOutputs.id })
      .then(takeUniqueOrThrow),
    catch: error => new UpdateAnalysisOuputStateError({ message: `Error updating dataset: ${error}` }),
  })
}
