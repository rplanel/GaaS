import { describe, expect, it } from 'vitest'
import { accessForPath, GALAXY_ROUTE_ACCESS, isGalaxyApiPath } from '../../../src/runtime/server/utils/galaxyAccess'

describe('the level of each galaxy route (#99)', () => {
  /**
   * The decision itself, asserted whole.
   *
   * `toEqual` rather than a set of `toHaveProperty` calls on purpose: a route
   * added to the table without a thought about who may call it, or a level
   * quietly relaxed, both fail here. `routes.test.ts` checks the other half —
   * that these keys and Nitro's registered routes are the same set.
   */
  it('is the rule the ticket settled on', () => {
    expect(GALAXY_ROUTE_ACCESS).toEqual({
      '/api/galaxy/health': 'open',
      '/api/galaxy/instance': 'session',
      '/api/galaxy/histories': 'session',
      '/api/galaxy/workflows/:workflowId/revisions/:revision/description': 'session',
      '/api/galaxy/workflows': 'admin',
      '/api/galaxy/workflows/:workflowId/versions': 'admin',
      '/api/galaxy/workflows/:workflowId/revisions/:revision/tools': 'admin',
    })
  })

  it('leaves only health open, so the landing banner still reads it while signed out', () => {
    const open = Object.entries(GALAXY_ROUTE_ACCESS)
      .filter(([, access]) => access === 'open')
      .map(([route]) => route)
    expect(open).toEqual(['/api/galaxy/health'])
  })
})

describe('accessForPath', () => {
  it.each([
    ['/api/galaxy/health', 'open'],
    ['/api/galaxy/instance', 'session'],
    ['/api/galaxy/histories', 'session'],
    ['/api/galaxy/workflows/f2db41e1fa331b3e/revisions/0/description', 'session'],
    ['/api/galaxy/workflows', 'admin'],
    ['/api/galaxy/workflows/f2db41e1fa331b3e/versions', 'admin'],
    ['/api/galaxy/workflows/f2db41e1fa331b3e/revisions/0/tools', 'admin'],
  ] as const)('reads %s as %s', (path, expected) => {
    expect(accessForPath(path)).toBe(expected)
  })

  it('ignores the query string, so ?version=1 is not a different endpoint', () => {
    expect(accessForPath('/api/galaxy/health?probe=1')).toBe('open')
    expect(accessForPath('/api/galaxy/workflows/abc/revisions/0/description?x=y')).toBe('session')
  })

  it('ignores a trailing slash, which Nitro answers from the same handler', () => {
    expect(accessForPath('/api/galaxy/health/')).toBe('open')
    expect(accessForPath('/api/galaxy/instance/')).toBe('session')
  })

  /**
   * An empty middle segment satisfies a parameter in h3's router, so
   * `/api/galaxy/workflows//revisions/0/description` reaches the description
   * handler with an empty `workflowId`.
   *
   * The route asserted here is a `session` one deliberately. Every `admin`
   * route would answer `admin` whether the parameter matched the empty segment
   * or the path fell through to the fail-closed default, so it could not tell
   * the two apart; `session` can only come from a real match.
   */
  it('matches an empty middle segment, as h3 does', () => {
    expect(accessForPath('/api/galaxy/workflows//revisions/0/description')).toBe('session')
    expect(accessForPath('/api/galaxy/workflows/abc/revisions//description')).toBe('session')
  })

  describe('a path the table does not name', () => {
    it.each([
      '/api/galaxy/brand-new-proxy',
      '/api/galaxy/workflows/abc',
      '/api/galaxy/tools/toolshed.g2.bx.psu.edu%2Frepos%2Fiuc%2Fx/1.0',
      '/api/galaxy',
      '/api/galaxy/workflows/abc/revisions/0/description/extra',
    ])('demands admin for %s', (path) => {
      expect(accessForPath(path)).toBe('admin')
    })

    /**
     * The documented divergence from Nitro's router: this matches the raw
     * path, so an encoded literal segment misses the table while the router
     * still resolves it. It must land on `admin` rather than on the level the
     * decoded path would have had — costing a caller an answer is the safe
     * direction, handing one over is not.
     */
    it('demands admin for an encoded literal segment rather than trusting it', () => {
      expect(accessForPath('/api/galaxy/%68ealth')).toBe('admin')
    })
  })

  it('prefers a literal segment over a parameter, as a radix router resolves it', () => {
    const overlapping = {
      '/api/galaxy/workflows/:workflowId': 'admin',
      '/api/galaxy/workflows/mine': 'session',
    } as const
    expect(accessForPath('/api/galaxy/workflows/mine', overlapping)).toBe('session')
    expect(accessForPath('/api/galaxy/workflows/abc', overlapping)).toBe('admin')
  })

  it('does not let the order the patterns were written decide', () => {
    const reversed = {
      '/api/galaxy/workflows/mine': 'session',
      '/api/galaxy/workflows/:workflowId': 'admin',
    } as const
    expect(accessForPath('/api/galaxy/workflows/mine', reversed)).toBe('session')
  })

  it('demands admin against an empty table, so a lost table closes rather than opens', () => {
    expect(accessForPath('/api/galaxy/health', {})).toBe('admin')
  })
})

describe('isGalaxyApiPath', () => {
  it.each([
    '/api/galaxy/health',
    '/api/galaxy/workflows/abc/versions',
    // the bare prefix: a route registered there one day is still the guard's
    '/api/galaxy',
    '/api/galaxy/',
    '/api/galaxy/health?x=1',
  ])('claims %s', (path) => {
    expect(isGalaxyApiPath(path)).toBe(true)
  })

  it.each([
    '/api/db/workflows',
    '/api/probe',
    '/',
    '/login',
    // a lookalike prefix must not be claimed, or the guard would answer for a
    // route that is none of its business
    '/api/galaxyfoo',
    '/api/galaxyfoo/bar',
  ])('leaves %s alone', (path) => {
    expect(isGalaxyApiPath(path)).toBe(false)
  })
})
