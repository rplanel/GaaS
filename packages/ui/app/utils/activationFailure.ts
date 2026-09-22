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

function statusCodeOf(error: unknown): number | undefined {
  const statusCode = fieldOf(error, 'statusCode')
  return typeof statusCode === 'number' ? statusCode : undefined
}

/**
 * The server's own words, if it had any.
 *
 * The JSON body h3 sends is read first: `$fetch` keeps it under `data`, and it
 * is the only place the message survives HTTP/2, which drops the reason phrase
 * the error's own `statusMessage` is read from.
 */
function serverWordsOf(error: unknown): string | undefined {
  for (const candidate of [fieldOf(fieldOf(error, 'data'), 'statusMessage'), fieldOf(error, 'statusMessage')]) {
    if (typeof candidate === 'string' && candidate.trim().length > 0)
      return candidate
  }
  return undefined
}

function fieldOf(value: unknown, field: string): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[field] : undefined
}
