import { Context, Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #75, ADR 0004. The publish dialog checks the tools of the revision it has
 * selected before the administrator clicks Publish, through this proxy: the
 * revision is exported and each of its tools looked up at its pinned
 * version, and the answer says which are missing and how many were checked.
 */

const FOO = 'toolshed.g2.bx.psu.edu/repos/iuc/foo/foo/1.2.3+galaxy0'

/** The export Galaxy answers for the revision asked for. */
const mockExport = { a_galaxy_workflow: true, name: 'Satellite Finder', version: 3, uuid: 'uuid-3', steps: {} }

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

const mocks = vi.hoisted(() => ({
  exportWorkflowEffect: vi.fn(),
  missingToolsEffect: vi.fn(),
  pinnedTools: vi.fn(),
  logError: vi.fn(),
  /** The route parameters of the request under test. */
  params: { workflowId: 'galaxy-workflow-1', revision: '3' } as Record<string, string | undefined>,
}))

// Mock blendtype
vi.mock('blendtype', async () => ({
  // The real tag, not a stand-in: `evlog-effect` builds a Layer keyed on it.
  BlendTypeLogger: (await vi.importActual<typeof import('blendtype')>('blendtype')).BlendTypeLogger,
  exportWorkflowEffect: mocks.exportWorkflowEffect,
  galaxyRevisionNumber: (await vi.importActual<typeof import('blendtype')>('blendtype')).galaxyRevisionNumber,
  toGalaxyServiceUnavailable: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  GalaxyServiceUnavailable: MockGalaxyServiceUnavailable,
  makeGalaxyLayer: vi.fn(() => Layer.empty),
}))

// The check itself has its own tests; here it is what the endpoint answers
vi.mock('../../../../src/runtime/server/utils/grizzle/workflowTools', () => ({
  missingToolsEffect: mocks.missingToolsEffect,
  pinnedTools: mocks.pinnedTools,
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
    getRouterParam: vi.fn((_event: unknown, param: string) => mocks.params[param]),
  }
})

async function loadHandler() {
  return (await import('../../../../src/runtime/server/api/galaxy/workflows/[workflowId]/revisions/[revision]/tools.get')).default
}

describe('get /api/galaxy/workflows/:workflowId/revisions/:revision/tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.params = { workflowId: 'galaxy-workflow-1', revision: '3' }
    mocks.exportWorkflowEffect.mockReturnValue(Effect.succeed(mockExport))
    mocks.pinnedTools.mockReturnValue([{ toolId: FOO, toolVersion: '1.2.3+galaxy0' }, { toolId: 'Cut1', toolVersion: '1.0.2' }])
    mocks.missingToolsEffect.mockReturnValue(Effect.succeed([]))
  })

  it('exports the revision asked for and answers which of its tools are missing, and how many were checked', async () => {
    mocks.missingToolsEffect.mockReturnValue(Effect.succeed([{ toolId: FOO, toolVersion: '1.2.3+galaxy0' }]))

    const handler = await loadHandler()
    const result = await handler({} as any)

    expect(mocks.exportWorkflowEffect).toHaveBeenLastCalledWith('galaxy-workflow-1', 'export', 3)
    expect(mocks.missingToolsEffect).toHaveBeenLastCalledWith(mockExport)
    expect(result).toEqual({ missing: [{ toolId: FOO, toolVersion: '1.2.3+galaxy0' }], checked: 2 })
  })

  it('answers no tool missing, with the count checked, when Galaxy holds them all', async () => {
    const handler = await loadHandler()
    const result = await handler({} as any)

    expect(result).toEqual({ missing: [], checked: 2 })
  })

  // Galaxy's `get_internal_version` indexes a list, so only a non-negative
  // integer names a revision; anything else is a caller's bug and is refused
  // here rather than handed to Galaxy, as the by-id proxy refuses its `version`
  it.each([
    ['a word', 'abc'],
    ['a negative index', '-1'],
    ['a fraction', '1.5'],
    ['an empty segment', ''],
  ])('refuses %s as a revision with 400 before asking Galaxy', async (_label, revision) => {
    mocks.params = { workflowId: 'galaxy-workflow-1', revision }

    const handler = await loadHandler()

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.exportWorkflowEffect).not.toHaveBeenCalled()
  })

  // A middle segment, so an empty one matches the route (#125): it used to
  // answer 200 with `{ error: {} }`, an `Error` serialised to nothing
  it('answers 404 when the workflow segment is empty, before asking Galaxy', async () => {
    mocks.params = { workflowId: '', revision: '3' }

    const handler = await loadHandler()

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.exportWorkflowEffect).not.toHaveBeenCalled()
  })

  it('answers HTTP 503 when Galaxy is unavailable, as the other Galaxy proxies do', async () => {
    mocks.exportWorkflowEffect.mockReturnValue(Effect.fail(new MockGalaxyServiceUnavailable({ message: 'down' })))

    const handler = await loadHandler()

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 503 })
  })

  // Galaxy answers 404 for an id it does not know, and 400 for one it cannot
  // decode or a revision index past the end of the history: each says the
  // revision names nothing, which is the caller's to act on rather than this
  // server's fault to log. The sentence shows the editor's number, index + 1.
  it.each([404, 400])('answers 404 with a sentence, and logs nothing, when Galaxy answers %i for the export', async (galaxyStatus) => {
    mocks.exportWorkflowEffect.mockReturnValue(Effect.fail(Object.assign(new Error(`Galaxy answered ${galaxyStatus}`), { _tag: 'WorkflowError', statusCode: galaxyStatus })))

    const handler = await loadHandler()

    await expect(handler({} as any)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Galaxy holds no revision 4 of stored workflow galaxy-workflow-1',
    })
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  // a tool lookup is not the revision: a 404 there is a missing tool, which
  // the check answers as such, and anything else from it is a fault
  it('still answers a logged 500 when a tool lookup fails with a 4xx the check did not settle', async () => {
    mocks.missingToolsEffect.mockReturnValue(Effect.fail(Object.assign(new Error('Galaxy answered 400 for Cut1'), { _tag: 'ToolError', statusCode: 400 })))

    const handler = await loadHandler()

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 500 })
    expect(mocks.logError).toHaveBeenCalledOnce()
  })

  it('answers a logged 500 for any other failure, a tool lookup Galaxy could not answer included, with the cause in the log and not in the answer', async () => {
    mocks.missingToolsEffect.mockReturnValue(Effect.fail(Object.assign(new Error('Galaxy answered 500 for Cut1'), { _tag: 'WorkflowError' })))

    const handler = await loadHandler()
    const refusal = await handler({} as any).catch((error: unknown) => error)

    expect(refusal).toMatchObject({ statusCode: 500, statusMessage: 'Internal Server Error' })
    expect(JSON.stringify(refusal)).not.toContain('Cut1')
    expect(mocks.logError).toHaveBeenCalledOnce()
    expect(mocks.logError).toHaveBeenCalledWith(
      'galaxy revision tools handler failed',
      expect.objectContaining({ cause: expect.stringContaining('Galaxy answered 500 for Cut1') }),
    )
  })

  // #125: this answered 200 with `Cause.pretty` in the body — absolute paths
  // and the resolved effect version included — and wrote no log line at all
  it('answers a logged 500 carrying no stack trace when the handler throws a bug', async () => {
    mocks.pinnedTools.mockImplementation(() => {
      throw new TypeError('cannot read x of undefined')
    })

    const handler = await loadHandler()
    const refusal = await handler({} as any).catch((error: unknown) => error)

    expect(refusal).toMatchObject({ statusCode: 500, statusMessage: 'Internal Server Error' })
    expect(JSON.stringify(refusal)).not.toContain('cannot read x')
    expect(JSON.stringify(refusal)).not.toMatch(/\bat \S+:\d+/)
    expect(mocks.logError).toHaveBeenCalledOnce()
    expect(mocks.logError).toHaveBeenCalledWith(
      'galaxy revision tools handler failed',
      expect.objectContaining({ cause: expect.stringContaining('cannot read x of undefined') }),
    )
  })
})
