import { describe, expect, it } from 'vitest'
import { describeActivationFailure } from '../../app/utils/activationFailure'

/**
 * What `$fetch` rejects with: the status, and the h3 JSON body under `data`,
 * whose `statusMessage` is where the server's words survive HTTP/2, which
 * drops the reason phrase `statusMessage` on the error itself is read from.
 */
function fetchError(statusCode: number, statusMessage?: string) {
  return {
    statusCode,
    statusMessage,
    data: { statusCode, statusMessage },
    message: `[POST] "/api/db/workflows": ${statusCode} ${statusMessage ?? ''}`,
  }
}

describe('describeActivationFailure', () => {
  it('repeats the server\'s words for a tag value that cannot name a directory', () => {
    const message = 'The `name:` tag value `nf-core/epitopeprediction` cannot name a results view directory.'

    const described = describeActivationFailure(fetchError(422, message))

    expect(described.title).toBe('Workflow not activated')
    expect(described.description).toBe(message)
  })

  it('reads the words from the body when the reason phrase was dropped, as it is over HTTP/2', () => {
    const message = 'The `version:` tag value `1.0+galaxy1` cannot name a results view directory.'

    const described = describeActivationFailure({
      statusCode: 422,
      statusMessage: '',
      data: { statusCode: 422, statusMessage: message },
    })

    expect(described.description).toBe(message)
  })

  it('repeats the server\'s words for any other refusal it can act on, such as a duplicate', () => {
    const described = describeActivationFailure(fetchError(409, 'Workflow galaxy-wf-1 already exists in the database'))

    expect(described.title).toBe('Workflow not activated')
    expect(described.description).toBe('Workflow galaxy-wf-1 already exists in the database')
  })

  it('tells a caller whose session has gone to sign in again', () => {
    const described = describeActivationFailure(fetchError(401, 'Unauthorized'))

    expect(described.title).toBe('Your session expired')
    expect(described.description).toBe('Sign in again to activate this workflow.')
  })

  it('does not blame the reader\'s words for a permission refusal', () => {
    const described = describeActivationFailure(fetchError(403, 'Permission denied'))

    expect(described.title).toBe('You are not allowed to activate workflows')
    expect(described.description).toBe('Ask an administrator for the permission.')
  })

  it('points at Galaxy rather than the reader when Galaxy is unwell', () => {
    const described = describeActivationFailure(fetchError(503, 'Galaxy is unavailable'))

    expect(described.title).toBe('Galaxy is unavailable right now')
    expect(described.description).toBe('Nothing was activated. Try again in a few minutes.')
  })

  // `toHttpError` logs the cause and sends a bare 500, so there is nothing
  // here the reader can act on beyond trying again
  it('owns the failure when the server would not say why', () => {
    const described = describeActivationFailure(fetchError(500, 'Internal Server Error'))

    expect(described.title).toBe('Could not activate the workflow')
    expect(described.description).toBe('Something went wrong on our side. Please try again.')
  })

  it('owns a refusal that arrived with no words at all', () => {
    const described = describeActivationFailure(fetchError(400))

    expect(described.title).toBe('Could not activate the workflow')
    expect(described.description).toBe('Something went wrong on our side. Please try again.')
  })

  it('still says something for an error that carries no status', () => {
    const described = describeActivationFailure(new TypeError('Failed to fetch'))

    expect(described.title).toBe('Could not activate the workflow')
    expect(described.description).not.toBe('')
  })
})
