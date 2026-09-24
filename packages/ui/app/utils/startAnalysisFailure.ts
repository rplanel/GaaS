import { serverWordsOf, statusCodeOf } from './serverRefusal'

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
 * a status with no words at all. The words are read from the JSON body alone,
 * through `serverWordsOf`, which says why the reason phrase is never read.
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
      description: 'It may have been retired. Reload the page to see the workflows you can still start.',
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
