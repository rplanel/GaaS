import type { H3Event } from 'h3'
import { Cause } from 'effect'
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
const SHARED_STATUSES: Record<string, number | undefined> = {
  ForbiddenError: 403,
  GalaxyServiceUnavailable: 503,
}

/**
 * Turn a folded failure into the response it deserves, or a logged 500.
 *
 * `statuses` carries the tags only this endpoint can raise. It is typed
 * against the handler's own error union, so a key naming a tag that union
 * does not contain fails `vue-tsc` — the check the hand-written
 * `error._tag === '…'` cascades got for free, and the reason this takes a
 * typed map rather than a `Record<string, number>`.
 *
 * `handler` names the endpoint in the 500 log, as "<handler> handler failed".
 * `options.context` adds fields to that log, for a handler with something
 * worth recording beyond the cause.
 */
export function toHttpError<E extends TaggedFailure>(
  event: H3Event,
  error: E,
  handler: string,
  options: {
    readonly statuses?: Partial<Record<E['_tag'], number>>
    readonly context?: Record<string, unknown>
  } = {},
): never {
  // a caller with no session is told that and nothing else: why
  // authentication failed is not theirs to read
  if (error._tag === 'GetSupabaseUserError') {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // shared first, so a per-endpoint map cannot quietly disagree with an
  // answer the other handlers give
  const statusCode = SHARED_STATUSES[error._tag]
    ?? (options.statuses as Record<string, number | undefined> | undefined)?.[error._tag]

  if (statusCode !== undefined) {
    throw createError({ statusCode, statusMessage: messageOf(error) })
  }

  // nothing mapped it, so it is this server's fault rather than the caller's:
  // the reason goes to the log and the caller gets a status
  const log = useLogger(event)
  log.error(`${handler} handler failed`, {
    cause: Cause.pretty(Cause.fail(error)),
    ...options.context,
  })
  throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
}
