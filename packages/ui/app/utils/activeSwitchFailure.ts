import { serverWordsOf, statusCodeOf } from '#imports'

/**
 * What an administrator is told when retiring a version, or making it active
 * again, was refused.
 */
export interface ActiveSwitchFailure {
  readonly title: string
  readonly description: string
}

/** What was attempted, in the glossary's words, for the title and the copy. */
function attempt(active: boolean) {
  return active
    ? { title: 'Version not made active again', act: 'make this version active again' }
    : { title: 'Version not retired', act: 'retire this version' }
}

/**
 * Turn the failure `PATCH /api/db/workflows/:id` rejected with into words for
 * the administrator, read in a toast beside the Active switch (#71).
 *
 * Every refusal the endpoint answers with a sentence names something the
 * administrator can read as is: a version that no longer exists (404), a body
 * the switch could not have sent (400). So every 4xx that comes with words is
 * shown as the server wrote them, and only the statuses whose message would
 * mislead, a bare "Unauthorized" or a database "Permission denied", get their
 * own wording. The words are read from the JSON body alone, through
 * `serverWordsOf`, which says why the reason phrase is never read (#63).
 */
export function describeActiveSwitchFailure(error: unknown, active: boolean): ActiveSwitchFailure {
  const { title, act } = attempt(active)
  const statusCode = statusCodeOf(error)
  if (statusCode === 401) {
    return {
      title: 'Your session expired',
      description: `Sign in again to ${act}.`,
    }
  }
  if (statusCode === 403) {
    return {
      title: 'You are not allowed to retire versions',
      description: 'Ask an administrator for the permission.',
    }
  }
  const words = serverWordsOf(error)
  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500 && words !== undefined) {
    return { title, description: words }
  }
  return { title, description: 'Something went wrong on our side. Please try again.' }
}
