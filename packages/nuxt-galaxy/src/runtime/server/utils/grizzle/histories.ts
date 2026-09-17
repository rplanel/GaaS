import type { HistoryState } from 'blendtype'
import type { NewHistory } from '../../../types/nuxt-galaxy'
import { useRuntimeConfig } from '#imports'
import { HistoryStates } from 'blendtype'
import * as bt from 'blendtype'
import { and, eq } from 'drizzle-orm'
import { Data, Effect } from 'effect'
import { analyses } from '../../db/schema/galaxy/analyses'
import { histories } from '../../db/schema/galaxy/histories'
import { Drizzle } from '../drizzle'
import { takeUniqueOrThrow } from './helper.js'
import { getCurrentUserEffect } from './user'

// const supabase = useSupabaseClient();

export function isHistoryTerminalState(state: HistoryState): boolean {
  return (HistoryStates as readonly string[]).includes(state) && ['ok', 'error', 'failed', 'deleted'].includes(state)
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
