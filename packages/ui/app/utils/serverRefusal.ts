/**
 * Reading a refusal off what `$fetch` rejects with.
 *
 * `$fetch` rejects with an ofetch `FetchError`: `statusCode` is the response's
 * status, `data` is the parsed JSON body, and `statusMessage` is the
 * response's reason phrase (`response.statusText`), mapped straight across.
 * Two utils in this layer turn such a rejection into words for a reader,
 * `describeActivationFailure` and `describeStartAnalysisFailure`, and each
 * used to carry its own copy of these readers. The copies disagreed on one
 * point, which is the point this module settles (#63): the reason phrase is
 * never read.
 */

/**
 * The status the server answered with, if the rejection carries one.
 *
 * A bare `TypeError` from a failed fetch, or from destructuring an empty
 * body, carries none, and the caller decides what to say for that.
 */
export function statusCodeOf(error: unknown): number | undefined {
  const statusCode = fieldOf(error, 'statusCode')
  return typeof statusCode === 'number' ? statusCode : undefined
}

/**
 * The server's own words, if it had any.
 *
 * Only the JSON body is read: its `statusMessage`, then its `message`, the
 * first that is a non-blank string. Nitro's error handler writes the thrown
 * error's `statusMessage` and `message` into that body for every error it
 * renders, so a sentence the server wrote is always there.
 *
 * The rejection's own `statusMessage` is not read, measured rather than
 * assumed (#46): it is the HTTP reason phrase, which HTTP/2 does not carry at
 * all; over HTTP/1.1 Node fills in the status's default — "Bad Request",
 * "Conflict" — when the server set none, so it can say something nobody wrote
 * for the reader; and when the server did set one, Nitro put the same words
 * in the body, so the phrase never carries anything the body does not.
 * `describeActivationFailure` used to fall back to it and could show an
 * administrator Node's default phrase for a wordless 4xx; it now shows its
 * own fixed copy instead, a case no error this server renders can reach.
 */
export function serverWordsOf(error: unknown): string | undefined {
  const body = fieldOf(error, 'data')
  for (const candidate of [fieldOf(body, 'statusMessage'), fieldOf(body, 'message')]) {
    if (typeof candidate === 'string' && candidate.trim().length > 0)
      return candidate
  }
  return undefined
}

function fieldOf(value: unknown, field: string): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[field] : undefined
}
