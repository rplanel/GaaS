import type { serverSupabaseClient } from '#supabase/server'
import { createError } from '#imports'
import { downloadDataset, getDataset } from 'blendtype'
import { and, eq } from 'drizzle-orm'
import { analysisInputs } from '../../../db/schema/galaxy/analysisInputs'
import { datasets } from '../../../db/schema/galaxy/datasets'
import { histories } from '../../../db/schema/galaxy/histories'
import { useDrizzle } from '../../drizzle'
import { isDatasetTerminalState } from '../datasets'
import { takeUniqueOrThrow } from '../helper'

export async function getOrCreateInputDataset(
  galaxyDatasetId: string,
  analysisId: number,
  historyId: number,
  supabase: serverSupabaseClient,
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

export async function synchronizeInputDataset(
  galaxyDatasetId: string,
  analysisId: number,
  historyId: number,
  supabase: serverSupabaseClient,
  ownerId: string,
): Promise<void> {
  const datasetDb = await getOrCreateInputDataset(galaxyDatasetId, analysisId, historyId, supabase, ownerId)
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
