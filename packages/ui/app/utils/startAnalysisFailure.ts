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
 * act on: a status with no words of its own, or a 200 carrying no analysis to
 * navigate to.
 */
export const unexplainedStartAnalysisFailure: StartAnalysisFailure = {
  title: 'Could not start the analysis',
  description: 'Something went wrong on our side. Please try again.',
  signIn: false,
}

/**
 * Turn the status `POST /api/db/analyses` refused with into words for the
 * reader.
 *
 * A 403 is not reachable from this endpoint today, but `ForbiddenError` is one
 * of the shared statuses every handler answers the same way (see
 * `toHttpError`), so it is answered here rather than left to collect the
 * "our side" copy, which would be a lie.
 */
export function describeStartAnalysisFailure(statusCode: number): StartAnalysisFailure {
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
