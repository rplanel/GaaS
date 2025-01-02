import type { SupabaseClient } from '@supabase/supabase-js'
import { createError, useRuntimeConfig } from '#imports'
import { GalaxyClient } from 'blendtype'
import { and, eq } from 'drizzle-orm'
import { analysisOutputs } from '../../../db/schema/galaxy/analysisOutputs'
import { datasets } from '../../../db/schema/galaxy/datasets'
import { histories } from '../../../db/schema/galaxy/histories'
import { useDrizzle } from '../../drizzle'
import { isDatasetTerminalState } from '../datasets'
import { takeUniqueOrThrow } from '../helper'

export async function getOrCreateOutputDataset(
  galaxyDatasetId: string,
  analysisId: number,
  historyId: number,
  jobId: number,
  supabase: SupabaseClient,
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

  const { public: { galaxy: { url } }, galaxy: { apiKey } } = useRuntimeConfig()
  // get the galaxy client
  const galaxyClient = GalaxyClient.getInstance(apiKey, url)
  const historyDb = await useDrizzle()
    .select()
    .from(histories)
    .where(and(
      eq(histories.id, historyId),
      eq(histories.ownerId, ownerId),
    ))
    .then(takeUniqueOrThrow)
  const galaxyDataset = await galaxyClient.datasets().getDataset(galaxyDatasetId, historyDb.galaxyId)
  const isDatasetTerminal = isDatasetTerminalState(galaxyDataset.state)
  if (isDatasetTerminal) {
    const datasetBlob = await galaxyClient.histories()
      .downloadDataset(
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
            fileSize: galaxyDataset.file_size,
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
      }
    }
  }
}
export async function synchronizeOutputDataset(
  galaxyDatasetId: string,
  analysisId: number,
  historyId: number,
  jobId: number,
  supabase: SupabaseClient,
  ownerId: string,
): Promise<void> {
  const datasetDb = await getOrCreateOutputDataset(galaxyDatasetId, analysisId, historyId, jobId, supabase, ownerId)
  const { public: { galaxy: { url } }, galaxy: { apiKey } } = useRuntimeConfig()
  const galaxyClient = GalaxyClient.getInstance(apiKey, url)
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
      const galaxyDataset = await galaxyClient.datasets().getDataset(galaxyDatasetId, historyDb.galaxyId)
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
