import { describe, expect, it } from 'vitest'
import { describeActiveSwitchFailure } from '../../app/utils/activeSwitchFailure'

/**
 * What `$fetch` rejects with: the status, and the h3 JSON body under `data`,
 * whose `statusMessage` is where the server's words survive HTTP/2.
 */
function fetchError(statusCode: number, statusMessage?: string) {
  return {
    statusCode,
    statusMessage,
    data: { statusCode, statusMessage },
    message: `[PATCH] "/api/db/workflows/2": ${statusCode} ${statusMessage ?? ''}`,
  }
}

describe('describeActiveSwitchFailure', () => {
  it('names what was attempted in the title: retiring, or making active again', () => {
    expect(describeActiveSwitchFailure(fetchError(404, 'No workflow 2 is available'), false).title).toBe('Version not retired')
    expect(describeActiveSwitchFailure(fetchError(404, 'No workflow 2 is available'), true).title).toBe('Version not made active again')
  })

  it('shows a 4xx\'s sentence as the server wrote it', () => {
    expect(describeActiveSwitchFailure(fetchError(404, 'No workflow 2 is available'), false)).toEqual({
      title: 'Version not retired',
      description: 'No workflow 2 is available',
    })
  })

  it('reads the words from the body, never from the reason phrase', () => {
    const reasonPhraseOnly = { statusCode: 404, statusMessage: 'Not Found', data: { statusCode: 404, statusMessage: '' } }

    expect(describeActiveSwitchFailure(reasonPhraseOnly, false).description).not.toContain('Not Found')
  })

  it('gives a 401 and a 403 their own wording, since the server\'s would mislead', () => {
    expect(describeActiveSwitchFailure(fetchError(401, 'Unauthorized'), false)).toEqual({
      title: 'Your session expired',
      description: 'Sign in again to retire this version.',
    })
    expect(describeActiveSwitchFailure(fetchError(401, 'Unauthorized'), true).description).toBe('Sign in again to make this version active again.')
    expect(describeActiveSwitchFailure(fetchError(403, 'Permission denied'), false)).toEqual({
      title: 'You are not allowed to retire versions',
      description: 'Ask an administrator for the permission.',
    })
  })

  it.each([
    ['a 500', fetchError(500, 'Internal Server Error')],
    ['a 4xx with no words', fetchError(400)],
    ['no status at all', new TypeError('Failed to fetch')],
  ])('says the fault is on our side for %s', (_label, error) => {
    expect(describeActiveSwitchFailure(error, false)).toEqual({
      title: 'Version not retired',
      description: 'Something went wrong on our side. Please try again.',
    })
  })
})
