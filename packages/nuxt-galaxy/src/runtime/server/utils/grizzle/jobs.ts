import type { JobState, JobTerminalState, ShowFullJobResponse } from 'blendtype'
import type { EventHandlerRequest, H3Event } from 'h3'
import type { NewJob } from '~/src/runtime/types/nuxt-galaxy'
import { getJobEffect, JobTerminalStates } from 'blendtype'
import { and, eq } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { jobs } from '../../db/schema/galaxy/jobs'
import { Drizzle } from '../drizzle'
import { isOutputDatasetSyncEffect, synchronizeOutputDatasetEffect } from './datasets/output.js'
import { takeUniqueOrThrow } from './helper'

export function isJobTerminalState(state: JobState): boolean {
  // add state pause since event if not a terminal state, we want to stop the sync because user have no access to galaxy job
  const additionalState: JobState[] = ['paused']
  return [...additionalState, ...JobTerminalStates].includes(state as JobTerminalState)
}

export function getOrCreateJobEffect(analysisId: number, galaxyJobId: string, stepId: number, ownerId: string) {
  return Effect.gen(function* () {
    const jobExist = yield* getAnalysisJobs(analysisId, galaxyJobId, ownerId)
    if (jobExist) {
      return jobExist
    }
    const galaxyJob = yield* getJobEffect(galaxyJobId)
    const job: NewJob = {
      galaxyId: galaxyJobId,
      stepId,
      state: galaxyJob.state,
      toolId: galaxyJob.tool_id,
      ownerId,
      createdAt: new Date(galaxyJob.create_time),
      stderr: galaxyJob.stderr,
      stdout: galaxyJob.stdout,
      exitCode: galaxyJob.exit_code,
      analysisId,
    }
    return yield* insertAnalysisJob(job)
  })
}

// eslint-disable-next-line unicorn/throw-new-error
export class InsertAnalysisJobError extends Data.TaggedError('InsertAnalysisJobError')<{
  readonly message: string
}> {}

export function insertAnalysisJob(galaxyJob: NewJob) {
  const { state, stderr, stdout, exitCode } = galaxyJob
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .insert(jobs)
        .values(galaxyJob)
        .onConflictDoUpdate({
          target: [jobs.analysisId, jobs.galaxyId],
          set: { state, stderr, stdout, exitCode },
        })
        .returning()
        .then(takeUniqueOrThrow),
      catch: error => new InsertAnalysisJobError({ message: `Error inserting analysis job: ${error}` }),
    })
  })
}

// eslint-disable-next-line unicorn/throw-new-error
export class GetAnalysisJobsError extends Data.TaggedError('GetAnalysisJobsError')<{
  readonly message: string
}> {}

export function getAnalysisJobs(analysisId: number, galaxyJobId: string, ownerId: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.galaxyId, galaxyJobId),
            eq(jobs.analysisId, analysisId),
            eq(jobs.ownerId, ownerId),
          ),
        )
        .then(takeUniqueOrThrow),
      catch: error => new GetAnalysisJobsError({ message: `Error getting analysis jobs: ${error}` }),
    })
  })
}

export function isJobSyncEffect(jobId: number, jobState: JobState, datasetIds: string[], ownerId: string) {
  return Effect.gen(function* () {
    const allJobOutputDatasetsSync = yield* isJobOutputDatasetsSyncEffect(jobId, datasetIds, ownerId)
    return allJobOutputDatasetsSync && isJobTerminalState(jobState)
  })
}

export function isJobOutputDatasetsSyncEffect(jobId: number, datasetIds: string[], ownerId: string) {
  return Effect.gen(function* () {
    const allJobOutputDatasetsSync = yield* Effect.all(datasetIds.map((id) => {
      return isOutputDatasetSyncEffect(id, jobId, ownerId)
    }))
    return allJobOutputDatasetsSync.every(d => d)
  })
}

export function synchronizeJobEffect(galaxyJobId: string, stepId: number, analysisId: number, historyId: number, galaxyDatasetIds: string[], ownerId: string, event: H3Event<EventHandlerRequest>) {
  return Effect.gen(function* () {
    const jobDb = yield* getOrCreateJobEffect(analysisId, galaxyJobId, stepId, ownerId)
    if (!jobDb) {
      return
    }
    const isSync = yield* isJobSyncEffect(jobDb.id, jobDb.state, galaxyDatasetIds, ownerId)
    if (isSync) {
      return
    }
    yield* synchronizeOutputDatasetsEffect(jobDb.id, galaxyDatasetIds, analysisId, historyId, ownerId, event)
    const isJobDbterminal = isJobTerminalState(jobDb.state)
    if (!isJobDbterminal) {
      const galaxyJob = yield* getJobEffect(galaxyJobId)
      if (jobDb.state !== galaxyJob.state) {
        yield* updateJob(galaxyJob, jobDb)
      }
    }
  })
}

export function updateJob(galaxyJob: ShowFullJobResponse, jobDb: typeof jobs.$inferSelect) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
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
        .then(takeUniqueOrThrow),
      catch: error => new Error(`Error updating job: ${error}`),
    })
  })
}

export function synchronizeOutputDatasetsEffect(jobId: number, galaxyDatasetIds: string[], analysisId: number, historyId: number, ownerId: string, event: H3Event<EventHandlerRequest>) {
  return Effect.all(galaxyDatasetIds.map((galaxyDatasetId) => {
    return synchronizeOutputDatasetEffect(galaxyDatasetId, analysisId, historyId, jobId, event, ownerId)
  }),
  )
}
