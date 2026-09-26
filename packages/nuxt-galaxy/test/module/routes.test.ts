import { beforeAll, describe, expect, it } from 'vitest'
import { withFixtureNuxt } from './loadFixture'

/**
 * The server routes the module registers, read back from Nitro's handler
 * list once the module has run. A handler file under `runtime/server/api`
 * is not a route until `addServerHandler` names it: #71's PATCH handler was
 * written, tested through a direct import, and never registered, so the
 * running app answered 404 to the Active switch. This is the check that
 * would have said so.
 */
async function loadRegisteredRoutes() {
  return withFixtureNuxt(options =>
    (options.nitro.handlers ?? []).flatMap(handler => handler ? [{ route: handler.route, method: handler.method }] : []),
  )
}

/**
 * The route list, read once for the whole file.
 *
 * Every test here asks one question of one answer, and loading a whole Nuxt
 * per test bought nothing but seconds — and a hazard. `@nuxt/content` is a
 * module dependency of this one, and its `close` hook drops its content
 * tables from a SQLite database the fixture never builds; enough load/close
 * cycles in one file and that rejection lands unhandled, failing the run
 * with every test passing. Four loads in this file was under the threshold,
 * nine was over it (#87).
 */
let routes: Awaited<ReturnType<typeof loadRegisteredRoutes>>

beforeAll(async () => {
  routes = await loadRegisteredRoutes()
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
})
