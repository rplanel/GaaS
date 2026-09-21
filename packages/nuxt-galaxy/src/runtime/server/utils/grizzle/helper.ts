import { createError } from 'h3'

/**
 * More than one row means the uniqueness assumption the query was built on
 * does not hold. That is a defect, not a condition, so both helpers refuse it
 * alike and the only question a call site answers is what *no* rows means.
 *
 * No logging here: `requireRole` in this directory records the same decision
 * (D-04) — helpers do not log, handlers do. The reason reaches a handler
 * because every call site's `Effect.tryPromise` interpolates the cause into
 * its own tagged error.
 */
function assertAtMostOne(values: unknown[]): void {
  if (values.length > 1) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Found non unique',
    })
  }
}

/**
 * The single row a query returned, or `null` when it returned none.
 *
 * Absence is a real answer at most call sites — a row that does not exist, or
 * one that does not belong to this caller — so it is handed back for the
 * caller to interpret rather than thrown. `null` says only that nothing was
 * found and never why, which is why callers are being moved over to turning it
 * into a tagged failure of their own at the point it arrives (#25).
 *
 * Where absence means the query's own premise was wrong, use
 * {@link takeExactlyOne}.
 */
export function takeUniqueOrNull<T extends unknown[]>(values: T) {
  assertAtMostOne(values)
  if (values.length === 1) {
    return values[0]! as T[0]
  }
  return null
}

/**
 * The single row a query must have returned.
 *
 * For a query whose premise guarantees one: an `insert … returning()` asking
 * back for the row it just wrote. No rows there means the database broke a
 * promise rather than that the caller asked after something absent, so it is
 * refused rather than handed back.
 */
export function takeExactlyOne<T extends unknown[]>(values: T): T[0] {
  assertAtMostOne(values)
  if (values.length === 0) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Expected exactly one row, found none',
    })
  }
  return values[0]! as T[0]
}
