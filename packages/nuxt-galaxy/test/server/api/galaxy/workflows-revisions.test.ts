import { Context, Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * What Galaxy lists for the stored workflow, oldest first, each entry
 * carrying its own 0-based index as `version` (ADR 0004, #73).
 */
const mockRevisions = [
  { version: 0, update_time: '2026-09-01T10:00:00', steps: 3 },
  { version: 1, update_time: '2026-09-10T08:30:00', steps: 4 },
]

// Define mock service classes at top-level (before vi.mock hoisting)
class MockGalaxyServiceUnavailable extends Error {
  readonly _tag = 'GalaxyServiceUnavailable'
  constructor(opts: { message: string }) {
    super(opts.message)
  }
}

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
vi.mock('blendtype', async () => ({
  // The real tag, not a stand-in: `evlog-effect` builds a Layer keyed on it.
  BlendTypeLogger: (await vi.importActual<typeof import('blendtype')>('blendtype')).BlendTypeLogger,
  getWorkflowRevisionsEffect: vi.fn(),
  toGalaxyServiceUnavailable: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  GalaxyServiceUnavailable: MockGalaxyServiceUnavailable,
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

/**
 * The route parameter of the request under test; `''` is what h3 hands a
 * middle parameter left empty (`/api/galaxy/workflows//versions`).
 */
const mocks = vi.hoisted(() => ({
  workflowId: 'galaxy-workflow-1' as string | undefined,
  logError: vi.fn(),
}))

// `toHttpError` reaches for the request logger; the handler under test has no
// real h3 event behind it.
vi.mock('evlog', () => ({
  useLogger: vi.fn(() => ({
    set: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.logError,
  })),
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

// Mock h3
vi.mock('h3', async (importOriginal) => {
  const original = await importOriginal<typeof import('h3')>()
  return {
    ...original,
    getRouterParam: vi.fn((_event: unknown, param: string) => {
      if (param === 'workflowId')
        return mocks.workflowId
      return undefined
    }),
  }
})

async function loadHandler() {
  return (await import('../../../../src/runtime/server/api/galaxy/workflows/[workflowId]/versions.get')).default
}

async function revisionsSpy() {
  const bt = await import('blendtype')
  return bt.getWorkflowRevisionsEffect as ReturnType<typeof vi.fn>
}

describe('get /api/galaxy/workflows/:workflowId/versions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.workflowId = 'galaxy-workflow-1'
  })

  it('answers the revisions Galaxy lists for that stored workflow, with no envelope around them', async () => {
    const spy = await revisionsSpy()
    spy.mockReturnValue(Effect.succeed(mockRevisions))

    const handler = await loadHandler()
    const result = await handler({} as any)

    expect(spy).toHaveBeenLastCalledWith('galaxy-workflow-1')
    expect(result).toEqual(mockRevisions)
  })

  // A middle segment, so an empty one matches the route (#125): it used to
  // answer 200 with `{ error: {} }`, an `Error` serialised to nothing
  it('answers 404 when the workflow segment is empty, before asking Galaxy', async () => {
    mocks.workflowId = ''
    const spy = await revisionsSpy()

    const handler = await loadHandler()

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 404 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('answers HTTP 503 when Galaxy is unavailable, as the other Galaxy proxies do', async () => {
    const spy = await revisionsSpy()
    spy.mockReturnValue(Effect.fail(new MockGalaxyServiceUnavailable({ message: 'down' })))

    const handler = await loadHandler()

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 503 })
  })

  // Galaxy answers 404 for an id it does not know and 400 for one it cannot
  // decode: both say the stored workflow names nothing, which is the
  // caller's to act on rather than this server's fault to log
  it.each([404, 400])('answers 404 with a sentence, and logs nothing, when Galaxy answers %i for the stored workflow', async (galaxyStatus) => {
    const spy = await revisionsSpy()
    spy.mockReturnValue(Effect.fail(Object.assign(new Error(`Galaxy answered ${galaxyStatus}`), { _tag: 'WorkflowError', statusCode: galaxyStatus })))

    const handler = await loadHandler()

    await expect(handler({} as any)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Galaxy holds no stored workflow galaxy-workflow-1',
    })
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it('answers a logged 500 for any other failure, with the cause in the log and not in the answer', async () => {
    const spy = await revisionsSpy()
    spy.mockReturnValue(Effect.fail(Object.assign(new Error('Galaxy answered 500'), { _tag: 'WorkflowError' })))

    const handler = await loadHandler()
    const refusal = await handler({} as any).catch((error: unknown) => error)

    expect(refusal).toMatchObject({ statusCode: 500, statusMessage: 'Internal Server Error' })
    expect(JSON.stringify(refusal)).not.toContain('Galaxy answered 500')
    expect(mocks.logError).toHaveBeenCalledOnce()
    expect(mocks.logError).toHaveBeenCalledWith(
      'galaxy workflow revisions handler failed',
      expect.objectContaining({ cause: expect.stringContaining('Galaxy answered 500') }),
    )
  })

  // #125: this answered 200 with `Cause.pretty` in the body — absolute paths
  // and the resolved effect version included — and wrote no log line at all
  it('answers a logged 500 carrying no stack trace when the handler throws a bug', async () => {
    const spy = await revisionsSpy()
    spy.mockReturnValue(Effect.sync(() => {
      throw new TypeError('cannot read x of undefined')
    }))

    const handler = await loadHandler()
    const refusal = await handler({} as any).catch((error: unknown) => error)

    expect(refusal).toMatchObject({ statusCode: 500, statusMessage: 'Internal Server Error' })
    expect(JSON.stringify(refusal)).not.toContain('cannot read x')
    expect(JSON.stringify(refusal)).not.toMatch(/\bat \S+:\d+/)
    expect(mocks.logError).toHaveBeenCalledOnce()
    expect(mocks.logError).toHaveBeenCalledWith(
      'galaxy workflow revisions handler failed',
      expect.objectContaining({ cause: expect.stringContaining('cannot read x of undefined') }),
    )
  })
})
