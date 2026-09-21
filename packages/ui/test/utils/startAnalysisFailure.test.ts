import { describe, expect, it } from 'vitest'
import { describeStartAnalysisFailure } from '../../app/utils/startAnalysisFailure'

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
})
