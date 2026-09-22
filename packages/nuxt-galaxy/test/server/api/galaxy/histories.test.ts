import { Context, Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGalaxyHistories = [
  { id: 'galaxy-h-1', name: 'History 1', state: 'ok' },
  { id: 'galaxy-h-2', name: 'History 2', state: 'ok' },
]

/**
 * What the `histories` select answers. Each test sets it before calling the
 * handler, so one mock covers the rows, the empty table and the failed query.
 */
let selectResult: unknown = {
  data: [
    { galaxy_id: 'galaxy-h-1' },
    { galaxy_id: 'galaxy-h-2' },
  ],
  error: null,
}

/** What `getHistoryEffect` does with a galaxy id, so a test can make Galaxy fail. */
let resolveHistory: (galaxyId: string) => Effect.Effect<unknown, unknown> = (galaxyId) => {
  const histories: Record<string, unknown> = {
    'galaxy-h-1': { id: 'galaxy-h-1', name: 'History 1', state: 'ok' },
    'galaxy-h-2': { id: 'galaxy-h-2', name: 'History 2', state: 'ok' },
  }
  return Effect.succeed(histories[galaxyId])
}

// Define mock service classes at top-level (before vi.mock hoisting)
class MockServerSupabaseClient extends Context.Tag('@nuxt-galaxy/ServerSupabaseClient')<MockServerSupabaseClient, any>() {
  static readonly Live = Layer.succeed(MockServerSupabaseClient, (_event: any) => {
    return Effect.succeed({
      schema: () => ({
        from: () => ({
          select: () => Promise.resolve(selectResult),
        }),
      }),
    })
  })
}

const logError = vi.fn()

// Mock blendtype
vi.mock('blendtype', () => ({
  getHistoryEffect: vi.fn((galaxyId: string) => resolveHistory(galaxyId)),
  toGalaxyServiceUnavailable: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  makeGalaxyLayer: vi.fn(() => ({})),
}))

// Mock galaxy utility
vi.mock('../../../../src/runtime/server/utils/galaxy', () => ({
  useGalaxyLayer: vi.fn(() => Layer.empty),
}))

// Mock supabase
vi.mock('../../../../src/runtime/server/utils/grizzle/supabase', () => ({
  ServerSupabaseClient: MockServerSupabaseClient,
}))

// `toHttpError` reaches for the request logger; the handler under test has no
// real h3 event behind it.
vi.mock('evlog', () => ({
  useLogger: vi.fn(() => ({
    set: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: logError,
  })),
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const mockEvent = { node: { req: {}, res: {} }, context: {} }

async function callHandler() {
  const handler = (await import('../../../../src/runtime/server/api/galaxy/histories.get')).default
  return handler(mockEvent as any)
}

describe('get /api/galaxy/histories', () => {
  beforeEach(() => {
    logError.mockClear()
    selectResult = {
      data: [
        { galaxy_id: 'galaxy-h-1' },
        { galaxy_id: 'galaxy-h-2' },
      ],
      error: null,
    }
    resolveHistory = (galaxyId) => {
      const histories: Record<string, unknown> = {
        'galaxy-h-1': { id: 'galaxy-h-1', name: 'History 1', state: 'ok' },
        'galaxy-h-2': { id: 'galaxy-h-2', name: 'History 2', state: 'ok' },
      }
      return Effect.succeed(histories[galaxyId])
    }
  })

  it('should fetch histories from Supabase and resolve each from Galaxy', async () => {
    expect(await callHandler()).toEqual(mockGalaxyHistories)
  })

  it('answers an empty list when no history is stored', async () => {
    selectResult = { data: [], error: null }

    expect(await callHandler()).toEqual([])
  })

  it('refuses with 500 and keeps the database error out of the response', async () => {
    selectResult = {
      data: null,
      error: { message: 'relation "galaxy.histories" does not exist', code: '42P01' },
    }

    await expect(callHandler()).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    })

    // the reason is worth keeping, just not worth telling the caller
    expect(logError).toHaveBeenCalledWith(
      'galaxy histories handler failed',
      expect.objectContaining({ cause: expect.stringContaining('42P01') }),
    )
  })

  it('answers 503 rather than 500 when Galaxy is unavailable', async () => {
    resolveHistory = () => Effect.fail({
      _tag: 'GalaxyServiceUnavailable',
      message: 'Galaxy is unavailable',
    })

    await expect(callHandler()).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Galaxy is unavailable',
    })
  })
})
