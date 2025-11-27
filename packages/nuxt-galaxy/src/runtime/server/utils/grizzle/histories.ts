import type { DatasetTerminalState, HistoryState } from 'blendtype'
import type { EventHandlerRequest, H3Event } from 'h3'
import type { NewHistory } from '~/src/runtime/types/nuxt-galaxy'
import { useRuntimeConfig } from '#imports'
import * as bt from 'blendtype'
import { and, eq } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { analyses } from '../../db/schema/galaxy/analyses'
import { histories } from '../../db/schema/galaxy/histories'
import { Drizzle } from '../drizzle'
import { getInvocationOutputs, synchronizeJobsEffect } from './analyses'
import { getAllAnalysisInputDatasets, synchronizeInputDatasetEffect } from './datasets/input'
import { takeUniqueOrThrow } from './helper.js'
import { getAnalysisJobs, isJobSyncEffect } from './jobs'
import { getCurrentUserEffect } from './user'

// const supabase = useSupabaseClient();

export function isHistoryTerminalState(state: HistoryState): boolean {
  return bt.DatasetsTerminalStates.includes(state as DatasetTerminalState)
}

export function synchronizeHistoryEffect(historyId: number, ownerId: string, event: H3Event<EventHandlerRequest>) {
  return Effect.gen(function* () {
    const historyDb = yield* getAnalysisHistory(historyId, ownerId)
    if (historyDb) {
      const isSync = yield* isHistorySyncEffect(historyId, historyDb.histories.id, ownerId)
      if (isSync) {
        return
      }
      const analysisInputsDb = yield* getAllAnalysisInputDatasets(historyDb.analyses.id, ownerId)
      yield* Effect.all(
        analysisInputsDb.map((analysisInput) => {
          return Effect.gen(function* () {
            yield* synchronizeInputDatasetEffect(
              analysisInput.datasets.galaxyId,
              historyDb.analyses.id,
              historyId,
              event,
              ownerId,
            )
          })
        }),
      )
      yield* synchronizeJobsEffect(
        historyDb.analyses.id,
        historyDb.histories.id,
        ownerId,
        event,
      )
      if (!isHistoryTerminalState(historyDb.histories.state)) {
        const galaxyHistoryId = historyDb.histories.galaxyId
        const galaxyHistory = yield* bt.getHistoryEffect(galaxyHistoryId)
        if (historyDb.histories.state !== galaxyHistory.state) {
          yield* updateHistoryState(historyId, galaxyHistory.state)
        }
      }
      if (historyDb.histories.state === 'error') {
        updateIsHistorySync(historyId, ownerId)
        yield* updateHistoryState(historyId, 'running')
      }
    }
  })
}

export class GetHistoryError extends Data.TaggedError('GetHistoryError')<{
  readonly message: string
}> { }

export function getHistoryDb(historyId: number, ownerId: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .select()
        .from(histories)
        .where(and(
          eq(histories.id, historyId),
          eq(histories.ownerId, ownerId),
        ))
        .then(takeUniqueOrThrow),
      catch: error => new GetHistoryError({ message: `Error getting history: ${error}` }),
    })
  })
}

export function getAnalysisHistory(historyId: number, ownerId: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .select()
        .from(analyses)
        .innerJoin(histories, eq(histories.id, analyses.historyId))
        .where(and(
          eq(histories.id, historyId),
          eq(histories.ownerId, ownerId),
        ))
        .then(takeUniqueOrThrow),
      catch: error => new GetHistoryError({ message: `Error getting history analysis: ${error}` }),
    })
  })
}

export function addHistoryEffect(name: string, ownerId: string) {
  const { public: { galaxy: { url } }, galaxy: { email } } = useRuntimeConfig()

  return Effect.gen(function* () {
    const currentUser = yield* getCurrentUserEffect(url, email)
    if (currentUser) {
      const galaxyHistory = yield* bt.createHistoryEffect(name)
      if (galaxyHistory) {
        const historyToInsert: NewHistory = {
          name,
          ownerId,
          userId: currentUser.user.id,
          galaxyId: galaxyHistory.id,
          state: 'new',
        }
        const historyDb = yield* insertHistory(historyToInsert)
        if (historyDb) {
          return historyDb
        }
      }
    }
  })
}

export class DeleteGalaxyHistoryError extends Data.TaggedError('DeleteGalaxyHistoryError')<{
  readonly message: string
}> { }

export function deleteHistory(historyId: number) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .delete(histories)
        .where(eq(histories.id, historyId)),
      catch: error => new DeleteGalaxyHistoryError({ message: `Error deleting history: ${error}` }),
    })
  })
}

export class InsertHistoryError extends Data.TaggedError('InsertHistoryError')<{
  readonly message: string
}> { }
export function insertHistory(history: NewHistory) {
  const { name, ownerId, userId, galaxyId, state } = history

  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .insert(histories)
        .values(
          {
            name,
            ownerId,
            state,
            userId,
            galaxyId,
          },
        )
        .returning({
          id: histories.id,
          galaxyId: histories.galaxyId,
        })
        .then(takeUniqueOrThrow),
      catch: error => new InsertHistoryError({ message: `Error inserting history: ${error}` }),
    })
  })
}

export function isHistorySyncEffect(historyId: number, analysisId: number, ownerId: string) {
  return Effect.gen(function* () {
    const historyDb = yield* getAnalysisHistory(historyId, ownerId)
    if (!historyDb) {
      return false
    }
    const isSync = historyDb.histories.isSync
    if (isSync) {
      return true
    }
    const jobsWithOutputs = yield* getInvocationOutputs(analysisId, ownerId)
    const isAllJobsSync = yield* isSynchronizedAnalysisJobs(analysisId, jobsWithOutputs, ownerId)
    const isHistorySync = isHistoryTerminalState(historyDb.histories.state) && isAllJobsSync
    if (isHistorySync) {
      yield* updateIsHistorySync(historyId, ownerId)
      return isHistorySync
    }
    return false
  })
}

export function isSynchronizedAnalysisJobs(analysisId: number, jobsWithOutputs: Record<string, {
  galaxyDatasetIds: string[]
  galaxyJobId: string
  stepId: number
}> | undefined, ownerId: string) {
  if (!jobsWithOutputs) {
    return Effect.succeed(false)
  }
  return Effect.all(
    Object.entries(jobsWithOutputs).map(([galaxyJobId, { galaxyDatasetIds }]) => {
      return Effect.gen(function* () {
        const jobDb = yield* getAnalysisJobs(analysisId, galaxyJobId, ownerId)
        if (jobDb) {
          return yield* isJobSyncEffect(jobDb.id, jobDb.state, galaxyDatasetIds, ownerId)
        }
        // const jobDb = yield* getOrCreateJobEffect(analysisId, galaxyJobId, stepId, ownerId)
        return false
      })
    }),
  ).pipe(Effect.map(d => d.every(d => d)))
}

export class UpdateHistoryState extends Data.TaggedError('UpdateHistoryState')<{
  readonly message: string
}> { }

export function updateIsHistorySync(historyId: number, ownerId: string) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .update(histories)
        .set({ isSync: true })
        .where(and(
          eq(histories.ownerId, ownerId),
          eq(histories.id, historyId),
        )),
      catch: error => new UpdateHistoryState({ message: `Error updating history: ${error}` }),
    })
  })
}

export function updateHistoryState(historyId: number, state: HistoryState) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .update(histories)
        .set({ state })
        .where(eq(histories.id, historyId))
        .returning({ historyId: histories.id, state: histories.state })
        .then(takeUniqueOrThrow),
      catch: error => new UpdateHistoryState({ message: `Error updating history state: ${error}` }),
    })
  })
}
