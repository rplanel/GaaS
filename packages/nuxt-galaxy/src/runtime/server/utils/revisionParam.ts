import type { H3Event } from 'h3'
import { createError, getRouterParam } from 'h3'

/**
 * How long a revision index may be.
 *
 * `/^\d+$/` alone accepts a digit string of any length, and `Number()` turns
 * one past 2^53 into an imprecise float: `10000000000000000001` and
 * `…002` both become 1e19, so two different requests would share one cache
 * entry and Galaxy would be sent `1e+19`. Nine digits is a billion
 * revisions of one workflow, which is not a number anyone reaches by saving
 * in an editor.
 */
const REVISION = /^\d{1,9}$/

/**
 * The revision a request names in its path, by the 0-based index Galaxy
 * lists it under.
 *
 * Galaxy's `get_internal_version` indexes a list, so only a non-negative
 * integer can name a revision; anything else — a word, a negative, a
 * fraction, an empty middle segment — is refused here rather than handed to
 * Galaxy to answer for. A caller reaching this has a bug worth being told
 * about.
 *
 * Shared by the two endpoints that take a revision in their path, so that
 * what names a revision is decided once. Thrown rather than returned on
 * purpose: h3 reads a status off a throw in ordinary async code only, and
 * one raised inside `Effect.gen` would be buried in a `FiberFailure`.
 */
export function requestedRevisionParam(event: H3Event): number {
  const revision = getRouterParam(event, 'revision') ?? ''
  if (!REVISION.test(revision)) {
    throw createError({
      statusCode: 400,
      statusMessage: '`revision` must be a non-negative integer',
    })
  }
  return Number(revision)
}
