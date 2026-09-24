import type { H3Event } from 'h3'
import { Cause, Context, Data, Effect, Layer } from 'effect'
import { useLogger } from 'evlog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRequestLogger } from '../../setup'

// The real tagged errors this endpoint has to tell apart, restated with the
// shape production gives them. A renamed tag is caught by `vue-tsc` on the
// handler's own union, not from here.
class GetSupabaseUserError extends Data.TaggedError('GetSupabaseUserError')<{ readonly message: string }> {}
class WorkflowNotFoundError extends Data.TaggedError('WorkflowNotFoundError')<{ readonly message: string }> {}
class GalaxyUserNotFoundError extends Data.TaggedError('GalaxyUserNotFoundError')<{ readonly message: string }> {}
class GalaxyServiceUnavailable extends Data.TaggedError('GalaxyServiceUnavailable')<{ readonly message: string }> {}
class WorkflowError extends Data.TaggedError('WorkflowError')<{ readonly message: string, readonly statusCode?: number }> {}

/** The version row the read answers with, as drizzle selects it. */
const versionRow = { id: 7, name: 'Satellite Finder', galaxyId: 'galaxy-wf-1', nameKey: 'satelliteFinder', versionKey: '0.11', revision: 3, revisionUuid: 'fa95ecd4-ed11-49e2-b3d6-8f178b807256', active: true }

const mocks = vi.hoisted(() => ({
  getWorkflowEffect: vi.fn(),
  versionStateEffect: vi.fn(),
  getRouterParam: vi.fn(),
  claims: vi.fn(),
}))

// Define mock service classes at top-level (before vi.mock hoisting)
class MockDrizzle extends Context.Tag('@nuxt-galaxy/Drizzle')<MockDrizzle, any>() {
  static readonly Live = Layer.succeed(MockDrizzle, {})
}

class MockServerSupabaseClient extends Context.Tag('@nuxt-galaxy/ServerSupabaseClient')<MockServerSupabaseClient, any>() {
  static readonly Live = Layer.succeed(MockServerSupabaseClient, () => Effect.succeed({}))
}

class MockServerSupabaseClaims extends Context.Tag('@nuxt-galaxy/ServerSupabaseClaims')<MockServerSupabaseClaims, any>() {
  static readonly Live = Layer.succeed(MockServerSupabaseClaims, () => Effect.sync(() => mocks.claims()))
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

// Mock supabase: the claims decide the session, the client is never touched
vi.mock('../../../../src/runtime/server/utils/grizzle/supabase', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../../src/runtime/server/utils/grizzle/supabase')>()
  return {
    ...original,
    ServerSupabaseClient: MockServerSupabaseClient,
    ServerSupabaseClaims: MockServerSupabaseClaims,
  }
})

// Mock the row read and the reading itself
vi.mock('../../../../src/runtime/server/utils/grizzle/workflows', () => ({
  getWorkflowEffect: mocks.getWorkflowEffect,
}))
vi.mock('../../../../src/runtime/server/utils/grizzle/versionState', () => ({
  versionStateEffect: mocks.versionStateEffect,
}))

// Mock h3
vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    getRouterParam: mocks.getRouterParam,
  }
})

const event = { path: '/api/db/workflows/7/state', method: 'GET' } as H3Event

async function loadHandler() {
  return (await import('../../../../src/runtime/server/api/db/workflows/[workflowId]/state.get')).default
}

describe('get /api/db/workflows/:workflowId/state', () => {
  beforeEach(() => {
    // call history outlives a test otherwise, so "asks nothing" would pass
    // on the calls an earlier test made
    vi.clearAllMocks()
    mocks.claims.mockReturnValue({ id: 'owner-uuid-1' })
    mocks.getWorkflowEffect.mockReturnValue(Effect.succeed(versionRow))
    mocks.versionStateEffect.mockReturnValue(Effect.succeed({ state: 'runnable' }))
    mocks.getRouterParam.mockImplementation((_event: unknown, param: string) => param === 'workflowId' ? '7' : undefined)
  })

  it('reads the version, asks Galaxy for its state, and answers it', async () => {
    const handler = await loadHandler()

    expect(await handler(event)).toEqual({ state: 'runnable' })
    expect(mocks.getWorkflowEffect).toHaveBeenCalledWith(7)
    // the reading is handed what of the row it needs: the stored workflow, the revision by index and by uuid
    expect(mocks.versionStateEffect).toHaveBeenCalledWith(expect.objectContaining({
      galaxyId: 'galaxy-wf-1',
      revision: 3,
      revisionUuid: 'fa95ecd4-ed11-49e2-b3d6-8f178b807256',
    }))
  })

  it.each([
    ['tools missing, naming them', { state: 'tools-missing', missingTools: [{ toolId: 'Cut1', toolVersion: '1.0.2' }] }],
    ['missing in Galaxy', { state: 'missing-in-galaxy' }],
    ['a revision mismatch carrying Galaxy\'s uuid', { state: 'revision-mismatch', galaxyRevisionUuid: '0b7c9a2e-1111-4222-8333-444455556666' }],
  ])('answers %s as the reading gave it', async (_label, state) => {
    mocks.versionStateEffect.mockReturnValue(Effect.succeed(state))
    const handler = await loadHandler()

    expect(await handler(event)).toEqual(state)
  })

  it.each([
    ['a word', 'abc'],
    ['a negative number', '-1'],
    ['a fraction', '1.5'],
  ])('answers 404 for %s in place of the version id, before anything is read', async (_label, workflowId) => {
    // the segment names no version, so it gets the answer a version nobody
    // can act on gets, as the PATCH and DELETE siblings do for their own id
    mocks.getRouterParam.mockReturnValue(workflowId)
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.getWorkflowEffect).not.toHaveBeenCalled()
    expect(mocks.versionStateEffect).not.toHaveBeenCalled()
  })

  it('refuses a caller with no session with 401, before the version is read or Galaxy asked', async () => {
    mocks.claims.mockReturnValue(null)
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
    expect(mocks.getWorkflowEffect).not.toHaveBeenCalled()
    expect(mocks.versionStateEffect).not.toHaveBeenCalled()
  })

  it('refuses a caller whose session cannot be read with 401 too, and says nothing of why', async () => {
    mocks.getWorkflowEffect.mockReturnValue(
      Effect.fail(new GetSupabaseUserError({ message: 'Failed to get auth user: token expired' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  })

  it('answers 404 for a version the caller named that does not exist, and asks Galaxy nothing', async () => {
    mocks.getWorkflowEffect.mockReturnValue(
      Effect.fail(new WorkflowNotFoundError({ message: 'No workflow 7 is available' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'No workflow 7 is available',
    })
    expect(mocks.versionStateEffect).not.toHaveBeenCalled()
  })

  it('answers 503 when Galaxy is unavailable, as the galaxy endpoints do', async () => {
    mocks.versionStateEffect.mockReturnValue(
      Effect.fail(new GalaxyServiceUnavailable({ message: 'Galaxy is unavailable' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 503 })
  })

  it('logs and answers 500 when a bug travels with a refusal, rather than answering the refusal', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)
    mocks.versionStateEffect.mockReturnValue(Effect.failCause(Cause.sequential(
      Cause.fail(new WorkflowNotFoundError({ message: 'No workflow 7 is available' })),
      Cause.die(new TypeError('boom: a real bug')),
    )))
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 500 })
    expect(requestLog.error).toHaveBeenCalledWith(
      'version state handler failed',
      expect.objectContaining({ cause: expect.stringContaining('boom: a real bug') }),
    )
  })

  // #33. An unseeded database is nothing the caller can act on, so the tag
  // stays unmapped here and falls to the logged 500. So does Galaxy failing
  // a read for a reason of its own: a state is never guessed from a fault.
  it.each([
    ['this deployment has no Galaxy user row', new GalaxyUserNotFoundError({ message: 'No Galaxy user registered for admin@example.org at https://galaxy.example.com' })],
    ['Galaxy failed a read for a reason of its own', new WorkflowError({ message: 'Error getting workflow galaxy-wf-1: 500', statusCode: 500 })],
  ])('answers 500 when %s, and says so in the log', async (_label, error) => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)
    mocks.versionStateEffect.mockReturnValue(Effect.fail(error))
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    })
    expect(requestLog.error).toHaveBeenCalledWith(
      'version state handler failed',
      expect.objectContaining({ cause: expect.stringContaining(error.message) }),
    )
  })
})
