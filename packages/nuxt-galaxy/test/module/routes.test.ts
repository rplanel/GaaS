import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadNuxt } from '@nuxt/kit'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtureDir = join(__dirname, '../fixtures/basic')

/**
 * The server routes the module registers, read back from Nitro's handler
 * list once the module has run. A handler file under `runtime/server/api`
 * is not a route until `addServerHandler` names it: #71's PATCH handler was
 * written, tested through a direct import, and never registered, so the
 * running app answered 404 to the Active switch. This is the check that
 * would have said so.
 */
async function registeredRoutes() {
  const nuxt = await loadNuxt({
    cwd: fixtureDir,
    dev: false,
    ready: false,
    overrides: { ssr: false, test: true },
  })
  await nuxt.ready()
  const handlers = nuxt.options.nitro.handlers ?? []
  await nuxt.close()
  return handlers.flatMap(handler => handler ? [{ route: handler.route, method: handler.method }] : [])
}

describe('module server routes', () => {
  it('registers the version row\'s routes: retire or make active again, and delete (ADR 0004)', async () => {
    const routes = await registeredRoutes()

    expect(routes).toContainEqual({ route: '/api/db/workflows', method: 'post' })
    expect(routes).toContainEqual({ route: '/api/db/workflows/:workflowId', method: 'patch' })
    expect(routes).toContainEqual({ route: '/api/db/workflows/:workflowId', method: 'delete' })
  })

  it('registers the state of one version, read live from Galaxy for the admin page (#76)', async () => {
    const routes = await registeredRoutes()

    expect(routes).toContainEqual({ route: '/api/db/workflows/:workflowId/state', method: 'get' })
  })

  it('registers the Galaxy proxies the publish dialog reads: the revisions, and the tool check of one revision (#73, #75)', async () => {
    const routes = await registeredRoutes()

    expect(routes).toContainEqual({ route: '/api/galaxy/workflows/:workflowId/versions', method: 'get' })
    expect(routes).toContainEqual({ route: '/api/galaxy/workflows/:workflowId/revisions/:revision/tools', method: 'get' })
  })

  it('registers one revision\'s description, which the invoke form and the analysis panel read (#87)', async () => {
    const routes = await registeredRoutes()

    expect(routes).toContainEqual({ route: '/api/galaxy/workflows/:workflowId/revisions/:revision/description', method: 'get' })
  })

  it('gives the unpinned description no route, so nothing can ask for what must not be cached (#87, Q15)', async () => {
    const routes = await registeredRoutes()

    expect(routes.map(handler => handler.route)).not.toContain('/api/galaxy/workflows/:workflowId/description')
  })
})
