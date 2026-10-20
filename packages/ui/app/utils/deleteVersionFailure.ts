import { serverWordsOf, statusCodeOf } from '#imports'

/**
 * What an administrator is told when deleting a version was refused.
 */
export interface DeleteVersionFailure {
  readonly title: string
  readonly description: string
}

/**
 * Turn the failure `DELETE /api/db/workflows/:id` rejected with into words
 * for the administrator, read in the confirmation dialog (#72).
 *
 * The refusal that matters here is the 409: the version has analyses, and the
 * server's sentence already points at retiring, so it is shown as written.
 * Every other 4xx that comes with words is shown as written too (a version
 * that no longer exists, 404); only the statuses whose message would mislead,
 * a bare "Unauthorized" or a database "Permission denied", get their own
 * wording. The words are read from the JSON body alone, through
 * `serverWordsOf`, which says why the reason phrase is never read (#63).
 */
export function describeDeleteVersionFailure(error: unknown): DeleteVersionFailure {
  const statusCode = statusCodeOf(error)
  if (statusCode === 401) {
    return {
      title: 'Your session expired',
      description: 'Sign in again to delete this version.',
    }
  }
  if (statusCode === 403) {
    return {
      title: 'You are not allowed to delete versions',
      description: 'Ask an administrator for the permission.',
    }
  }
  const words = serverWordsOf(error)
  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500 && words !== undefined) {
    return { title: 'Version not deleted', description: words }
  }
  return { title: 'Version not deleted', description: 'Something went wrong on our side. Please try again.' }
}
