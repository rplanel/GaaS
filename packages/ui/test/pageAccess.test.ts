import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GALAXY_ROUTE_ACCESS } from 'nuxt-galaxy'
import { describe, expect, it } from 'vitest'

/**
 * A page that can reach an `admin` endpoint must ask for the admin role
 * itself (#99).
 *
 * The server refusing is not enough, and that is the whole lesson here. When
 * `GET /api/galaxy/workflows` became admin-only, `/galaxy/workflows` went on
 * calling it, never looked at the 403, and drew an empty list: a page saying
 * there are no workflows, to a user who simply may not see them. Nothing
 * failed — not the suite, not the endpoint tests, not a review of the diff —
 * because the page has no test and nothing links to it.
 *
 * So the pairing is asserted rather than remembered, against the table the
 * server actually enforces rather than a copy kept here.
 *
 * A page can reach an endpoint three ways, and the scan follows all three:
 * a path it spells itself, a Colada query it names, and a component it
 * renders — to any depth. Each has a positive control below, because a scan
 * over source text that silently loses a path passes every other assertion.
 * Losing the query path is how #99 was missed in the first place: the page
 * that broke called `useFetch` directly and so appeared in no query's
 * consumer list.
 *
 * What it does **not** see. Each of these passes it green, so a page that
 * reaches an endpoint this way has its gate checked by hand:
 *
 * - an endpoint reached through a composable (#127);
 * - a path assembled at runtime from pieces rather than written as one
 *   string or template;
 * - anything outside `/api/galaxy`. Levels come from `GALAXY_ROUTE_ACCESS`
 *   alone, and an `/api/db` handler holds its own level.
 *
 * What it does not accept: a gate inside the page (`enabled: isAdmin`, a
 * `v-if`). Only `middleware: 'admin'` counts, so a page non-admins also use,
 * gated correctly in its body, fails here until this test learns that form.
 *
 * `GALAXY_ROUTE_ACCESS` is imported from the **built** `nuxt-galaxy`. After
 * changing a level, run `pnpm --filter nuxt-galaxy run prepack` first, or
 * this checks every page against the old table and stays green.
 *
 * `.agents/skills/endpoint-blast-radius` sends agents to this list instead of
 * keeping a copy, so a change to what the scan sees belongs here.
 */

const pagesDir = join(dirname(fileURLToPath(import.meta.url)), '../app/pages')
const queriesDir = join(dirname(fileURLToPath(import.meta.url)), '../../nuxt-galaxy/src/runtime/app/queries')
const componentsDir = join(dirname(fileURLToPath(import.meta.url)), '../app/components')

/**
 * Every file under `dir` with one of `extensions`, **sorted**: `readdirSync`
 * returns entries in whatever order the filesystem keeps them, so an unsorted
 * walk could visit components in a different order on CI than locally. The
 * fixpoint below makes the answer independent of order, but a failure is
 * easier to reproduce when the walk is the same everywhere.
 */
function filesUnder(dir: string, extensions: readonly string[]): string[] {
  return readdirSync(dir).sort().flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      return filesUnder(path, extensions)
    }
    return extensions.some(extension => entry.endsWith(extension)) ? [path] : []
  })
}

/**
 * Every `/api/galaxy/*` path a source file mentions, as a route pattern.
 *
 * Both spellings are read — a literal path and a template with `${…}` in it —
 * because both reach the server and only one of them is visible from the
 * query layer. Tracing consumers through the Colada query names alone is
 * exactly what hid `/galaxy/workflows`: it calls `useFetch` directly, so it
 * appears in no query's consumer list.
 */
function galaxyRoutesIn(source: string): string[] {
  return [...source.matchAll(/['"`](\/api\/galaxy\/[^'"`]*)['"`]/g)]
    .map(match => match[1]!)
    // `${workflowId}` and `${revision}` stand where `:workflowId` and
    // `:revision` stand in the registered pattern.
    .map(path => path.replace(/\$\{[^}]*\}/g, ':param'))
}

/** The registered pattern a path refers to, by shape rather than by name. */
function patternOf(path: string): string | undefined {
  const wanted = path.split('/').length
  return Object.keys(GALAXY_ROUTE_ACCESS).find((pattern) => {
    const segments = pattern.split('/')
    if (segments.length !== wanted) {
      return false
    }
    return segments.every((segment, index) => {
      const actual = path.split('/')[index]
      return segment.startsWith(':') ? actual === ':param' || !actual?.includes('/') : segment === actual
    })
  })
}

/** Query name → the routes it calls, read from the query definitions themselves. */
function queryRoutes(): Map<string, string[]> {
  const byName = new Map<string, string[]>()
  for (const file of filesUnder(queriesDir, ['.ts'])) {
    const source = readFileSync(file, 'utf8')
    // Each `export const <name> = defineQueryOptions(` block runs to the next
    // one, which is enough to attribute a path to the query that fetches it.
    const blocks = source.split(/export const /).slice(1)
    for (const block of blocks) {
      const name = block.match(/^(\w+)/)?.[1]
      if (!name) {
        continue
      }
      const routes = galaxyRoutesIn(block)
      if (routes.length > 0) {
        byName.set(name, routes)
      }
    }
  }
  return byName
}

/** The routes a source reaches by itself: the paths it spells, and the queries it names. */
function ownRoutes(source: string, queries: Map<string, string[]>): string[] {
  const viaQueries = [...queries.entries()]
    .filter(([name]) => new RegExp(`\\b${name}\\b`).test(source))
    .flatMap(([, routes]) => routes)
  return [...new Set([...galaxyRoutesIn(source), ...viaQueries])]
}

/**
 * Whether `source` renders the component in `<basename>.vue`.
 *
 * Nuxt names an auto-imported component after its path, so
 * `components/admin/PublishVersionModal.vue` is `<AdminPublishVersionModal>`:
 * the tag *ends with* the file's basename, whatever prefix the directories
 * give it. Matching on that ending rather than reproducing Nuxt's naming rules
 * is deliberately loose, and loose is the safe direction here — a false match
 * can only credit a page with *more* routes, which fails the check below, never
 * with fewer, which would pass it.
 */
function renders(source: string, basename: string): boolean {
  const name = componentName(basename)
  const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
  return new RegExp(`<[A-Z][A-Za-z0-9]*${name}\\b`).test(source)
    || new RegExp(`<(?:[a-z0-9]+-)*${kebab}\\b`).test(source)
}

/**
 * The PascalCase name Nuxt gives a component file, before any directory
 * prefix: the `.client` / `.server` mode suffix dropped, and every run of
 * non-alphanumerics treated as a word break.
 *
 * Matching on the raw basename instead missed two real files in this layer —
 * `HeroShaders.client.vue` is `<HeroShaders>`, and `upload.vue` is
 * `<…Upload>` — and put a bare `.` into a regular expression besides. Neither
 * reaches Galaxy today, which is luck rather than coverage.
 */
function componentName(basename: string): string {
  return basename
    .replace(/\.(client|server)$/, '')
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map(word => word[0]!.toUpperCase() + word.slice(1))
    .join('')
}

interface ComponentReading {
  readonly basename: string
  readonly source: string
  readonly routes: Set<string>
}

/**
 * Every component, with the routes it reaches — its own, and those of every
 * component it renders, followed to a fixpoint.
 *
 * Without this a page could reach an `admin` endpoint through a child and the
 * check would never see it: `PublishVersionModal` reads `…/versions` and
 * `…/revisions/:revision/tools`, and `/admin/workflows` reaches both only by
 * rendering it.
 */
function componentReadings(queries: Map<string, string[]>): ComponentReading[] {
  const components = filesUnder(componentsDir, ['.vue']).map((file) => {
    const source = readFileSync(file, 'utf8')
    return {
      basename: file.slice(file.lastIndexOf('/') + 1, -'.vue'.length),
      source,
      routes: new Set(ownRoutes(source, queries)),
    }
  })
  // A component can render one that renders another; keep folding children's
  // routes into their parents until a pass adds nothing.
  let grew = true
  while (grew) {
    grew = false
    for (const parent of components) {
      for (const child of components) {
        if (child === parent || !renders(parent.source, child.basename)) {
          continue
        }
        for (const route of child.routes) {
          if (!parent.routes.has(route)) {
            parent.routes.add(route)
            grew = true
          }
        }
      }
    }
  }
  return components
}

interface PageReading {
  readonly page: string
  readonly routes: string[]
  readonly declaresAdmin: boolean
}

function pagesReadingGalaxy(): PageReading[] {
  const queries = queryRoutes()
  const components = componentReadings(queries)
  return filesUnder(pagesDir, ['.vue']).flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    const viaComponents = components
      .filter(({ basename }) => renders(source, basename))
      .flatMap(({ routes }) => [...routes])
    const routes = [...new Set([...ownRoutes(source, queries), ...viaComponents])]
    if (routes.length === 0) {
      return []
    }
    return [{
      page: relative(pagesDir, file),
      routes,
      // `middleware: 'admin'` or `middleware: ['admin', …]`, inside
      // `definePageMeta`.
      declaresAdmin: /middleware:\s*(?:['"`]admin['"`]|\[[^\]]*['"`]admin['"`])/.test(source),
    }]
  })
}

describe('a page that reads an admin endpoint declares the admin guard (#99)', () => {
  const readings = pagesReadingGalaxy()

  /**
   * The scan is regex over source, so it can only fail safe if it is known to
   * find something. Without these two, a change to how pages fetch would make
   * every assertion below vacuously true and say nothing.
   */
  it('finds pages, and resolves what they read to registered routes', () => {
    expect(readings.length).toBeGreaterThan(0)
    const unresolved = readings.flatMap(({ page, routes }) =>
      routes.filter(route => patternOf(route) === undefined).map(route => `${page} → ${route}`),
    )
    expect(unresolved).toEqual([])
  })

  it('sees a page that fetches directly, not only pages using a query', () => {
    // `/galaxy/workflows` calls `useFetch('/api/galaxy/workflows')` with no
    // query in between. If this stops holding, the scan has lost the half
    // that mattered.
    const direct = readings.find(({ page }) => page.endsWith(join('galaxy', 'workflows', 'index.vue')))
    expect(direct?.routes).toContain('/api/galaxy/workflows')
  })

  it('sees a page that reads through a query, not only pages that fetch directly', () => {
    // The other half, and it needs its own control: `/admin/workflows` reaches
    // galaxy only through `galaxyWorkflowsListQuery`, so if query attribution
    // broke it would drop out of `readings` without a trace — and every other
    // assertion here would still pass on the direct-fetch pages alone.
    const viaQuery = readings.find(({ page }) => page.endsWith(join('admin', 'workflows.vue')))
    expect(viaQuery?.routes).toContain('/api/galaxy/workflows')
  })

  it('sees what a page reaches only through a component it renders', () => {
    // The third path, with its own control for the same reason as the other
    // two. `/admin/workflows` reaches `…/versions` in exactly one way: by
    // rendering `<AdminPublishVersionModal>`. If component resolution broke,
    // this route would vanish from the page and nothing else would notice.
    const viaComponent = readings.find(({ page }) => page.endsWith(join('admin', 'workflows.vue')))
    expect(viaComponent?.routes).toContain('/api/galaxy/workflows/:param/versions')
  })

  it('leaves no page reading an admin endpoint without the guard', () => {
    const ungated = readings
      .filter(({ declaresAdmin }) => !declaresAdmin)
      .flatMap(({ page, routes }) => routes
        .filter(route => GALAXY_ROUTE_ACCESS[patternOf(route)!] === 'admin')
        .map(route => `${page} reads ${route} (admin) without middleware: 'admin'`))

    expect(ungated).toEqual([])
  })

  it('has at least one gated page, so the rule above is actually exercised', () => {
    const gated = readings.filter(({ declaresAdmin, routes }) =>
      declaresAdmin && routes.some(route => GALAXY_ROUTE_ACCESS[patternOf(route)!] === 'admin'),
    )
    expect(gated.length).toBeGreaterThan(0)
  })
})
