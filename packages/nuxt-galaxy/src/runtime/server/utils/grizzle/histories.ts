import type { serverSupabaseClient } from '#supabase/server'
import type { DatasetTerminalState, HistoryState } from 'blendtype'
import type { Database } from '../../../types/database'
import { useRuntimeConfig } from '#imports'
import { createHistory, DatasetsTerminalStates, deleteHistory, getHistory, initializeGalaxyClient } from 'blendtype'
import { and, eq } from 'drizzle-orm'

import { createError } from 'h3'
import { analyses } from '../../db/schema/galaxy/analyses'
import { analysisInputs } from '../../db/schema/galaxy/analysisInputs'
import { datasets } from '../../db/schema/galaxy/datasets'
import { histories } from '../../db/schema/galaxy/histories'
import { useDrizzle } from '../drizzle'
import { getInvocationOutputs } from './analyses'
import { synchronizeInputDataset } from './datasets/input'
import { takeUniqueOrThrow } from './helper.js'
import { getOrCreateJob, isJobSync, synchronizeJob } from './jobs'
import { getCurrentUser } from './user'

// const supabase = useSupabaseClient();

export async function addHistory(name: string, ownerId: string): Promise<{
  id: number
  galaxyId: string
} | undefined> {
  const { public: { galaxy: { url } }, galaxy: { apiKey, email } } = useRuntimeConfig()
  initializeGalaxyClient({ apiKey, url })

  const currentUser = await getCurrentUser(url, email)
  if (currentUser) {
    const { user } = currentUser
    const galaxyHistory = await createHistory(name)
    if (galaxyHistory?.id) {
      try {
        const historiesDb = await useDrizzle().insert(histories).values(
          {
            name,
            ownerId,
            state: 'new',
            userId: user.id,
            galaxyId: galaxyHistory.id,
          },
        ).returning({
          id: histories.id,
          galaxyId: histories.galaxyId,
        })

        if (historiesDb && historiesDb.length === 1) {
          return historiesDb[0]
        }
        else {
          createError({
            statusCode: 500,
            statusMessage: 'Should have created only one history',
          })
        }
      }
      catch (error) {
        // delete galaxy history
        console.error(error)
        await deleteHistory(galaxyHistory.id)
      }
    }
    else {
      throw createError({
        statusCode: 500,
        statusMessage: 'No Galaxy id return',
      })
    }
  }
  else {
    throw createError({
      statusCode: 500,
      statusMessage: 'No current user found',
    })
  }
}

export async function synchronizeHistory(historyId: number, ownerId: string, supabase: serverSupabaseClient<Database>): Promise<void> {
  const { public: { galaxy: { url } }, galaxy: { apiKey } } = useRuntimeConfig()
  initializeGalaxyClient({ apiKey, url })
  const historyDb = await useDrizzle()
    .select()
    .from(histories)
    .innerJoin(analyses, eq(analyses.historyId, histories.id))
    .where(and(eq(histories.id, historyId), eq(histories.ownerId, ownerId)))
    .then(takeUniqueOrThrow)

  if (historyDb) {
    const isSync = await isHistorySync(historyId, historyDb.analyses.id, ownerId)
    if (isSync) {
      return
    }
    const galaxyHistoryId = historyDb.histories.galaxyId

    // check inputs
    const analysisInputsDb = await useDrizzle()
      .select()
      .from(analysisInputs)
      .innerJoin(datasets, eq(datasets.id, analysisInputs.datasetId))
      .where(
        and(
          eq(analysisInputs.analysisId, historyDb.analyses.id),
          eq(datasets.ownerId, ownerId),
        ),
      )
    for (const analysisInput of analysisInputsDb) {
      synchronizeInputDataset(
        analysisInput.datasets.galaxyId,
        historyDb.analyses.id,
        historyId,
        supabase,
        ownerId,
      )
    }
    // if history not sync, need to sync jobs
    await synchronizeJobs(historyDb.analyses.id, historyDb.histories.id, ownerId, supabase)
    // Make a Galaxy request only if the state is not terminal
    if (!isHistoryTerminalState(historyDb.histories.state)) {
      const galaxyHistory = await getHistory(galaxyHistoryId)
      if (historyDb.histories.state !== galaxyHistory.state) {
        await useDrizzle()
          .update(histories)
          .set({ state: galaxyHistory.state })
          .where(eq(histories.id, historyId))
          .returning({ historyId: histories.id, state: histories.state })
          .then(takeUniqueOrThrow)
      }
    }
  }
}

export async function synchronizeJobs(
  analysisId: number,
  historyId: number,
  ownerId: string,
  supabase: serverSupabaseClient<Database>,
): Promise<void[] | undefined> {
  const invocationOutputs = await getInvocationOutputs(analysisId, ownerId)
  if (invocationOutputs) {
    return Promise.all(Object
      .entries(invocationOutputs)
      .map(async ([galaxyJobId, { galaxyDatasetIds, stepId }]) => {
        return synchronizeJob(
          galaxyJobId,
          stepId,
          analysisId,
          historyId,
          galaxyDatasetIds,
          ownerId,
          supabase,
        )
      }),
    )
  }
}

export function isHistoryTerminalState(state: HistoryState): boolean {
  return DatasetsTerminalStates.includes(state as DatasetTerminalState)
}

export async function isHistorySync(historyId: number, analysisId: number, ownerId: string): Promise<boolean> {
  // historydb.issync OR history in terminal state AND Job sync

  const historyDb = await useDrizzle()
    .select()
    .from(analyses)
    .innerJoin(histories, eq(histories.id, analyses.historyId))
    .where(
      and(
        eq(histories.id, historyId),
        eq(histories.ownerId, ownerId),
      ),
    )
    .then(takeUniqueOrThrow)
    // historyDb.analyses.

  const isSync = historyDb.histories.isSync
  if (isSync)
    return true

  // need to get all the jobs that have outputs and all the outputs for each job
  const jobsWithOutputs = await getInvocationOutputs(analysisId, ownerId)
  // console.log(jobsWithOutputs)
  if (jobsWithOutputs) {
    const allJobsSync = await Promise.all(
      Object.entries(jobsWithOutputs)
        .map(async ([galaxyJobId, { galaxyDatasetIds, stepId }]) => {
          const jobDb = await getOrCreateJob(analysisId, galaxyJobId, stepId, ownerId)
          return isJobSync(jobDb.id, galaxyDatasetIds, ownerId)
        }),
    )
    const historyIsSync = isHistoryTerminalState(historyDb.histories.state) && allJobsSync.every(d => d)
    // update history entry to set flag isSync to true

    if (historyIsSync) {
      await useDrizzle()
        .update(histories)
        .set({ isSync: true })
        .where(and(
          eq(histories.ownerId, ownerId),
          eq(histories.id, historyId),
        ))
    }
    return historyIsSync
  }
  return false
}
