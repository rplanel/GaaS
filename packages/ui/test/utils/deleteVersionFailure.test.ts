import { describe, expect, it } from 'vitest'
import { describeDeleteVersionFailure } from '../../app/utils/deleteVersionFailure'

/**
 * What `$fetch` rejects with: the status, and the h3 JSON body under `data`,
 * whose `statusMessage` is where the server's words survive HTTP/2.
 */
function fetchError(statusCode: number, statusMessage?: string) {
  return {
    statusCode,
    statusMessage,
    data: { statusCode, statusMessage },
    message: `[DELETE] "/api/db/workflows/2": ${statusCode} ${statusMessage ?? ''}`,
  }
}

describe('describeDeleteVersionFailure', () => {
  it('shows the 409 sentence pointing at retiring as the server wrote it', () => {
    const sentence = 'Version "0.10" of "satelliteFinder" has analyses and cannot be deleted; retire it instead.'

    expect(describeDeleteVersionFailure(fetchError(409, sentence))).toEqual({
      title: 'Version not deleted',
      description: sentence,
    })
  })

  it('shows any other 4xx\'s sentence as written', () => {
    expect(describeDeleteVersionFailure(fetchError(404, 'No workflow 2 is available'))).toEqual({
      title: 'Version not deleted',
      description: 'No workflow 2 is available',
    })
  })

  it('reads the words from the body, never from the reason phrase', () => {
    const reasonPhraseOnly = { statusCode: 409, statusMessage: 'Conflict', data: { statusCode: 409, statusMessage: '' } }

    expect(describeDeleteVersionFailure(reasonPhraseOnly).description).not.toContain('Conflict')
  })

  it('gives a 401 and a 403 their own wording, since the server\'s would mislead', () => {
    expect(describeDeleteVersionFailure(fetchError(401, 'Unauthorized'))).toEqual({
      title: 'Your session expired',
      description: 'Sign in again to delete this version.',
    })
    expect(describeDeleteVersionFailure(fetchError(403, 'Permission denied'))).toEqual({
      title: 'You are not allowed to delete versions',
      description: 'Ask an administrator for the permission.',
    })
  })

  it.each([
    ['a 500', fetchError(500, 'Internal Server Error')],
    ['a 4xx with no words', fetchError(400)],
    ['no status at all', new TypeError('Failed to fetch')],
  ])('says the fault is on our side for %s', (_label, error) => {
    expect(describeDeleteVersionFailure(error)).toEqual({
      title: 'Version not deleted',
      description: 'Something went wrong on our side. Please try again.',
    })
  })
})
