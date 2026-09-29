import { beforeAll, describe, expect, it } from 'vitest'
import { GALAXY_ROUTE_ACCESS } from '../../src/runtime/server/utils/galaxyAccess'
import { withFixtureNuxt } from './loadFixture'

/**
 * The server handlers the module registers, read back from Nitro's handler
 * list once the module has run. A handler file under `runtime/server/api`
 * is not a route until `addServerHandler` names it: #71's PATCH handler was
 * written, tested through a direct import, and never registered, so the
 * running app answered 404 to the Active switch. This is the check that
 * would have said so.
 *
 * Middleware is read out separately because it has no `route` of its own —
 * `addServerHandler({ middleware: true })` registers a handler that runs for
 * every request — and a guard that is not registered guards nothing, which is
 * the same class of omission as the unregistered PATCH.
 */
async function loadRegisteredHandlers() {
  return withFixtureNuxt((options) => {
    // A predicate rather than `Boolean`, which does not narrow: the list is
    // typed as possibly holding holes, and every read below would be an error
    // without this.
    const handlers = (options.nitro.handlers ?? [])
      .filter((handler): handler is NonNullable<typeof handler> => Boolean(handler))
    return {
      routes: handlers.flatMap(handler =>
        typeof handler.route === 'string' ? [{ route: handler.route, method: handler.method }] : [],
      ),
      middleware: handlers
        .filter(handler => handler.middleware)
        .map(handler => String(handler.handler)),
    }
  })
}

/**
 * The handler list, read once for the whole file.
 *
 * Every test here asks one question of one answer, and loading a whole Nuxt
 * per test bought nothing but seconds — and a hazard. `@nuxt/content` is a
 * module dependency of this one, and its `close` hook drops its content
 * tables from a SQLite database the fixture never builds; enough load/close
 * cycles in one file and that rejection lands unhandled, failing the run
 * with every test passing. Four loads in this file was under the threshold,
 * nine was over it (#87). So the tests added for #99 read this same one
 * rather than taking a load of their own.
 */
let routes: Awaited<ReturnType<typeof loadRegisteredHandlers>>['routes']
let middleware: Awaited<ReturnType<typeof loadRegisteredHandlers>>['middleware']

/** Every distinct `/api/galaxy/*` route Nitro has, however it was registered. */
function registeredGalaxyRoutes(): string[] {
  return [...new Set(
    routes
      .filter(handler => handler.route.startsWith('/api/galaxy'))
      .map(handler => handler.route),
  )]
}

beforeAll(async () => {
  const handlers = await loadRegisteredHandlers()
  routes = handlers.routes
  middleware = handlers.middleware
}, 60_000)

describe('module server routes', () => {
  it('registers the version row\'s routes: retire or make active again, and delete (ADR 0004)', () => {
    expect(routes).toContainEqual({ route: '/api/db/workflows', method: 'post' })
    expect(routes).toContainEqual({ route: '/api/db/workflows/:workflowId', method: 'patch' })
    expect(routes).toContainEqual({ route: '/api/db/workflows/:workflowId', method: 'delete' })
  })

  it('registers the state of one version, read live from Galaxy for the admin page (#76)', () => {
    expect(routes).toContainEqual({ route: '/api/db/workflows/:workflowId/state', method: 'get' })
  })

  it('registers the Galaxy proxies the publish dialog reads: the revisions, and the tool check of one revision (#73, #75)', () => {
    expect(routes).toContainEqual({ route: '/api/galaxy/workflows/:workflowId/versions', method: 'get' })
    expect(routes).toContainEqual({ route: '/api/galaxy/workflows/:workflowId/revisions/:revision/tools', method: 'get' })
  })

  it('registers one revision\'s description, which the invoke form and the analysis panel read (#87)', () => {
    expect(routes).toContainEqual({ route: '/api/galaxy/workflows/:workflowId/revisions/:revision/description', method: 'get' })
  })

  it('gives the unpinned description no route, so nothing can ask for what must not be cached (#87, Q15)', () => {
    expect(routes.map(handler => handler.route)).not.toContain('/api/galaxy/workflows/:workflowId/description')
  })

  it('gives the two proxies nothing read no route either (#99)', () => {
    const galaxyRoutes = routes.map(handler => handler.route)
    // Both were replaced by #87's description endpoint and reached by no
    // client. Deleted rather than guarded, so the tool definition that carried
    // `options.hda` is no longer served at all.
    expect(galaxyRoutes).not.toContain('/api/galaxy/workflows/:workflowId')
    expect(galaxyRoutes).not.toContain('/api/galaxy/tools/:toolId/:toolVersion')
  })
})

/**
 * The guard's coverage, checked against Nitro's own handler list (#99).
 *
 * Read from the registered routes rather than from a list written here: a
 * hand-written list of what to cover would repeat, in test form, the very
 * omission #99 records. Whatever `addServerHandler` registers under
 * `/api/galaxy` is what gets checked.
 *
 * Both directions, because each catches a different mistake: a route with no
 * level is an endpoint falling back on the closed default without anyone
 * deciding that is right for it, and a level with no route is a rule left
 * behind after a route was deleted, which quietly misleads the next reader
 * about what the surface is.
 */
describe('the galaxy access guard (#99)', () => {
  it('is registered as a server middleware, so it actually runs', () => {
    expect(middleware.some(handler => handler.includes('middleware/galaxyGuard'))).toBe(true)
  })

  it('gives every registered galaxy route a level of its own', () => {
    const galaxyRoutes = registeredGalaxyRoutes()
    // The check must not be able to pass by finding nothing.
    expect(galaxyRoutes.length).toBeGreaterThan(0)
    expect(galaxyRoutes.filter(route => !(route in GALAXY_ROUTE_ACCESS))).toEqual([])
  })

  it('holds no level for a route that is no longer registered', () => {
    const galaxyRoutes = new Set(registeredGalaxyRoutes())
    expect(Object.keys(GALAXY_ROUTE_ACCESS).length).toBeGreaterThan(0)
    expect(Object.keys(GALAXY_ROUTE_ACCESS).filter(pattern => !galaxyRoutes.has(pattern))).toEqual([])
  })
})
