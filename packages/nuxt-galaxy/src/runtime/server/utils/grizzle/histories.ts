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
import { takeExactlyOne, takeUniqueOrNull } from './helper.js'
import { galaxyUserNotFound, getCurrentUserEffect } from './user'

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
        .then(takeUniqueOrNull),
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
        .then(takeUniqueOrNull),
      catch: error => new GetHistoryError({ message: `Error getting history analysis: ${error}` }),
    })
  })
}

/**
 * Galaxy accepted the request but answered with nothing to record.
 *
 * `createHistoryEffect` is typed as always returning a history, so only the
 * guard below stands between an empty Galaxy response and this function
 * resolving with `undefined` — which is a success, and used to reach the
 * client as 200 with an empty body.
 *
 * The message is written in analysis terms on purpose: "history" is a
 * Galaxy-side container, listed under _Avoid_ in `CONTEXT.md`, and this one
 * is read by a user as a 503.
 */
export class CreateGalaxyHistoryError extends Data.TaggedError('CreateGalaxyHistoryError')<{
  readonly message: string
}> { }

/**
 * Every exit from this function is now either the inserted row or a named
 * failure (ADR 0002). It previously had three nested guards and no `else` at
 * any level, so all three ways of failing arrived at the caller as one
 * indistinguishable `undefined`.
 *
 * The third guard is gone rather than tagged: `insertHistory` takes its row
 * with `takeExactlyOne`, which refuses a zero-row insert itself (#31), so
 * `historyDb` can no longer be null and the guard was unreachable.
 */
export function addHistoryEffect(name: string, ownerId: string) {
  const { public: { galaxy: { url } }, galaxy: { email } } = useRuntimeConfig()

  return Effect.gen(function* () {
    const currentUser = yield* getCurrentUserEffect(url, email)
    if (!currentUser) {
      return yield* Effect.fail(galaxyUserNotFound(url, email))
    }

    const galaxyHistory = yield* bt.createHistoryEffect(name)
    if (!galaxyHistory) {
      return yield* Effect.fail(new CreateGalaxyHistoryError({
        message: 'The analysis could not be prepared on Galaxy',
      }))
    }

    const historyToInsert: NewHistory = {
      name,
      ownerId,
      userId: currentUser.user.id,
      galaxyId: galaxyHistory.id,
      state: 'new',
    }
    return yield* insertHistory(historyToInsert)
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
        .then(takeExactlyOne),
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
        .then(takeUniqueOrNull),
      catch: error => new UpdateHistoryState({ message: `Error updating history state: ${error}` }),
    })
  })
}
