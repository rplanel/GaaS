import type { H3Event } from 'h3'
import { Cause, Context, Data, Effect, Layer } from 'effect'
import { useLogger } from 'evlog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRequestLogger } from '../../setup'

// The real tagged errors this endpoint has to tell apart, restated with the
// shape production gives them. A renamed tag is caught by `vue-tsc` on the
// handler's own union, not from here.
class GetSupabaseUserError extends Data.TaggedError('GetSupabaseUserError')<{ readonly message: string }> {}
class ForbiddenError extends Data.TaggedError('ForbiddenError')<{ readonly message: string }> {}
class WorkflowNotFoundError extends Data.TaggedError('WorkflowNotFoundError')<{ readonly message: string }> {}
class WorkflowReferencedError extends Data.TaggedError('WorkflowReferencedError')<{ readonly message: string }> {}
class DeleteWorkflowError extends Data.TaggedError('DeleteWorkflowError')<{ readonly message: string }> {}
class GalaxyUserNotFoundError extends Data.TaggedError('GalaxyUserNotFoundError')<{ readonly message: string }> {}

/** The version row the delete answers with, which is the endpoint's 200 body: the row that is gone. */
const deletedVersion = { id: 7, name: 'Satellite Finder', galaxy_id: 'galaxy-wf-1', name_key: 'satelliteFinder', version_key: '0.11', revision: 3, active: true }

const mocks = vi.hoisted(() => ({
  deleteVersion: vi.fn(),
  getRouterParam: vi.fn(),
}))

// Define mock service classes at top-level (before vi.mock hoisting)
class MockDrizzle extends Context.Tag('@nuxt-galaxy/Drizzle')<MockDrizzle, any>() {
  static readonly Live = Layer.succeed(MockDrizzle, {})
}

class MockServerSupabaseClient extends Context.Tag('@nuxt-galaxy/ServerSupabaseClient')<MockServerSupabaseClient, any>() {
  static readonly Live = Layer.succeed(MockServerSupabaseClient, () => Effect.succeed({}))
}

class MockServerSupabaseClaims extends Context.Tag('@nuxt-galaxy/ServerSupabaseClaims')<MockServerSupabaseClaims, any>() {
  static readonly Live = Layer.succeed(MockServerSupabaseClaims, () => Effect.succeed(null))
}

// Mock drizzle
vi.mock('../../../../src/runtime/server/utils/drizzle', () => ({
  Drizzle: MockDrizzle,
}))

// Mock supabase
vi.mock('../../../../src/runtime/server/utils/grizzle/supabase', () => ({
  ServerSupabaseClient: MockServerSupabaseClient,
  ServerSupabaseClaims: MockServerSupabaseClaims,
}))

// Mock deleteVersion
vi.mock('../../../../src/runtime/server/utils/grizzle/workflows', () => ({
  deleteVersion: mocks.deleteVersion,
}))

// Mock h3
vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    getRouterParam: mocks.getRouterParam,
  }
})

const event = { path: '/api/db/workflows/7', method: 'DELETE' } as H3Event

async function loadHandler() {
  return (await import('../../../../src/runtime/server/api/db/workflows/[workflowId].delete')).default
}

describe('delete /api/db/workflows/:workflowId', () => {
  beforeEach(() => {
    // call history outlives a test otherwise, so "deletes nothing" would pass
    // on the calls an earlier test made
    vi.clearAllMocks()
    mocks.deleteVersion.mockReturnValue(Effect.succeed(deletedVersion))
    mocks.getRouterParam.mockImplementation((_event: unknown, param: string) => param === 'workflowId' ? '7' : undefined)
  })

  it('deletes the version the path names and answers with the row that is gone', async () => {
    const handler = await loadHandler()

    expect(await handler(event)).toEqual(deletedVersion)
    expect(mocks.deleteVersion).toHaveBeenCalledWith(7, event)
  })

  it.each([
    ['a word', 'abc'],
    ['a negative number', '-1'],
    ['a fraction', '1.5'],
  ])('answers 404 for %s in place of the version id, and deletes nothing', async (_label, workflowId) => {
    // the segment names no version, so it gets the answer a version nobody
    // can act on gets, as its PATCH sibling does
    mocks.getRouterParam.mockReturnValue(workflowId)
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.deleteVersion).not.toHaveBeenCalled()
  })

  it('refuses an unauthenticated caller with 401, as its siblings do', async () => {
    mocks.deleteVersion.mockReturnValue(
      Effect.fail(new GetSupabaseUserError({ message: 'Failed to get auth user: token expired' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  })

  it('answers 404 for a version the caller named that does not exist', async () => {
    mocks.deleteVersion.mockReturnValue(
      Effect.fail(new WorkflowNotFoundError({ message: 'No workflow 7 is available' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'No workflow 7 is available',
    })
  })

  it('answers 403 when the database refuses the delete', async () => {
    mocks.deleteVersion.mockReturnValue(
      Effect.fail(new ForbiddenError({ message: 'Permission denied' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403, statusMessage: 'Permission denied' })
  })

  // The sentence points at retiring, the act that is allowed instead, so its
  // words have to reach the administrator rather than be swapped for a
  // reason phrase.
  it('answers 409 with the error\'s own words when analyses reference the version', async () => {
    const message = 'Version "0.11" of "satelliteFinder" has analyses and cannot be deleted; retire it instead.'
    mocks.deleteVersion.mockReturnValue(Effect.fail(new WorkflowReferencedError({ message })))
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: message,
    })
  })

  it('logs and answers 500 when a bug travels with a refusal, rather than answering the refusal', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)
    mocks.deleteVersion.mockReturnValue(Effect.failCause(Cause.sequential(
      Cause.fail(new WorkflowNotFoundError({ message: 'No workflow 7 is available' })),
      Cause.die(new TypeError('boom: a real bug')),
    )))
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 500 })
    expect(requestLog.error).toHaveBeenCalledWith(
      'delete version handler failed',
      expect.objectContaining({ cause: expect.stringContaining('boom: a real bug') }),
    )
  })

  // #33. An unseeded database is nothing the caller can act on, so the tag
  // stays unmapped here and falls to the logged 500.
  it.each([
    ['this deployment has no Galaxy user row', new GalaxyUserNotFoundError({ message: 'No Galaxy user registered for admin@example.org at https://galaxy.example.com' })],
    ['the delete failed for a reason of its own', new DeleteWorkflowError({ message: 'supabase fell over' })],
  ])('answers 500 when %s, and says so in the log', async (_label, error) => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)
    mocks.deleteVersion.mockReturnValue(Effect.fail(error))
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    })
    expect(requestLog.error).toHaveBeenCalledWith(
      'delete version handler failed',
      expect.objectContaining({ cause: expect.stringContaining(error.message) }),
    )
  })
})
