import { existsSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { GALAXY_ROUTE_ACCESS } from '../../src/runtime/server/utils/galaxyAccess'
import { describeRoute, listHandlerFiles, nitroFileRoute } from './handlerFiles'
import { withFixtureNuxt } from './loadFixture'

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '../../src')
const apiDir = join(srcDir, 'runtime/server/api')
const middlewareDir = join(srcDir, 'runtime/server/middleware')

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
 *
 * The cross-check of routes against `GALAXY_ROUTE_ACCESS` covers
 * `/api/galaxy` only. An `/api/db` handler holds its own level, so nothing
 * here says whether that level is right.
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
      // Every handler this module registers, read by its path: the other
      // modules' own routes (content's, supabase's) are in the same list and
      // are no business of this file.
      registrations: handlers
        .filter(handler => String(handler.handler).startsWith(srcDir))
        .map(handler => ({
          handler: String(handler.handler),
          route: handler.route,
          // Lower-cased because the case means nothing and differs: kit reads
          // a method off the handler's suffix when none is given, upper-cased
          // (`/api/galaxy/instance` is `GET` that way), and Nitro lower-cases
          // every method when it writes the router (nitropack 2.13.4).
          method: handler.method?.toLowerCase(),
          middleware: Boolean(handler.middleware),
        })),
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
 * nine was over it (#87). So the tests added for #99 and #79 read this same
 * one rather than taking a load of their own.
 */
let routes: Awaited<ReturnType<typeof loadRegisteredHandlers>>['routes']
let middleware: Awaited<ReturnType<typeof loadRegisteredHandlers>>['middleware']
let registrations: Awaited<ReturnType<typeof loadRegisteredHandlers>>['registrations']

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
  registrations = handlers.registrations
}, 60_000)

/**
 * The file a registration's handler path names, relative to `src/`, or
 * nothing when there is none: `resolver.resolve` is handed the path without
 * its extension, and Nitro adds it when it bundles.
 */
function fileOf(handler: string): string | undefined {
  const file = [handler, `${handler}.ts`].find(path => existsSync(path) && statSync(path).isFile())
  return file === undefined ? undefined : relative(srcDir, file)
}

/** A handler file, relative to `src/` as `module.ts` names it, with the route Nitro would give it. */
function handlerFiles() {
  return listHandlerFiles(apiDir).map(path => ({
    file: relative(srcDir, join(apiDir, path)),
    expected: nitroFileRoute(path),
  }))
}

/**
 * Every handler file is a route, and every route a handler file (#79).
 *
 * Nitro does not scan a module's `runtime/server/api`, so each file there is
 * reachable only through the `addServerHandler` call `module.ts` makes for
 * it — the omission #71's PATCH shipped with. Rather than list the routes a
 * second time here, the files themselves say what should be registered: the
 * route and method Nitro's own file routing would have given each, had this
 * been an app. A new file is checked the moment it exists, and a list
 * written here could not be.
 *
 * Both directions, as with the guard below: a file left unregistered is an
 * endpoint that answers 404, and a registration whose file is gone, or
 * whose route or method is not the one its file names, is a route that
 * either fails at build or answers something other than what its file says.
 */
describe('module server routes, read off the handler files (#79)', () => {
  it('derives routes the way Nitro\'s file routing would', () => {
    expect(nitroFileRoute('galaxy/instance.get.ts')).toEqual({ route: '/api/galaxy/instance', method: 'get' })
    expect(nitroFileRoute('db/workflows/[workflowId].patch.ts')).toEqual({ route: '/api/db/workflows/:workflowId', method: 'patch' })
    expect(nitroFileRoute('db/workflows/[workflowId]/index.ts')).toEqual({ route: '/api/db/workflows/:workflowId' })
    expect(nitroFileRoute('(admin)/files/[...path].get.ts')).toEqual({ route: '/api/files/**:path', method: 'get' })
  })

  it('registers every handler file, under the route and method Nitro would give it', () => {
    const files = handlerFiles()
    // The check must not be able to pass by finding nothing.
    expect(files.length).toBeGreaterThan(0)
    const unregistered = files.flatMap(({ file, expected }) => {
      const own = registrations.filter(registration => fileOf(registration.handler) === file)
      if (own.some(registration => registration.route === expected.route && registration.method === expected.method))
        return []
      const registeredAs = own.map(registration => describeRoute({ route: String(registration.route), method: registration.method }))
      return [`${file} should be ${describeRoute(expected)}, registered ${registeredAs.length > 0 ? `as ${registeredAs.join(', ')}` : 'nowhere'}`]
    })
    expect(unregistered).toEqual([])
  })

  it('registers no route but those files, each under the route and method its file names', () => {
    const files = new Map(handlerFiles().map(({ file, expected }) => [file, expected]))
    const routed = registrations.filter(registration => !registration.middleware)
    expect(routed.length).toBeGreaterThan(0)
    const strays = routed.flatMap(({ handler, route, method }) => {
      const registered = describeRoute({ route: String(route), method })
      const file = fileOf(handler)
      if (file === undefined)
        return [`${registered} names ${relative(srcDir, handler)}, which is no file`]
      const expected = files.get(file)
      if (expected === undefined)
        return [`${registered} names ${file}, which is not under runtime/server/api`]
      if (expected.route !== route || expected.method !== method)
        return [`${registered} names ${file}, which Nitro would route as ${describeRoute(expected)}`]
      return []
    })
    expect(strays).toEqual([])
  })

  it('registers every middleware file as middleware, and no middleware that is no file', () => {
    // Middleware has no route to derive, so the files and the registrations
    // are compared by path alone; a guard left unregistered guards nothing.
    const files = listHandlerFiles(middlewareDir).map(path => relative(srcDir, join(middlewareDir, path)))
    expect(files.length).toBeGreaterThan(0)
    const registered = registrations
      .filter(registration => registration.middleware)
      .map(({ handler }) => fileOf(handler) ?? `${relative(srcDir, handler)}, which is no file`)
    expect(registered.toSorted()).toEqual(files)
  })
})

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
