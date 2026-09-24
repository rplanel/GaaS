import { serverWordsOf, statusCodeOf } from './serverRefusal'

/**
 * What an administrator is told when publishing a version was refused.
 */
export interface PublishFailure {
  readonly title: string
  readonly description: string
}

/**
 * A publish that failed without the server saying anything the administrator
 * can act on: a 500, a status with no words of its own, or no status at all.
 */
export const unexplainedPublishFailure: PublishFailure = {
  title: 'Could not publish the version',
  description: 'Something went wrong on our side. Please try again.',
}

/**
 * Turn the failure `POST /api/db/workflows` rejected with into words for the
 * administrator, read in the publish dialog.
 *
 * Every refusal the endpoint answers names what the administrator can change
 * in the dialog: a name or a label that cannot name a results view directory
 * (400), a label already used for the name, a revision already published or a
 * name that differs from the lineage (409, ADR 0004). So every 4xx that comes
 * with a message is shown as the server wrote it, and only the statuses whose
 * message would mislead (a bare "Unauthorized", a database "Permission
 * denied") get their own wording.
 *
 * The words are the ones in the JSON body, read through `serverWordsOf`. The
 * rejection's own `statusMessage`, the HTTP reason phrase, is never read
 * (#63): a 4xx with no words in the body gets the fixed copy below, and since
 * Nitro writes a `statusMessage` into every error body it renders, no refusal
 * this server produces reaches that case.
 */
export function describePublishFailure(error: unknown): PublishFailure {
  const statusCode = statusCodeOf(error)
  if (statusCode === 401) {
    return {
      title: 'Your session expired',
      description: 'Sign in again to publish this version.',
    }
  }
  if (statusCode === 403) {
    return {
      title: 'You are not allowed to publish versions',
      description: 'Ask an administrator for the permission.',
    }
  }
  if (statusCode === 503) {
    return {
      title: 'Galaxy is unavailable right now',
      description: 'Nothing was published. Try again in a few minutes.',
    }
  }
  const words = serverWordsOf(error)
  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500 && words !== undefined) {
    return {
      title: 'Version not published',
      description: words,
    }
  }
  return unexplainedPublishFailure
}
