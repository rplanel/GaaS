import { describe, expect, it } from 'vitest'
import { describeGalaxyReadFailure } from '../../app/utils/galaxyReadFailure'

/** What `$fetch` rejects with: the status, and the h3 JSON body under `data`. */
function fetchError(statusCode: number, statusMessage: string) {
  return {
    statusCode,
    statusMessage,
    data: { statusCode, statusMessage },
    message: `[GET] "/api/galaxy/workflows/abc/versions": ${statusCode} ${statusMessage}`,
  }
}

describe('describeGalaxyReadFailure', () => {
  // #125: the proxies name what Galaxy does not hold, so that is shown as
  // the server wrote it
  it('shows a 4xx refusal as the server wrote it', () => {
    expect(describeGalaxyReadFailure(fetchError(404, 'Galaxy holds no revision 4 of stored workflow abc')))
      .toBe('Galaxy holds no revision 4 of stored workflow abc')
  })

  it('says Galaxy is unavailable, and to try later, for a 503', () => {
    expect(describeGalaxyReadFailure(fetchError(503, 'Galaxy service is unavailable')))
      .toBe('Galaxy is unavailable right now. Try again in a few minutes.')
  })

  // a 500's words are the reason phrase `toHttpError` writes, which tells an
  // administrator nothing; the cause is in the server's log
  it('gives its own sentence for a 500 rather than the bare reason phrase', () => {
    expect(describeGalaxyReadFailure(fetchError(500, 'Internal Server Error')))
      .toBe('Something went wrong on our side. Please try again.')
  })

  // a fetch that never reached the server rejects with a bare `TypeError`,
  // no status and no body
  it('gives the same sentence when the request never reached the server', () => {
    expect(describeGalaxyReadFailure(new TypeError('fetch failed')))
      .toBe('Something went wrong on our side. Please try again.')
  })

  it('gives the same sentence for a 4xx with no words of its own', () => {
    expect(describeGalaxyReadFailure({ statusCode: 404, data: { statusCode: 404, statusMessage: '' } }))
      .toBe('Something went wrong on our side. Please try again.')
  })
})
