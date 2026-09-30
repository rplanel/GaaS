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
 * A page can reach an endpoint four ways, and the scan follows all four:
 * a path it spells itself, a Colada query it names, a composable it calls,
 * and a component it renders — the last two to any depth. Each has a
 * positive control below, because a scan over source text that silently
 * loses a path passes every other assertion.
 * Losing the query path is how #99 was missed in the first place: the page
 * that broke called `useFetch` directly and so appeared in no query's
 * consumer list.
 *
 * What it does **not** see. Each of these passes it green, so a page that
 * reaches an endpoint this way has its gate checked by hand:
 *
 * - a path assembled at runtime from pieces rather than written as one
 *   string or template;
 * - a composable defined anywhere but `nuxt-galaxy`'s
 *   `src/runtime/app/composables` and this layer's `app/composables`;
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
const composablesDirs = [
  join(dirname(fileURLToPath(import.meta.url)), '../../nuxt-galaxy/src/runtime/app/composables'),
  join(dirname(fileURLToPath(import.meta.url)), '../app/composables'),
]

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

/**
 * Whether `source` mentions `name` as a whole word — a call, an import, or a
 * comment alike. Queries and composables are both matched this way.
 */
function mentions(source: string, name: string): boolean {
  return new RegExp(`\\b${name}\\b`).test(source)
}

/**
 * The routes a source reaches by itself: the paths it spells, and the queries
 * and composables it names — `routesByName` maps each such name to its routes.
 */
function ownRoutes(source: string, routesByName: Map<string, string[]>): string[] {
  const viaNames = [...routesByName.entries()]
    .filter(([name]) => mentions(source, name))
    .flatMap(([, routes]) => routes)
  return [...new Set([...galaxyRoutesIn(source), ...viaNames])]
}

/**
 * Fold into each item the routes of every item it `reaches`, and of every
 * item those reach, until a pass adds nothing — so the answer is the same
 * whatever order the items come in, and whatever the depth of the chain.
 */
function foldToFixpoint<T extends { readonly routes: Set<string> }>(items: readonly T[], reaches: (from: T, to: T) => boolean): void {
  let grew = true
  while (grew) {
    grew = false
    for (const from of items) {
      for (const to of items) {
        if (to === from || !reaches(from, to)) {
          continue
        }
        for (const route of to.routes) {
          if (!from.routes.has(route)) {
            from.routes.add(route)
            grew = true
          }
        }
      }
    }
  }
}

/**
 * Composable name → the routes it reaches, through the queries it runs, the
 * paths it spells, and the composables it calls, followed to a fixpoint.
 *
 * Composables are auto-imported, so a caller has no import line naming them
 * and the bare name is all there is to match — the way a query is matched.
 * Every name a file exports is credited with every route the file reaches,
 * rather than splitting the file by function: `describeUnavailableTool`
 * shares a file with `useGalaxyWorkflowDescription` and so is credited with
 * the description route it never fetches. Loose again, and in the safe
 * direction, as with `renders`.
 */
function composableRoutes(sources: readonly string[], queries: Map<string, string[]>): Map<string, string[]> {
  const files = sources.map(source => ({
    source,
    names: [...source.matchAll(/export (?:async )?(?:function|const) (\w+)/g)].map(match => match[1]!),
    routes: new Set(ownRoutes(source, queries)),
  }))
  // One composable can call another.
  foldToFixpoint(files, (caller, callee) => callee.names.some(name => mentions(caller.source, name)))
  const byName = new Map<string, string[]>()
  for (const { names, routes } of files) {
    if (routes.size > 0) {
      for (const name of names) {
        byName.set(name, [...routes])
      }
    }
  }
  return byName
}

/**
 * Whether `source` renders the component in `<basename>.vue`.
 *
 * Nuxt names an auto-imported component after its path, so
 * `components/admin/PublishVersionModal.vue` is `<AdminPublishVersionModal>`:
 * the tag *ends with* the file's basename, whatever prefix the directories
 * give it — none at all when the basename already starts with it, as
 * `components/analysis/AnalysisHistoryPanel.vue` is `<AnalysisHistoryPanel>`
 * (#127). Matching on that ending rather than reproducing Nuxt's naming rules
 * is deliberately loose, and loose is the safe direction here — a false match
 * can only credit a page with *more* routes, which fails the check below, never
 * with fewer, which would pass it.
 */
function renders(source: string, basename: string): boolean {
  const name = componentName(basename)
  const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
  return new RegExp(`<(?:[A-Z][A-Za-z0-9]*)?${name}\\b`).test(source)
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
function componentReadings(routesByName: Map<string, string[]>): ComponentReading[] {
  const components = filesUnder(componentsDir, ['.vue']).map((file) => {
    const source = readFileSync(file, 'utf8')
    return {
      basename: file.slice(file.lastIndexOf('/') + 1, -'.vue'.length),
      source,
      routes: new Set(ownRoutes(source, routesByName)),
    }
  })
  // A component can render one that renders another.
  foldToFixpoint(components, (parent, child) => renders(parent.source, child.basename))
  return components
}

interface PageReading {
  readonly page: string
  readonly routes: string[]
  readonly declaresAdmin: boolean
}

function pagesReadingGalaxy(): PageReading[] {
  const queries = queryRoutes()
  const composables = composablesDirs
    .flatMap(dir => filesUnder(dir, ['.ts']))
    .map(file => readFileSync(file, 'utf8'))
  const routesByName = new Map([...queries, ...composableRoutes(composables, queries)])
  const components = componentReadings(routesByName)
  return filesUnder(pagesDir, ['.vue']).flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    const viaComponents = components
      .filter(({ basename }) => renders(source, basename))
      .flatMap(({ routes }) => [...routes])
    const routes = [...new Set([...ownRoutes(source, routesByName), ...viaComponents])]
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

  it('sees a component rendered under its bare name, with no directory prefix', () => {
    // `components/analysis/AnalysisHistoryPanel.vue` is `<AnalysisHistoryPanel>`
    // — Nuxt drops a directory prefix the basename already starts with — and
    // `/analyses/:analysisId` reaches the description only by rendering it.
    // Matching demanded a prefix once, so the page was credited with nothing.
    const bare = readings.find(({ page }) => page === join('analyses', '[analysisId].vue'))
    expect(bare?.routes).toContain('/api/galaxy/workflows/:param/revisions/:param/description')
  })

  it('sees what a page reaches only through a composable', () => {
    // The fourth path (#127). `/workflows/:workflowId/run` reaches the
    // description in exactly one way: `<GalaxyWorkflowInvokeForm>` calls
    // `useGalaxyWorkflowDescription`, which runs
    // `galaxyWorkflowDescriptionQuery`. Neither the page nor the component
    // names the query or spells the path, so without composables this route
    // is invisible — and so is every page reading it, if it turns `admin`.
    const viaComposable = readings.find(({ page }) => page.endsWith(join('workflows', '[workflowId]', 'run.vue')))
    expect(viaComposable?.routes).toContain('/api/galaxy/workflows/:param/revisions/:param/description')
  })

  it('follows a composable that calls another, to any depth', () => {
    // No composable calls another on the way to Galaxy today, so this control
    // runs on made-up sources. Listed caller first, so a single pass of the
    // fold cannot reach the route and only the fixpoint does.
    const reached = composableRoutes([
      'export function useOuter() { return useMiddle() }',
      'export function useMiddle() { return useInner() }',
      'export function useInner() { return useQuery(someQuery) }',
    ], new Map([['someQuery', ['/api/galaxy/somewhere']]]))
    expect(reached.get('useOuter')).toEqual(['/api/galaxy/somewhere'])
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
