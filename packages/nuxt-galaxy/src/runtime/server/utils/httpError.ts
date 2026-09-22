import type { H3Event } from 'h3'
import { Cause, Option } from 'effect'
import { useLogger } from 'evlog'
import { createError } from 'h3'

/**
 * The shape every folding handler's error union has: `Data.TaggedError` gives
 * each member a literal `_tag`.
 *
 * `message` is not part of it. Effect's own framework types reach these
 * unions — `Empty` from `Cause`/`FiberRefsPatch`, by way of the config layer —
 * and carry no message, so it is read off rather than required.
 */
interface TaggedFailure {
  readonly _tag: string
}

/**
 * The error's own words, when it has any. A status the caller can act on is
 * worth explaining; where there is nothing to say, `createError` falls back to
 * the standard reason phrase rather than the string "undefined".
 */
function messageOf(error: TaggedFailure): string | undefined {
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' && message.length > 0 ? message : undefined
}

/**
 * The tags whose answer does not depend on which endpoint raised them.
 *
 * They are here rather than in each handler's own map so that a handler
 * cannot answer them differently, and — the reason this helper exists — so
 * that a handler cannot forget one. `[analysisId].delete` and `[id]/sync.post`
 * both piped `toGalaxyServiceUnavailable` and both answered 500 when Galaxy
 * was down, because the branch was copied into four folds and not the other
 * two.
 *
 * `GetSupabaseUserError` is absent on purpose: it is answered below with a
 * fixed message rather than the error's own.
 */
const SHARED_STATUSES = {
  ForbiddenError: 403,
  GalaxyServiceUnavailable: 503,
} as const

/**
 * The tags a handler may not remap, derived from the table above so the two
 * cannot disagree. `GetSupabaseUserError` joins them: it is answered with a
 * fixed body rather than a looked-up status, so it is absent from the table
 * but just as much not a handler's to decide.
 */
type SharedTag = 'GetSupabaseUserError' | keyof typeof SHARED_STATUSES

/**
 * The failure a status may be answered from, if there is one.
 *
 * A defect anywhere in the cause takes this to `None`, even when a named
 * failure sits beside it. Not just a top-level `Die`: a composite is how a
 * compensating finalizer reports itself — `analyses.post` discards a prepared
 * history in `Effect.onError` — so a bug in one arm arrives paired with the
 * named failure in the other. Answering that failure's status would drop the
 * defect unlogged, which is the exact loss this module was widened to stop
 * (#40).
 *
 * Two plain failures are not that case: the first one still answers, which is
 * what an `Effect.all` over a Galaxy that is down needs in order to keep
 * answering 503.
 *
 * Exported because a handler that reads the failure itself has to make the
 * same judgement — `workflows.post` does, for the status its 409 carries —
 * and a second copy of this rule is a second chance to disagree with it.
 */
export function answerableFailure<E extends TaggedFailure>(cause: Cause.Cause<E>): Option.Option<E> {
  return Option.isSome(Cause.dieOption(cause)) ? Option.none() : Cause.failureOption(cause)
}

/**
 * Turn a folded `Cause` into the response it deserves, or a logged 500.
 *
 * This takes the whole cause rather than a single error because a fiber ends
 * in more ways than one, and the other ways are the ones worth seeing (#40).
 * `Effect.either` recovers the error channel alone, so a defect — a plain
 * `throw` inside `Effect.gen`, or `Effect.die` — and an interruption used to
 * pass straight through the fold: the promise rejected, Nitro rendered a
 * generic 500, and the unanticipated failure was the only kind that reached
 * no log. `Exit<A, E>` is `Either<A, Cause<E>>`, and a `Cause` names all
 * three. Handlers fold with `Effect.exit` and hand what they get to this.
 *
 * `statuses` carries the tags only this endpoint can raise. It is typed
 * against the handler's own error union, so a key naming a tag that union
 * does not contain fails `vue-tsc` — the check the hand-written
 * `error._tag === '…'` cascades got for free, and the reason this takes a
 * typed map rather than a `Record<string, number>`. The shared tags are
 * excluded from it too, so "answer 403 differently here" is a compile error
 * rather than a silent correction. A handler that really needs its own answer
 * for one keeps a branch at the call site, as `workflows.post` does for the
 * status its 409 carries on the error.
 *
 * `handler` names the endpoint in the 500 log, as "<handler> handler failed".
 * `options.context` adds fields to that log, for a handler with something
 * worth recording beyond the cause.
 */
export function toHttpError<E extends TaggedFailure>(
  event: H3Event,
  cause: Cause.Cause<E>,
  handler: string,
  options: {
    readonly statuses?: Partial<Record<Exclude<E['_tag'], SharedTag>, number>>
    readonly context?: Record<string, unknown>
  } = {},
): never {
  const failure = answerableFailure(cause)

  if (Option.isSome(failure)) {
    const error = failure.value

    // a caller with no session is told that and nothing else: why
    // authentication failed is not theirs to read
    if (error._tag === 'GetSupabaseUserError') {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    // A handler cannot name a shared tag in `statuses` — `SharedTag` is
    // excluded from the key type — so this order is belt to that brace, for a
    // caller that casts past it. It is deliberately unreachable through the
    // typed call, and the one test that drives it has to cast to get there.
    const statusCode = (SHARED_STATUSES as Record<string, number | undefined>)[error._tag]
      ?? (options.statuses as Record<string, number | undefined> | undefined)?.[error._tag]

    if (statusCode !== undefined) {
      throw createError({ statusCode, statusMessage: messageOf(error) })
    }
  }
  else if (Cause.isInterruptedOnly(cause)) {
    // Nothing failed and nothing is broken: the fiber was told to stop, which
    // on a request means the caller went away. There is nobody to answer and
    // no fault to record, so the interruption is rethrown as it is rather
    // than dressed up as a status.
    throw Cause.squash(cause)
  }

  // nothing mapped it, so it is this server's fault rather than the caller's:
  // the reason goes to the log and the caller gets a status
  const log = useLogger(event)
  log.error(`${handler} handler failed`, {
    cause: Cause.pretty(cause),
    ...options.context,
  })
  throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
}
