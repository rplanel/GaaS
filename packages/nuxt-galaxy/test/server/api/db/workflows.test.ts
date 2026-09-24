import type { H3Event } from 'h3'
import { Cause, Context, Data, Effect, Layer } from 'effect'
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
class GalaxyUserNotFoundError extends Data.TaggedError('GalaxyUserNotFoundError')<{ readonly message: string }> {}
class VersionLabelTakenError extends Data.TaggedError('VersionLabelTakenError')<{ readonly message: string }> {}
class RevisionAlreadyPublishedError extends Data.TaggedError('RevisionAlreadyPublishedError')<{ readonly message: string }> {}
class WorkflowNameLockedError extends Data.TaggedError('WorkflowNameLockedError')<{ readonly message: string }> {}
class ConcurrentPublishError extends Data.TaggedError('ConcurrentPublishError')<{ readonly message: string }> {}

/** The version row the insert answers with, which is the endpoint's 200 body. */
const publishedVersion = { id: 1, name: 'Satellite Finder', galaxy_id: 'galaxy-wf-1', name_key: 'satelliteFinder', version_key: '0.11', revision: 3, active: true }

/** What the publish dialog sends. */
const body = { galaxyId: 'galaxy-wf-1', name: 'satelliteFinder', label: '0.11' }

const mocks = vi.hoisted(() => ({
  publishVersion: vi.fn(),
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

// Mock publishVersion
vi.mock('../../../../src/runtime/server/utils/grizzle/workflows', () => ({
  publishVersion: mocks.publishVersion,
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
    // call history outlives a test otherwise, so "publishes nothing" would
    // pass on the calls an earlier test made
    vi.clearAllMocks()
    mocks.publishVersion.mockReturnValue(Effect.succeed(publishedVersion))
    mocks.readBody.mockResolvedValue(body)
  })

  it('reads the body, publishes, and answers with the version row', async () => {
    const handler = await loadHandler()

    expect(await handler(event)).toEqual(publishedVersion)
  })

  it('passes the checked body on, and nothing it did not check', async () => {
    mocks.readBody.mockResolvedValue({ ...body, clientVersion: '2.0.0' })
    const handler = await loadHandler()
    await handler(event)

    expect(mocks.publishVersion).toHaveBeenCalledWith(
      body,
      expect.any(String),
      expect.any(String),
      event,
    )
  })

  // ADR 0004, #73. The revision the dialog chose travels with the body; left
  // out, the latest is published, so nothing is added for it here.
  it('passes the revision on when the body names one', async () => {
    mocks.readBody.mockResolvedValue({ ...body, revision: 4 })
    const handler = await loadHandler()
    await handler(event)

    expect(mocks.publishVersion).toHaveBeenCalledWith(
      { ...body, revision: 4 },
      expect.any(String),
      expect.any(String),
      event,
    )
  })

  it('refuses a revision that cannot name one with 400 and publishes nothing', async () => {
    mocks.readBody.mockResolvedValue({ ...body, revision: -1 })
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: '`revision` must be a non-negative integer',
    })
    expect(mocks.publishVersion).not.toHaveBeenCalled()
  })

  it('refuses an unauthenticated caller with 401, as its siblings do', async () => {
    // the message is the shape the claims lookup really produces on a failed
    // lookup, so the assertion below proves the 401 body is fixed rather than
    // taken from the error -- it would leak the reason otherwise
    mocks.publishVersion.mockReturnValue(
      Effect.fail(new GetSupabaseUserError({ message: 'Failed to get auth user: token expired' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  })

  it.each([
    ['no body at all', undefined],
    ['a body that is not an object', 'galaxy-wf-1'],
    ['a body with no galaxyId', { name: 'satelliteFinder', label: '0.11' }],
    ['a body with no name', { galaxyId: 'galaxy-wf-1', label: '0.11' }],
    ['a body with no label', { galaxyId: 'galaxy-wf-1', name: 'satelliteFinder' }],
    ['an empty galaxyId', { ...body, galaxyId: '   ' }],
  ])('refuses %s with 400 and publishes nothing', async (_label, input) => {
    mocks.readBody.mockResolvedValue(input)
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.publishVersion).not.toHaveBeenCalled()
  })

  it('refuses a name or a label that cannot name a results view directory with 400, before anything else', async () => {
    // the rule used to be checked against Galaxy tags and answered 422; the
    // value is typed in the dialog now, so it is a body the caller can fix
    mocks.readBody.mockResolvedValue({ ...body, label: '0.11+galaxy2' })
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('`label` cannot name a results view directory'),
    })
    expect(mocks.publishVersion).not.toHaveBeenCalled()
  })

  it('refuses a body that cannot be read at all with 400', async () => {
    mocks.readBody.mockRejectedValue(new Error('Invalid JSON'))
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.publishVersion).not.toHaveBeenCalled()
  })

  it('answers 403 when the database refuses the insert', async () => {
    mocks.publishVersion.mockReturnValue(
      Effect.fail(new ForbiddenError({ message: 'Permission denied' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
  })

  // Each refusal names what the administrator can change, so its words have
  // to reach the dialog rather than be swapped for a reason phrase (#26).
  it.each([
    ['a label already used for this name', new VersionLabelTakenError({ message: 'Version "0.11" of "satelliteFinder" already exists.' })],
    ['a revision already published', new RevisionAlreadyPublishedError({ message: 'Revision 3 is already published as version "0.10" of "satelliteFinder".' })],
    ['a name that differs from the lineage', new WorkflowNameLockedError({ message: 'This workflow is published as "satelliteFinder"; a new version keeps that name.' })],
    ['a version published meanwhile', new ConcurrentPublishError({ message: 'Another version was published meanwhile. Reload the page and try again.' })],
  ])('answers 409 with the error\'s own words for %s', async (_label, error) => {
    mocks.publishVersion.mockReturnValue(Effect.fail(error))
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: error.message,
    })
  })

  it('logs and answers 500 when a bug travels with a refusal, rather than answering the refusal', async () => {
    // `toHttpError` refuses a failure that arrived paired with a defect, so
    // the bug is what gets answered and recorded (#40)
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)
    mocks.publishVersion.mockReturnValue(Effect.failCause(Cause.sequential(
      Cause.fail(new VersionLabelTakenError({ message: 'Version "0.11" of "satelliteFinder" already exists.' })),
      Cause.die(new TypeError('boom: a real bug')),
    )))
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 500 })
    expect(requestLog.error).toHaveBeenCalledWith(
      'publish version handler failed',
      expect.objectContaining({ cause: expect.stringContaining('boom: a real bug') }),
    )
  })

  it('answers 503 when Galaxy is unavailable, as the galaxy endpoints do', async () => {
    // publishing exports the revision from Galaxy first, so Galaxy being
    // down is a live outcome here and not a fault of this server
    mocks.publishVersion.mockReturnValue(
      Effect.fail(new GalaxyServiceUnavailable({ message: 'Galaxy is unavailable' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 503 })
  })

  // #33. An unseeded database is nothing the caller can act on, so the tag
  // stays unmapped here and falls to the logged 500 it always answered.
  it('answers 500 when this deployment has no Galaxy user row, and says so in the log', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)
    mocks.publishVersion.mockReturnValue(
      Effect.fail(new GalaxyUserNotFoundError({
        message: 'No Galaxy user registered for admin@example.org at https://galaxy.example.com',
      })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    })
    expect(requestLog.error).toHaveBeenCalledWith(
      'publish version handler failed',
      expect.objectContaining({ cause: expect.stringContaining('No Galaxy user registered') }),
    )
  })

  it('answers 500 for anything else, and says so in the log', async () => {
    const requestLog = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(requestLog)
    mocks.publishVersion.mockReturnValue(
      Effect.fail(new InsertWorkflowError({ message: 'supabase fell over' })),
    )
    const handler = await loadHandler()

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 500 })
    expect(requestLog.error).toHaveBeenCalledWith(
      'publish version handler failed',
      expect.objectContaining({ cause: expect.stringContaining('supabase fell over') }),
    )
  })
})
