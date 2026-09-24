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
class UpdateWorkflowError extends Data.TaggedError('UpdateWorkflowError')<{ readonly message: string }> {}
class GalaxyUserNotFoundError extends Data.TaggedError('GalaxyUserNotFoundError')<{ readonly message: string }> {}

/** The version row the update answers with, which is the endpoint's 200 body. */
const retiredVersion = { id: 7, name: 'Satellite Finder', galaxy_id: 'galaxy-wf-1', name_key: 'satelliteFinder', version_key: '0.11', revision: 3, active: false }

const mocks = vi.hoisted(() => ({
  setVersionActive: vi.fn(),
  readBody: vi.fn(),
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

// Mock setVersionActive
vi.mock('../../../../src/runtime/server/utils/grizzle/workflows', () => ({
  setVersionActive: mocks.setVersionActive,
}))

// Mock h3
vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    readBody: mocks.readBody,
    getRouterParam: mocks.getRouterParam,
  }
})

const event = { path: '/api/db/workflows/7', method: 'PATCH' } as H3Event

async function loadHandler() {
  return (await import('../../../../src/runtime/server/api/db/workflows/[workflowId].patch')).default
}

describe('patch /api/db/workflows/:workflowId', () => {
  beforeEach(() => {
    // call history outlives a test otherwise, so "writes nothing" would pass
    // on the calls an earlier test made
    vi.clearAllMocks()
    mocks.setVersionActive.mockReturnValue(Effect.succeed(retiredVersion))
    mocks.readBody.mockResolvedValue({ active: false })
    mocks.getRouterParam.mockImplementation((_event: unknown, param: string) => param === 'workflowId' ? '7' : undefined)
  })

  it('reads the version and the body, retires, and answers with the row as written', async () => {
    const handler = await loadHandler()

    expect(await handler(event)).toEqual(retiredVersion)
    expect(mocks.setVersionActive).toHaveBeenCalledWith(7, false, event)
  })

  it('makes a version active again the same way', async () => {
    mocks.readBody.mockResolvedValue({ active: true })
    mocks.setVersionActive.mockReturnValue(Effect.succeed({ ...retiredVersion, active: true }))
    const handler = await loadHandler()

    expect(await handler(event)).toEqual({ ...retiredVersion, active: true })
    expect(mocks.setVersionActive).toHaveBeenCalledWith(7, true, event)
  })

  it.each([
    ['a word', 'abc'],
    ['a negative number', '-1'],
    ['a fraction', '1.5'],
  ])('answers 404 for %s in place of the version id, before the body is read', async (_label, workflowId) => {
    // the segment names no version, so it gets the answer a version nobody
    // can act on gets, as `[analysisId].delete` does for its own id
    mocks.getRouterParam.mockReturnValue(workflowId)
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.readBody).not.toHaveBeenCalled()
    expect(mocks.setVersionActive).not.toHaveBeenCalled()
  })

  it.each([
    ['no body at all', undefined],
    ['a body that is not an object', 'false'],
    ['a body with no active', {}],
    ['an active that is not a boolean', { active: 'false' }],
  ])('refuses %s with 400 and writes nothing', async (_label, input) => {
    mocks.readBody.mockResolvedValue(input)
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('active'),
    })
    expect(mocks.setVersionActive).not.toHaveBeenCalled()
  })

  it('refuses a body that cannot be read at all with 400', async () => {
    mocks.readBody.mockRejectedValue(new Error('Invalid JSON'))
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.setVersionActive).not.toHaveBeenCalled()
  })

  it('refuses an unauthenticated caller with 401, as its siblings do', async () => {
    mocks.setVersionActive.mockReturnValue(
      Effect.fail(new GetSupabaseUserError({ message: 'Failed to get auth user: token expired' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  })

  it('answers 404 for a version the caller named that does not exist', async () => {
    mocks.setVersionActive.mockReturnValue(
      Effect.fail(new WorkflowNotFoundError({ message: 'No workflow 7 is available' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'No workflow 7 is available',
    })
  })

  it('answers 403 when the database refuses the update', async () => {
    mocks.setVersionActive.mockReturnValue(
      Effect.fail(new ForbiddenError({ message: 'Permission denied' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403, statusMessage: 'Permission denied' })
  })

  it('logs and answers 500 when a bug travels with a refusal, rather than answering the refusal', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)
    mocks.setVersionActive.mockReturnValue(Effect.failCause(Cause.sequential(
      Cause.fail(new WorkflowNotFoundError({ message: 'No workflow 7 is available' })),
      Cause.die(new TypeError('boom: a real bug')),
    )))
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 500 })
    expect(requestLog.error).toHaveBeenCalledWith(
      'retire version handler failed',
      expect.objectContaining({ cause: expect.stringContaining('boom: a real bug') }),
    )
  })

  // #33. An unseeded database is nothing the caller can act on, so the tag
  // stays unmapped here and falls to the logged 500.
  it.each([
    ['this deployment has no Galaxy user row', new GalaxyUserNotFoundError({ message: 'No Galaxy user registered for admin@example.org at https://galaxy.example.com' })],
    ['the update failed for a reason of its own', new UpdateWorkflowError({ message: 'supabase fell over' })],
  ])('answers 500 when %s, and says so in the log', async (_label, error) => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)
    mocks.setVersionActive.mockReturnValue(Effect.fail(error))
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    })
    expect(requestLog.error).toHaveBeenCalledWith(
      'retire version handler failed',
      expect.objectContaining({ cause: expect.stringContaining(error.message) }),
    )
  })
})
