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
vi.mock('blendtype', () => ({
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

/** The route parameter of the request under test; `undefined` is a request naming no stored workflow. */
const mocks = vi.hoisted(() => ({
  workflowId: 'galaxy-workflow-1' as string | undefined,
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
    mocks.workflowId = 'galaxy-workflow-1'
  })

  it('answers { data, error: undefined } with the revisions Galaxy lists for that stored workflow', async () => {
    const spy = await revisionsSpy()
    spy.mockReturnValue(Effect.succeed(mockRevisions))

    const handler = await loadHandler()
    const result = await handler({} as any)

    expect(spy).toHaveBeenLastCalledWith('galaxy-workflow-1')
    expect(result).toEqual({ error: undefined, data: mockRevisions })
  })

  it('answers an error when the request names no stored workflow', async () => {
    mocks.workflowId = undefined
    const spy = await revisionsSpy()
    spy.mockClear()

    const handler = await loadHandler()
    const result = await handler({} as any)

    expect(result.error).toBeDefined()
    expect(result.data).toBeUndefined()
    expect(spy).not.toHaveBeenCalled()
  })

  it('answers 503 when Galaxy is unavailable, as the by-id proxy does', async () => {
    const spy = await revisionsSpy()
    spy.mockReturnValue(Effect.fail(new MockGalaxyServiceUnavailable({ message: 'down' })))

    const handler = await loadHandler()
    const result = await handler({} as any)

    expect(result.data).toBeUndefined()
    expect(result.error).toMatchObject({ statusCode: 503 })
  })

  it('answers an error with a message for any other failure', async () => {
    const spy = await revisionsSpy()
    spy.mockReturnValue(Effect.fail(new Error('Something went wrong')))

    const handler = await loadHandler()
    const result = await handler({} as any)

    expect(result.error).toBeDefined()
    expect(result.error?.message).toContain('Something went wrong')
    expect(result.data).toBeUndefined()
  })
})
