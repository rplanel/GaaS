import { serverWordsOf, statusCodeOf } from './serverRefusal'

/**
 * What an administrator is told when activating a workflow was refused.
 */
export interface ActivationFailure {
  readonly title: string
  readonly description: string
}

/**
 * An activation that failed without the server saying anything the
 * administrator can act on: a 500, a status with no words of its own, or no
 * status at all.
 */
export const unexplainedActivationFailure: ActivationFailure = {
  title: 'Could not activate the workflow',
  description: 'Something went wrong on our side. Please try again.',
}

/**
 * Turn the failure `POST /api/db/workflows` rejected with into words for the
 * administrator.
 *
 * Unlike starting an analysis, most refusals here carry words worth repeating
 * verbatim: a tag value that cannot name a results view directory names the
 * tag and the value (#50), and a duplicate names the workflow. So every 4xx
 * that comes with a message is shown as the server wrote it, and only the
 * statuses whose message would mislead (a bare "Unauthorized", a database
 * "Permission denied") get their own wording.
 *
 * The words are the ones in the JSON body, read through `serverWordsOf`. This
 * used to fall back to the rejection's own `statusMessage`, the HTTP reason
 * phrase, when the body had none, which could show an administrator Node's
 * default phrase for the status — "Conflict" — as if the server had written
 * it. It no longer does (#63): a 4xx with no words in the body gets the
 * fixed copy below, and since Nitro writes a `statusMessage` into every error
 * body it renders, no refusal this server produces reaches that case.
 */
export function describeActivationFailure(error: unknown): ActivationFailure {
  const statusCode = statusCodeOf(error)
  if (statusCode === 401) {
    return {
      title: 'Your session expired',
      description: 'Sign in again to activate this workflow.',
    }
  }
  if (statusCode === 403) {
    return {
      title: 'You are not allowed to activate workflows',
      description: 'Ask an administrator for the permission.',
    }
  }
  if (statusCode === 503) {
    return {
      title: 'Galaxy is unavailable right now',
      description: 'Nothing was activated. Try again in a few minutes.',
    }
  }
  const words = serverWordsOf(error)
  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500 && words !== undefined) {
    return {
      title: 'Workflow not activated',
      description: words,
    }
  }
  return unexplainedActivationFailure
}
