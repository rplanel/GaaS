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
 * `historyDb` can no longer be null and the guard was unreachable. The first
 * went the same way in #33: `getCurrentUserEffect` fails for a missing row
 * itself, so the one guard left is Galaxy creating nothing.
 */
export function addHistoryEffect(name: string, ownerId: string) {
  const { public: { galaxy: { url } }, galaxy: { email } } = useRuntimeConfig()

  return Effect.gen(function* () {
    const currentUser = yield* getCurrentUserEffect(url, email)

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
    // The narrower of the two windows #39 describes: Galaxy holds a container
    // and the row that would have recorded it is the thing that failed, so
    // nothing outside this function has an identifier to clean up with — the
    // caller is handed a failure, not an id. It goes back out from here,
    // where the id still exists.
    return yield* insertHistory(historyToInsert).pipe(
      Effect.onError(() => discardGalaxyHistory(galaxyHistory.id)),
    )
  })
}

/**
 * Say what went wrong and carry on.
 *
 * Every step of a compensation needs this: it runs because something else
 * already failed, and that failure is the one its caller has to be answered
 * with, so a step that cannot finish may not replace it. The log is then the
 * only place the leftover is visible at all, which is why each caller passes
 * the identifiers to find it by.
 *
 * The cause travels as itself, which the bridge writes as `effectCause`, and
 * the identifiers as annotations, which it writes as `effectAnnotations`.
 * Handed over as one plain object beside the message, both were stringified
 * into the message text, where no query could reach either.
 */
function sayAndContinue(message: string, fields: Record<string, unknown>) {
  return <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.catchAllCause(cause => Effect.logError(message, cause).pipe(Effect.annotateLogs(fields))),
    )
}

/** Remove a container from Galaxy, reporting nothing back. */
function discardGalaxyHistory(galaxyHistoryId: string) {
  return bt.deleteHistoryEffect(galaxyHistoryId).pipe(
    sayAndContinue('galaxy would not remove the container prepared for a failed request', { galaxyHistoryId }),
  )
}

/**
 * Whether an analysis already references this history — the question of what
 * removing the history row would take with it, which `analyses.history_id`
 * answers on its own: it is unique, and `ON DELETE CASCADE`, whoever owns it.
 */
function analysisExistsFor(historyId: number) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .select({ id: analyses.id })
        .from(analyses)
        .where(eq(analyses.historyId, historyId))
        .then(rows => rows.length > 0),
      catch: error => new GetHistoryError({ message: `Error looking for the analysis of history ${historyId}: ${error}` }),
    })
  })
}

/**
 * Take back out what `addHistoryEffect` prepared: the container on Galaxy,
 * then the row recording it. `POST /api/db/analyses` prepares both before it
 * uploads anything, so every failure after that point has both to unwind
 * (#39) — including a request that uploads nothing at all, which the
 * compensation hanging off a single upload never covered.
 *
 * Galaxy first, as `deleteAnalysis` does, and then the row *whatever* Galaxy
 * answered: a compensation gets no second attempt, and a row stuck at
 * `state: 'new'` pointing at a container this application can no longer
 * account for is the mess being unwound. Neither half can fail the caller.
 */
export function discardPreparedHistoryEffect(galaxyHistoryId: string, historyId: number) {
  return Effect.gen(function* () {
    // The one thing this does not take back out is a history an analysis
    // already references. `analyses.history_id` is `ON DELETE CASCADE`, so
    // removing the row would take the analysis with it and leave its
    // monitoring record counting a run that no longer exists as Pending for
    // ever — the pairing only `deleteAnalysis` is equipped to undo. That is
    // never the #39 case: a request that strands a history failed before it
    // had an analysis, and finds nothing here.
    //
    // An invocation Galaxy accepted that no analysis row records is *not*
    // spared. Nothing in this application can see, monitor or stop such a
    // run, so removing its container is the only thing that ends it.
    const started = yield* analysisExistsFor(historyId).pipe(
      sayAndContinue('could not tell whether the failed request had started an analysis', { historyId }),
      // The log leaves nothing where the answer would have been, and an
      // unanswered question is answered as "started": leaving a container
      // behind is recoverable, purging a running analysis is not.
      Effect.map(answer => answer ?? true),
    )
    if (!started) {
      yield* discardGalaxyHistory(galaxyHistoryId)
      yield* deleteHistory(historyId).pipe(
        sayAndContinue('could not remove the row recording an analysis that was never started', { historyId }),
      )
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
