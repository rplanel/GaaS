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
  /** The route parameters of the request under test. */
  params: { workflowId: 'galaxy-workflow-1', revision: '3' } as Record<string, string | undefined>,
}))

// Mock blendtype
vi.mock('blendtype', async () => ({
  // The real tag, not a stand-in: `evlog-effect` builds a Layer keyed on it.
  BlendTypeLogger: (await vi.importActual<typeof import('blendtype')>('blendtype')).BlendTypeLogger,
  exportWorkflowEffect: mocks.exportWorkflowEffect,
  toGalaxyServiceUnavailable: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  GalaxyServiceUnavailable: MockGalaxyServiceUnavailable,
  makeGalaxyLayer: vi.fn(() => Layer.empty),
}))

// The check itself has its own tests; here it is what the envelope carries
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
    expect(result).toEqual({
      error: undefined,
      data: { missing: [{ toolId: FOO, toolVersion: '1.2.3+galaxy0' }], checked: 2 },
    })
  })

  it('answers no tool missing, with the count checked, when Galaxy holds them all', async () => {
    const handler = await loadHandler()
    const result = await handler({} as any)

    expect(result).toEqual({ error: undefined, data: { missing: [], checked: 2 } })
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

  it('answers an error when the request names no stored workflow', async () => {
    mocks.params = { workflowId: undefined, revision: '3' }

    const handler = await loadHandler()
    const result = await handler({} as any)

    expect(result.error).toBeDefined()
    expect(result.data).toBeUndefined()
    expect(mocks.exportWorkflowEffect).not.toHaveBeenCalled()
  })

  it('answers 503 when Galaxy is unavailable, as the other Galaxy proxies do', async () => {
    mocks.exportWorkflowEffect.mockReturnValue(Effect.fail(new MockGalaxyServiceUnavailable({ message: 'down' })))

    const handler = await loadHandler()
    const result = await handler({} as any)

    expect(result.data).toBeUndefined()
    expect(result.error).toMatchObject({ statusCode: 503 })
  })

  it('answers an error with a message for any other failure, a tool lookup Galaxy could not answer included', async () => {
    mocks.missingToolsEffect.mockReturnValue(Effect.fail(new Error('Galaxy answered 500 for Cut1')))

    const handler = await loadHandler()
    const result = await handler({} as any)

    expect(result.data).toBeUndefined()
    expect(result.error?.message).toContain('Galaxy answered 500 for Cut1')
  })
})
