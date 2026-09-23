/**
 * What a reader is told when starting an analysis was refused.
 */
export interface StartAnalysisFailure {
  readonly title: string
  readonly description: string
  /** Whether the reader is offered a way back to the login page. */
  readonly signIn: boolean
}

/**
 * A submission that failed without the server saying anything the reader can
 * act on: a 500, a status with no words of its own, no status at all, or a 200
 * carrying no analysis to navigate to.
 */
export const unexplainedStartAnalysisFailure: StartAnalysisFailure = {
  title: 'Could not start the analysis',
  description: 'Something went wrong on our side. Please try again.',
  signIn: false,
}

/**
 * What a 400 says when the server's words did not arrive: a fixed sentence
 * that sends the reader back to what they submitted rather than telling them
 * to retry it unchanged, which would be refused the same way.
 */
const unexplainedRefusal = 'Check the inputs you selected and submit again.'

/**
 * Turn the refusal `POST /api/db/analyses` rejected with into words for the
 * reader.
 *
 * Takes the rejection itself rather than its status, because one status has
 * words the form does not: a 400 is the server refusing a datamap that cannot
 * start the workflow it names, and it says which input was left out (#43).
 * That sentence is written for a reader — it names the input by the label
 * they saw beside the field — so it is shown as the description under a fixed
 * title. Every other status keeps its fixed copy, and a bare number is read as
 * a status with no words at all.
 *
 * A 403 is not reachable from this endpoint today, but `ForbiddenError` is one
 * of the shared statuses every handler answers the same way (see
 * `toHttpError`), so it is answered here rather than left to collect the
 * "our side" copy, which would be a lie.
 */
export function describeStartAnalysisFailure(refusal: unknown): StartAnalysisFailure {
  const statusCode = typeof refusal === 'number' ? refusal : statusCodeOf(refusal)
  if (statusCode === 400) {
    return {
      title: 'The analysis could not be started as submitted',
      description: serverWordsOf(refusal) ?? unexplainedRefusal,
      signIn: false,
    }
  }
  if (statusCode === 401) {
    return {
      title: 'Your session expired',
      description: 'Sign in again to start this analysis.',
      signIn: true,
    }
  }
  if (statusCode === 403) {
    return {
      title: 'You are not allowed to start this analysis',
      description: 'Ask an administrator for access to this workflow.',
      signIn: false,
    }
  }
  if (statusCode === 404) {
    return {
      title: 'That workflow is no longer available',
      description: 'It may have been deactivated. Reload the page to see the workflows you can still start.',
      signIn: false,
    }
  }
  if (statusCode === 503) {
    return {
      title: 'Galaxy is unavailable right now',
      description: 'Nothing was started. Try again in a few minutes.',
      signIn: false,
    }
  }
  return unexplainedStartAnalysisFailure
}

function statusCodeOf(error: unknown): number | undefined {
  const statusCode = fieldOf(error, 'statusCode')
  return typeof statusCode === 'number' ? statusCode : undefined
}

/**
 * The server's own words, if it had any.
 *
 * Only the JSON body is read. `$fetch` rejects with an ofetch `FetchError`
 * that keeps that body under `data` and sets its own `statusMessage` from the
 * response's reason phrase, which is not the server's sentence: HTTP/2 carries
 * no reason phrase at all, and over HTTP/1.1 Node fills in the status's
 * default one — "Bad Request" — when the server set none, so reading it would
 * show the reader a phrase nobody wrote for them. Nitro's error handler writes
 * the thrown error's `statusMessage` and `message` into the body, which is
 * where `activationFailure.ts` reads them too; that one falls back to the
 * reason phrase, and this one does not, for the reason above.
 */
function serverWordsOf(error: unknown): string | undefined {
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
