import type { JobState, JobTerminalState } from 'blendtype'
import type { EventHandlerRequest, H3Event } from 'h3'
import { getJob, JobTerminalStates } from 'blendtype'
import { and, eq } from 'drizzle-orm'
import { jobs } from '../../db/schema/galaxy/jobs'
import { useDrizzle } from '../drizzle'
import { isOutputDatasetSync, synchronizeOutputDataset } from './datasets/output.js'
import { takeUniqueOrThrow } from './helper'

export async function getOrCreateJob(analysisId: number, galaxyJobId: string, stepId: number, ownerId: string): Promise<typeof jobs.$inferSelect> {
  // check if the job exists
  const jobExist = await useDrizzle()
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.galaxyId, galaxyJobId),
        eq(jobs.analysisId, analysisId),
      ),
    )
    .then(takeUniqueOrThrow)

  if (jobExist)
    return jobExist

  // get the galaxy client
  const galaxyJob = await getJob(galaxyJobId)
  const { state, tool_id: toolId, create_time: createdAt, stderr, stdout, exit_code: exitCode } = galaxyJob
  return await useDrizzle()
    .insert(jobs)
    .values({
      galaxyId: galaxyJobId,
      stepId,
      state,
      toolId,
      ownerId,
      createdAt: new Date(createdAt),
      stderr,
      stdout,
      exitCode,
      analysisId,

    })
    .onConflictDoUpdate({
      target: [jobs.analysisId, jobs.galaxyId],
      set: { state, stderr, stdout, exitCode },
    })
    .returning()
    .then(takeUniqueOrThrow)
}

export async function synchronizeJob(
  galaxyJobId: string,
  stepId: number,
  analysisId: number,
  historyId: number,
  galaxyDatasetIds: string[],
  ownerId: string,
  event: H3Event<EventHandlerRequest>,
): Promise<void> {
  const jobDb = await getOrCreateJob(analysisId, galaxyJobId, stepId, ownerId)
  const isSync = await isJobSync(jobDb.id, galaxyDatasetIds, ownerId)

  if (isSync)
    return
  await synchronizeOutputDatasets(jobDb.id, galaxyDatasetIds, analysisId, historyId, ownerId, event)
  const isJobDbterminal = isJobTerminalState(jobDb.state)

  if (!isJobDbterminal) {
    const galaxyJob = await getJob(galaxyJobId)
    if (jobDb.state !== galaxyJob.state) {
      await useDrizzle()
        .update(jobs)
        .set({
          state: galaxyJob.state,
          stderr: galaxyJob.stderr,
          stdout: galaxyJob.stdout,
        })
        .where(eq(jobs.id, jobDb.id))
        .returning({
          jobId: jobs.id,
          state: jobs.state,
        })
        .then(takeUniqueOrThrow)
    }
  }
}

export async function synchronizeOutputDatasets(
  jobId: number,
  galaxyDatasetIds: string[],
  analysisId: number,
  historyId: number,
  ownerId: string,
  event: H3Event<EventHandlerRequest>,
): Promise<void[]> {
  return Promise.all(galaxyDatasetIds.map(async (galaxyDatasetId) => {
    // Check if dataset in the db
    return synchronizeOutputDataset(galaxyDatasetId, analysisId, historyId, jobId, event, ownerId)
  }))
}

export async function isJobSync(jobId: number, datasetIds: string[] | undefined, ownerId: string): Promise<boolean> {
  const jobDb = await useDrizzle()
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.ownerId, ownerId),
      ),
    )
    .then(takeUniqueOrThrow)
  const isSync = jobDb.isSync

  if (isSync)
    return true
  if (datasetIds) {
    const jobIsSync = await Promise.all(datasetIds?.map((id) => {
      return isOutputDatasetSync(id, jobId, ownerId)
    })).then((datasetsSync) => {
      return datasetsSync.every(d => d)
    }) && isJobTerminalState(jobDb.state)

    if (jobIsSync) {
      await useDrizzle()
        .update(jobs)
        .set({ isSync: true })
        .where(and(
          eq(jobs.ownerId, ownerId),
          eq(jobs.id, jobId),
        ))
    }
    return jobIsSync
  }
  return false

  // jobdb.isSync OR job terminal state AND all output datasets in the db are sync
}

export function isJobTerminalState(state: JobState): boolean {
  // add state pause since event if not a terminal state, we want to stop the sync because user have no access to galaxy job
  const additionalState: JobState[] = ['paused']
  return [...additionalState, ...JobTerminalStates].includes(state as JobTerminalState)
}
