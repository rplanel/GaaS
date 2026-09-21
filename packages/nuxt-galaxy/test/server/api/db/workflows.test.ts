import type { H3Event } from 'h3'
import { Context, Data, Effect, Layer } from 'effect'
import { useLogger } from 'evlog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRequestLogger } from '../../setup'

// The real tagged errors this endpoint has to tell apart, restated with the
// shape production gives them: real Error instances, so `Cause.pretty` in the
// 500 branch sees what it would see for real. A renamed tag is caught by
// `vue-tsc` on the handler's own union, not from here.
class GetSupabaseUserError extends Data.TaggedError('GetSupabaseUserError')<{ readonly message: string }> {}
class ForbiddenError extends Data.TaggedError('ForbiddenError')<{ readonly message: string }> {}
class GalaxyServiceUnavailable extends Data.TaggedError('GalaxyServiceUnavailable')<{ readonly message: string }> {}
class InsertWorkflowError extends Data.TaggedError('InsertWorkflowError')<{ readonly message: string }> {}
class WorkflowAlreadyExistsError extends Data.TaggedError('WorkflowAlreadyExistsError')<{
  readonly message: string
  readonly statusCode: number
}> {}

const mockInsertedWorkflow = [{ id: 1, name: 'Test Workflow', galaxy_id: 'galaxy-wf-1' }]

const mocks = vi.hoisted(() => ({
  insertWorkflow: vi.fn(),
  readBody: vi.fn(),
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

// Mock blendtype
vi.mock('blendtype', () => ({
  toGalaxyServiceUnavailable: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  makeGalaxyLayer: vi.fn(() => Layer.empty),
}))

// Mock galaxy utility
vi.mock('../../../../src/runtime/server/utils/galaxy', () => ({
  useGalaxyLayer: vi.fn(() => Layer.empty),
}))

// Mock drizzle
vi.mock('../../../../src/runtime/server/utils/drizzle', () => ({
  Drizzle: MockDrizzle,
}))

// Mock supabase
vi.mock('../../../../src/runtime/server/utils/grizzle/supabase', () => ({
  ServerSupabaseClient: MockServerSupabaseClient,
  ServerSupabaseClaims: MockServerSupabaseClaims,
}))

// Mock insertWorkflow
vi.mock('../../../../src/runtime/server/utils/grizzle/workflows', () => ({
  insertWorkflow: mocks.insertWorkflow,
}))

// Mock h3
vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    readBody: mocks.readBody,
  }
})

const event = { path: '/api/db/workflows', method: 'POST' } as H3Event

async function loadHandler() {
  return (await import('../../../../src/runtime/server/api/db/workflows.post')).default
}

describe('post /api/db/workflows', () => {
  beforeEach(() => {
    // call history outlives a test otherwise, so "inserts nothing" would pass
    // on the calls an earlier test made
    vi.clearAllMocks()
    mocks.insertWorkflow.mockReturnValue(Effect.succeed(mockInsertedWorkflow))
    mocks.readBody.mockResolvedValue({ galaxyId: 'galaxy-wf-1' })
  })

  it('should read body and insert workflow', async () => {
    const handler = await loadHandler()

    expect(await handler(event)).toEqual(mockInsertedWorkflow)
  })

  it('passes only the galaxy identifier on, no longer reading a userId', async () => {
    const handler = await loadHandler()
    await handler(event)

    expect(mocks.insertWorkflow).toHaveBeenCalledWith(
      'galaxy-wf-1',
      expect.any(String),
      expect.any(String),
      event,
    )
  })

  it('refuses an unauthenticated caller with 401, as its siblings do', async () => {
    // the claims branch failing is what "no session" looks like from here; it
    // used to fall through to a 200 with an empty body
    mocks.insertWorkflow.mockReturnValue(
      Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401 })
  })

  it.each([
    ['no body at all', undefined],
    ['a body that is not an object', 'galaxy-wf-1'],
    ['a body with no galaxyId', { userId: 1 }],
    ['a galaxyId that is not a string', { galaxyId: 7 }],
    ['an empty galaxyId', { galaxyId: '   ' }],
  ])('refuses %s with 400 and inserts nothing', async (_label, body) => {
    mocks.readBody.mockResolvedValue(body)
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.insertWorkflow).not.toHaveBeenCalled()
  })

  it('refuses a body that cannot be read at all with 400', async () => {
    mocks.readBody.mockRejectedValue(new Error('Invalid JSON'))
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.insertWorkflow).not.toHaveBeenCalled()
  })

  it('answers 403 when the database refuses the insert', async () => {
    mocks.insertWorkflow.mockReturnValue(
      Effect.fail(new ForbiddenError({ message: 'Permission denied' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('answers 409 when the workflow is already in the database', async () => {
    // the status travels on the error rather than being restated here
    mocks.insertWorkflow.mockReturnValue(
      Effect.fail(new WorkflowAlreadyExistsError({ message: 'already exists', statusCode: 409 })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('answers 503 when Galaxy is unavailable, as the galaxy endpoints do', async () => {
    // insertWorkflow exports the workflow from Galaxy first, so Galaxy being
    // down is a live outcome here and not a fault of this server
    mocks.insertWorkflow.mockReturnValue(
      Effect.fail(new GalaxyServiceUnavailable({ message: 'Galaxy is unavailable' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 503 })
  })

  it('answers 500 for anything else, and says so in the log', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)
    mocks.insertWorkflow.mockReturnValue(
      Effect.fail(new InsertWorkflowError({ message: 'supabase fell over' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 500 })
    expect(requestLog.error).toHaveBeenCalledWith(
      'insert workflow handler failed',
      expect.objectContaining({ cause: expect.stringContaining('supabase fell over') }),
    )
  })
})
