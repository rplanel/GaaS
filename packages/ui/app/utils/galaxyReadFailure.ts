import { serverWordsOf, statusCodeOf } from '#imports'

/**
 * Turn the failure a Galaxy read rejected with into a sentence for the
 * administrator, read in the publish dialog under the revision picker: the
 * revisions list and the tool check (#125).
 *
 * A 4xx is shown as the server wrote it: the proxies name what Galaxy does
 * not hold. A 503 gets its own wording, since what to do about it is wait.
 * Anything else — a 500, whose only words are the reason phrase
 * `toHttpError` writes while the cause goes to the log, or a request that
 * never reached the server and so carries no status at all — gets the fixed
 * sentence below. The words are read through `serverWordsOf`, never off the
 * rejection's `message`, which is ofetch's and names the method, the path and
 * the status.
 */
export function describeGalaxyReadFailure(error: unknown): string {
  const statusCode = statusCodeOf(error)
  if (statusCode === 503)
    return 'Galaxy is unavailable right now. Try again in a few minutes.'
  const words = serverWordsOf(error)
  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500 && words !== undefined)
    return words
  return 'Something went wrong on our side. Please try again.'
}
