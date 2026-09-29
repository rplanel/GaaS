import type { H3Event } from 'h3'
import { Context, Effect, Layer } from 'effect'
import { useLogger } from 'evlog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GALAXY_ROUTE_ACCESS } from '../../../src/runtime/server/utils/galaxyAccess'
import { createMockRequestLogger } from '../setup'

class GetSupabaseUserError extends Error {
  readonly _tag = 'GetSupabaseUserError'
  constructor(opts: { message: string }) {
    super(opts.message)
  }
}

class ForbiddenError extends Error {
  readonly _tag = 'ForbiddenError'
  constructor(opts: { message: string }) {
    super(opts.message)
  }
}

class AdminRoleCheckError extends Error {
  readonly _tag = 'AdminRoleCheckError'
  constructor(opts: { message: string }) {
    super(opts.message)
  }
}

const SIGNED_IN = { id: 'user-id' }

const mockGetSupabaseUser = vi.fn<(event: H3Event) => Effect.Effect<{ id?: string } | null, GetSupabaseUserError, never>>(
  () => Effect.succeed(SIGNED_IN),
)

const mockRequireRole = vi.fn<(user: { id: string }, role: string) => Effect.Effect<void, ForbiddenError | AdminRoleCheckError, never>>(
  () => Effect.void,
)

class MockDrizzle extends Context.Tag('@nuxt-galaxy/Drizzle')<MockDrizzle, object>() {
  static readonly Live = Layer.succeed(MockDrizzle, {})
}

class MockServerSupabaseClient extends Context.Tag('@nuxt-galaxy/ServerSupabaseClient')<MockServerSupabaseClient, any>() {
  static readonly Live = Layer.succeed(MockServerSupabaseClient, () => Effect.succeed({}))
}

vi.mock('../../../src/runtime/server/utils/drizzle.js', () => ({
  Drizzle: MockDrizzle,
}))

vi.mock('../../../src/runtime/server/utils/grizzle/supabase.js', () => ({
  ServerSupabaseClient: MockServerSupabaseClient,
  getSupabaseUser: mockGetSupabaseUser,
  requireRole: mockRequireRole,
  GetSupabaseUserError,
  ForbiddenError,
  AdminRoleCheckError,
}))

// `galaxyAccess` is deliberately NOT mocked: the levels it holds are what this
// guard is for, and a stand-in table would leave the real one untested here
// while every test still passed.

/**
 * Run the guard against one path, as Nitro would.
 *
 * A middleware answers by **throwing**; returning a value would make the value
 * the response, and returning `undefined` is what lets the request carry on to
 * its handler. So a denial is a rejected promise and a pass is `undefined`.
 */
async function callGuard(path: string, method = 'GET') {
  const guard = (await import('../../../src/runtime/server/middleware/galaxyGuard')).default
  return guard({ path, method } as any)
}

/** A callable path for a route pattern, with a sample value per parameter. */
function samplePath(pattern: string): string {
  return pattern
    .replace(':workflowId', 'f2db41e1fa331b3e')
    .replace(':revision', '0')
}

const PROTECTED_ROUTES = Object.entries(GALAXY_ROUTE_ACCESS)
  .filter(([, access]) => access !== 'open')
  .map(([pattern, access]) => ({ path: samplePath(pattern), access }))

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSupabaseUser.mockReturnValue(Effect.succeed(SIGNED_IN))
  mockRequireRole.mockReturnValue(Effect.void)
  vi.mocked(useLogger).mockReturnValue(createMockRequestLogger())
})

describe('the galaxy access guard (#99)', () => {
  it('lets a request that is none of its business past without asking anything', async () => {
    await expect(callGuard('/api/db/workflows')).resolves.toBeUndefined()
    await expect(callGuard('/api/probe')).resolves.toBeUndefined()
    expect(mockGetSupabaseUser).not.toHaveBeenCalled()
  })

  it('lets an anonymous caller read health, so the landing banner still works', async () => {
    mockGetSupabaseUser.mockReturnValue(Effect.fail(new GetSupabaseUserError({ message: 'no session' })))
    await expect(callGuard('/api/galaxy/health')).resolves.toBeUndefined()
    // not merely allowed — never even asked, so an open route costs no round
    // trip to Supabase
    expect(mockGetSupabaseUser).not.toHaveBeenCalled()
  })

  describe('an anonymous caller', () => {
    beforeEach(() => {
      mockGetSupabaseUser.mockReturnValue(Effect.fail(new GetSupabaseUserError({ message: 'no session' })))
    })

    /**
     * The ticket's first acceptance criterion, read off the table rather than
     * from a list written here: a route added to the table without a test is
     * still covered by this one.
     */
    it.each(PROTECTED_ROUTES)('is answered 401 at $path', async ({ path }) => {
      await expect(callGuard(path)).rejects.toMatchObject({ statusCode: 401 })
    })

    it('is told nothing but that it is unauthorized', async () => {
      mockGetSupabaseUser.mockReturnValue(
        Effect.fail(new GetSupabaseUserError({ message: 'AuthSessionMissingError: no cookie named sb-x-auth-token' })),
      )
      await expect(callGuard('/api/galaxy/instance')).rejects.toMatchObject({
        statusCode: 401,
        statusMessage: 'Unauthorized',
      })
    })

    it('is refused before any role is looked up', async () => {
      await expect(callGuard('/api/galaxy/workflows')).rejects.toMatchObject({ statusCode: 401 })
      expect(mockRequireRole).not.toHaveBeenCalled()
    })

    it('is refused by a throw, which is what stops Nitro reaching the handler', async () => {
      // A middleware that merely returned would let the request through to the
      // proxy behind it, so "answers 401" and "the handler never runs" are the
      // same assertion only as long as the denial throws. Settled either way
      // and then inspected, so a silent pass-through cannot read as a refusal.
      const outcome = await callGuard('/api/galaxy/workflows/abc/versions').then(
        returned => ({ returned }),
        thrown => ({ thrown }),
      )
      expect(outcome).not.toHaveProperty('returned')
      expect(outcome).toHaveProperty('thrown')
    })
  })

  it('answers 401 when the session resolves to no user at all', async () => {
    mockGetSupabaseUser.mockReturnValue(Effect.succeed(null))
    await expect(callGuard('/api/galaxy/instance')).rejects.toMatchObject({ statusCode: 401 })
    expect(mockRequireRole).not.toHaveBeenCalled()
  })

  it('answers 401 when the user carries no usable id', async () => {
    mockGetSupabaseUser.mockReturnValue(Effect.succeed({ id: '' }))
    await expect(callGuard('/api/galaxy/instance')).rejects.toMatchObject({ statusCode: 401 })
  })

  describe('a session route', () => {
    const sessionRoutes = Object.entries(GALAXY_ROUTE_ACCESS)
      .filter(([, access]) => access === 'session')
      .map(([pattern]) => samplePath(pattern))

    it.each(sessionRoutes)('lets a signed-in caller past %s', async (path) => {
      await expect(callGuard(path)).resolves.toBeUndefined()
    })

    it('does not look up a role, so an ordinary user is not made to be an admin', async () => {
      await callGuard('/api/galaxy/histories')
      expect(mockRequireRole).not.toHaveBeenCalled()
    })
  })

  describe('an admin route', () => {
    const adminRoutes = Object.entries(GALAXY_ROUTE_ACCESS)
      .filter(([, access]) => access === 'admin')
      .map(([pattern]) => samplePath(pattern))

    it.each(adminRoutes)('answers 403 to a signed-in caller without the role at %s', async (path) => {
      mockRequireRole.mockReturnValue(Effect.fail(new ForbiddenError({ message: 'Forbidden: admin role required' })))
      await expect(callGuard(path)).rejects.toMatchObject({ statusCode: 403 })
    })

    it.each(adminRoutes)('lets an administrator past %s', async (path) => {
      await expect(callGuard(path)).resolves.toBeUndefined()
    })

    it('asks for the admin role by the name the level already carries', async () => {
      await callGuard('/api/galaxy/workflows')
      expect(mockRequireRole).toHaveBeenCalledTimes(1)
      expect(mockRequireRole).toHaveBeenCalledWith(SIGNED_IN, 'admin')
    })

    it('answers a logged 500, not a 403, when the role query itself fails', async () => {
      const requestLog = createMockRequestLogger()
      vi.mocked(useLogger).mockReturnValue(requestLog)
      mockRequireRole.mockReturnValue(Effect.fail(new AdminRoleCheckError({ message: 'connection refused' })))

      await expect(callGuard('/api/galaxy/workflows')).rejects.toMatchObject({ statusCode: 500 })
      // a fault of this server's, so the reason is recorded rather than served
      expect(requestLog.error).toHaveBeenCalledWith(
        'galaxy access guard handler failed',
        expect.objectContaining({ cause: expect.stringContaining('connection refused') }),
      )
    })
  })

  describe('a galaxy path no route claims', () => {
    /**
     * The fail-closed default, proved through the guard rather than only
     * against `accessForPath`: this is the tenth proxy, added and forgotten.
     * It must be refused, not waved through.
     */
    it('demands a session', async () => {
      mockGetSupabaseUser.mockReturnValue(Effect.fail(new GetSupabaseUserError({ message: 'no session' })))
      await expect(callGuard('/api/galaxy/brand-new-proxy')).rejects.toMatchObject({ statusCode: 401 })
    })

    it('demands the admin role even from a signed-in caller', async () => {
      mockRequireRole.mockReturnValue(Effect.fail(new ForbiddenError({ message: 'Forbidden: admin role required' })))
      await expect(callGuard('/api/galaxy/brand-new-proxy')).rejects.toMatchObject({ statusCode: 403 })
      expect(mockRequireRole).toHaveBeenCalledWith(SIGNED_IN, 'admin')
    })
  })

  it('guards a write to a galaxy path as closely as a read', async () => {
    // Every route here is a GET, so another method reaches no handler — but the
    // guard runs before routing, and a POST that sailed past it would be a hole
    // the day a write endpoint is added.
    mockGetSupabaseUser.mockReturnValue(Effect.fail(new GetSupabaseUserError({ message: 'no session' })))
    await expect(callGuard('/api/galaxy/workflows', 'POST')).rejects.toMatchObject({ statusCode: 401 })
  })
})
