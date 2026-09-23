import { describe, expect, it } from 'vitest'
import { describeStartAnalysisFailure } from '../../app/utils/startAnalysisFailure'

/**
 * What `$fetch` rejects with. The `statusMessage` on the error itself is the
 * HTTP reason phrase — Node's default for the status when the server set none,
 * and absent over HTTP/2 — so the server's own words are the ones in the JSON
 * body under `data`.
 */
function fetchError(statusCode: number, body: Record<string, unknown> | undefined, reasonPhrase = 'Bad Request') {
  return {
    statusCode,
    statusMessage: reasonPhrase,
    data: body,
    message: `[POST] "/api/db/analyses": ${statusCode} ${reasonPhrase}`,
  }
}

describe('describeStartAnalysisFailure', () => {
  it('tells a caller whose session has gone to sign in again', () => {
    const described = describeStartAnalysisFailure(401)

    expect(described.title).toBe('Your session expired')
    expect(described.description).toBe('Sign in again to start this analysis.')
    expect(described.signIn).toBe(true)
  })

  it('names the workflow as the problem when it no longer exists', () => {
    const described = describeStartAnalysisFailure(404)

    expect(described.title).toBe('That workflow is no longer available')
    expect(described.signIn).toBe(false)
  })

  it('points at Galaxy rather than the reader when Galaxy is unwell', () => {
    const described = describeStartAnalysisFailure(503)

    expect(described.title).toBe('Galaxy is unavailable right now')
    expect(described.signIn).toBe(false)
  })

  it('does not invite a signed-in but unpermitted reader to sign in again', () => {
    const described = describeStartAnalysisFailure(403)

    expect(described.title).toBe('You are not allowed to start this analysis')
    // the session is fine; offering the login page would send them in a circle
    expect(described.signIn).toBe(false)
  })

  // `toHttpError` logs the cause and sends a bare 500, so there is nothing
  // here the reader can act on beyond trying again
  it('owns the failure when the server would not say why', () => {
    const described = describeStartAnalysisFailure(500)

    expect(described.title).toBe('Could not start the analysis')
    expect(described.signIn).toBe(false)
  })

  // the destructure `const { id } = await $fetch(...)` throws a bare
  // `TypeError`, which carries no status at all
  it('still says something for a status it has no words for', () => {
    const described = describeStartAnalysisFailure(418)

    expect(described.title).toBe('Could not start the analysis')
    expect(described.description).not.toBe('')
  })

  // #46. #43 gave the server something specific to say when the datamap
  // cannot start the workflow it names, and the form threw it away.
  describe('a submission the server refused with words of its own', () => {
    const words = 'No dataset was provided for the input "Input FASTQ"'

    it('shows the reader what the server said, under a title that does not blame the server', () => {
      const described = describeStartAnalysisFailure(
        fetchError(400, { statusCode: 400, statusMessage: words }),
      )

      expect(described.description).toBe(words)
      expect(described.title).not.toBe('Could not start the analysis')
      expect(described.title.toLowerCase()).not.toContain('our side')
      // the session is fine; offering the login page would send them in a circle
      expect(described.signIn).toBe(false)
    })

    it('does not show the reader the reason phrase when the body carried no words', () => {
      // Node fills in "Bad Request" for a 400 whose server set no reason
      // phrase, so the error's own `statusMessage` says something the server
      // never wrote; nothing in this layer reads it (#63), and this pins that
      const described = describeStartAnalysisFailure(
        fetchError(400, { statusCode: 400, statusMessage: '' }, 'Bad Request'),
      )

      expect(described.description).not.toBe('Bad Request')
      expect(described.description).toBe('Check the inputs you selected and submit again.')
    })

    it('still tells the reader what to do when the words were only in `message`', () => {
      const described = describeStartAnalysisFailure(
        fetchError(400, { statusCode: 400, message: words }),
      )

      expect(described.description).toBe(words)
    })

    it('still gives a complete title and description when the 400 carried no usable words', () => {
      for (const refusal of [
        fetchError(400, undefined),
        fetchError(400, { statusCode: 400, statusMessage: '' }),
        fetchError(400, { statusCode: 400, statusMessage: '   ' }),
      ]) {
        const described = describeStartAnalysisFailure(refusal)

        expect(described.title).not.toBe('')
        expect(described.description).not.toBe('')
        // nothing went wrong on our side, and the same submission would be
        // refused the same way
        expect(described.description.toLowerCase()).not.toContain('our side')
        expect(described.description.toLowerCase()).not.toContain('try again')
        expect(described.signIn).toBe(false)
      }
    })

    it('does not repeat the server for a status that has its own copy', () => {
      // a 503 carries its cause's message — "The analysis could not be
      // prepared on Galaxy" — and the fixed copy is still what the reader gets
      const described = describeStartAnalysisFailure(
        fetchError(503, { statusCode: 503, statusMessage: 'The analysis could not be prepared on Galaxy' }, 'Service Unavailable'),
      )

      expect(described.title).toBe('Galaxy is unavailable right now')
      expect(described.description).toBe('Nothing was started. Try again in a few minutes.')
    })

    it('still says something for an error that carries no status at all', () => {
      const described = describeStartAnalysisFailure(new TypeError('Failed to fetch'))

      expect(described.title).toBe('Could not start the analysis')
      expect(described.description).not.toBe('')
    })
  })
})
