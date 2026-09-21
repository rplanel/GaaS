import type { H3Event } from 'h3'
import { Data } from 'effect'
import { useLogger } from 'evlog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toHttpError } from '../../../src/runtime/server/utils/httpError'
import { createMockRequestLogger } from '../setup'

// The tags the helper answers on every handler's behalf, restated with the
// shape production gives them.
class GetSupabaseUserError extends Data.TaggedError('GetSupabaseUserError')<{ readonly message: string }> {}
class ForbiddenError extends Data.TaggedError('ForbiddenError')<{ readonly message: string }> {}
class GalaxyServiceUnavailable extends Data.TaggedError('GalaxyServiceUnavailable')<{ readonly message: string }> {}
class NotFoundError extends Data.TaggedError('NotFoundError')<{ readonly message: string }> {}
class SomethingElseError extends Data.TaggedError('SomethingElseError')<{ readonly message: string }> {}

const event = { path: '/api/db/things', method: 'GET' } as H3Event

describe('toHttpError', () => {
  let requestLog: ReturnType<typeof createMockRequestLogger>

  beforeEach(() => {
    vi.clearAllMocks()
    requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)
  })

  it('answers a caller with no session 401, saying only that', () => {
    // the reason authentication failed is not something to hand back to
    // someone who has not authenticated, so the message is fixed here rather
    // than taken from the error
    expect(() => toHttpError(
      event,
      new GetSupabaseUserError({ message: 'Failed to get auth user: token expired at 12:04' }),
      'list things',
    )).toThrowError(expect.objectContaining({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    }))
  })

  it('answers a refusal 403 and passes the reason on', () => {
    // unlike a 401, a denial reason is actionable: `requireRole` writes one
    // worth reading
    expect(() => toHttpError(
      event,
      new ForbiddenError({ message: 'Forbidden: admin role required' }),
      'list things',
    )).toThrowError(expect.objectContaining({
      statusCode: 403,
      statusMessage: 'Forbidden: admin role required',
    }))
  })

  it('answers 503 when Galaxy is unavailable, without the handler asking', () => {
    // every handler that pipes `toGalaxyServiceUnavailable` can raise this;
    // two of them used to forget it and answered 500
    expect(() => toHttpError(
      event,
      new GalaxyServiceUnavailable({ message: 'Galaxy service is unavailable' }),
      'list things',
    )).toThrowError(expect.objectContaining({
      statusCode: 503,
      statusMessage: 'Galaxy service is unavailable',
    }))
  })

  it('answers a tag the handler maps with that status and the error message', () => {
    expect(() => toHttpError(
      event,
      new NotFoundError({ message: 'Analysis not found' }),
      'sync analysis',
      { statuses: { NotFoundError: 404 } },
    )).toThrowError(expect.objectContaining({
      statusCode: 404,
      statusMessage: 'Analysis not found',
    }))
  })

  it('answers 500 for a tag nobody mapped, and logs the cause under the handler name', () => {
    expect(() => toHttpError(
      event,
      new SomethingElseError({ message: 'the database fell over' }),
      'sync analysis',
    )).toThrowError(expect.objectContaining({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    }))

    expect(requestLog.error).toHaveBeenCalledWith(
      'sync analysis handler failed',
      expect.objectContaining({ cause: expect.stringContaining('the database fell over') }),
    )
  })

  it('keeps the extra context a handler attaches to its 500 log', () => {
    // `sync.post` records which analysis it was; folding the tail must not
    // throw that away
    expect(() => toHttpError(
      event,
      new SomethingElseError({ message: 'boom' }),
      'sync analysis',
      { context: { analysisId: 1 } },
    )).toThrow()

    expect(requestLog.error).toHaveBeenCalledWith(
      'sync analysis handler failed',
      expect.objectContaining({ analysisId: 1, cause: expect.stringContaining('boom') }),
    )
  })

  it('says nothing to the caller about a cause it only logged', () => {
    expect(() => toHttpError(
      event,
      new SomethingElseError({ message: 'connection string user=admin password=hunter2' }),
      'sync analysis',
    )).toThrowError(expect.objectContaining({ statusMessage: 'Internal Server Error' }))
  })

  it('does not let a handler downgrade a shared rule', () => {
    // 401/403/503 are the same answer everywhere by design, so a per-endpoint
    // map cannot quietly disagree with them
    expect(() => toHttpError(
      event,
      new ForbiddenError({ message: 'nope' }),
      'list things',
      { statuses: { ForbiddenError: 418 } as never },
    )).toThrowError(expect.objectContaining({ statusCode: 403 }))
  })

  it('falls back to the standard reason phrase for a failure with no message', () => {
    // Effect's own framework types reach these unions — `Empty` from `Cause`,
    // by way of the config layer — and carry no message. The body must not
    // become the string "undefined".
    const noMessage = { _tag: 'GalaxyServiceUnavailable' } as const

    expect(() => toHttpError(event, noMessage, 'list things'))
      .toThrowError(expect.objectContaining({
        statusCode: 503,
        statusMessage: undefined,
      }))
  })

  it('logs nothing when it answers a status the caller can act on', () => {
    expect(() => toHttpError(
      event,
      new NotFoundError({ message: 'Analysis not found' }),
      'sync analysis',
      { statuses: { NotFoundError: 404 } },
    )).toThrow()

    expect(requestLog.error).not.toHaveBeenCalled()
  })
})
