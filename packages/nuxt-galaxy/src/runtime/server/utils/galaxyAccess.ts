/**
 * Who may call each `/api/galaxy/*` endpoint (#99).
 *
 * Every one of these proxies Galaxy under the service account's own API key,
 * so reaching one is reaching that key. Before #99 none of them asked for a
 * session, and the gap was not a handler that forgot: it was that there was
 * nowhere for the rule to live, so each new proxy inherited the absence of
 * one. This table is that place, and `galaxyGuard` is the single reader of
 * it.
 *
 * Raising a level here can blank a page that reads the endpoint, since pages
 * are not route-gated. `.agents/skills/endpoint-blast-radius` is the
 * procedure for finding every such page before the change lands.
 *
 * Three levels, named for the words the rest of the server already uses —
 * `httpError.ts` says "a caller with no session", `state.get.ts` says "a
 * session is required, as for every version endpoint":
 *
 * - `open`    — anyone, signed in or not.
 * - `session` — any signed-in user.
 * - `admin`   — a signed-in user holding the `admin` role. The string is a
 *               `RoleType` member on purpose, so the guard hands it straight
 *               to `requireRole` rather than mapping it to one.
 */
export type GalaxyRouteAccess = 'open' | 'session' | 'admin'

/**
 * The level of every registered `/api/galaxy/*` route, keyed by the route
 * pattern exactly as `addServerHandler` registers it in `module.ts`.
 *
 * Keyed by the pattern rather than by the handler file because the pattern is
 * what a request is matched against, and because `routes.test.ts` can then
 * compare these keys with Nitro's own handler list — in both directions, so a
 * route with no level and a level with no route each fail the suite. A list
 * written by hand would be the same omission #99 is about.
 *
 * Why each is what it is:
 *
 * - `health` is **open** because the landing page reads it while signed out.
 *   `GalaxyStatusBanner` sits in the `landing` layout, `pages/index.vue` uses
 *   that layout, and `/` is in `@nuxtjs/supabase`'s `exclude` list. A 401
 *   there fails the query, leaves `health` undefined, and `isVisible` —
 *   `health?.status !== 'up'` — then shows every anonymous visitor a false
 *   "Galaxy Unavailable". It answers a status, a URL already published in
 *   `runtimeConfig.public`, and a maintenance window; `/api/probe` covers
 *   liveness separately.
 * - `instance` and `histories` need a **session**. `instance` adds only
 *   Galaxy's version to a URL the client bundle already carries. `histories`
 *   reads `galaxy.histories` through the *caller's* Supabase client, whose
 *   policy is `owner_id = (select auth.uid())` `TO authenticated`, so the
 *   database already scopes it to the caller's own rows and a session is the
 *   whole of what is missing.
 * - `…/revisions/:revision/description` needs a **session** and no more.
 *   Since #88 it is read from the stored definition in `galaxy.workflows`, so
 *   it cannot describe a revision nobody published, and that table's SELECT
 *   policy is already `TO authenticated USING (true)`.
 * - The other three are **admin**, because each reaches the service account's
 *   Galaxy rather than what GaaS published: `workflows` lists the whole
 *   stored-workflow list with `includeHidden: true`, and `…/versions` and
 *   `…/revisions/:revision/tools` serve `PublishVersionModal.vue`, the latter
 *   by exporting any workflow from Galaxy, published or not. So they are
 *   withheld from a signed-in user too, not only from an anonymous one.
 *
 *   What reads them is *not* only the admin pages, and assuming so is what
 *   made this level look free: `packages/ui`'s `/galaxy/workflows` read the
 *   listing through a plain `useFetch` with nothing gating the page, so
 *   raising the level turned it into a silent empty list until an `admin`
 *   route middleware was put in front of it. The level is justified by what
 *   the endpoint exposes, not by who happens to call it today.
 */
export const GALAXY_ROUTE_ACCESS: Readonly<Record<string, GalaxyRouteAccess>> = {
  '/api/galaxy/health': 'open',
  '/api/galaxy/instance': 'session',
  '/api/galaxy/histories': 'session',
  '/api/galaxy/workflows/:workflowId/revisions/:revision/description': 'session',
  '/api/galaxy/workflows': 'admin',
  '/api/galaxy/workflows/:workflowId/versions': 'admin',
  '/api/galaxy/workflows/:workflowId/revisions/:revision/tools': 'admin',
}

/** The prefix every route this guard owns begins with. */
const GALAXY_API_PREFIX = '/api/galaxy'

/**
 * The path alone: no query, no fragment, and no trailing slash.
 *
 * `event.path` carries the query string, and a level must not depend on it —
 * `?version=1` is not a different endpoint. The trailing slash goes because
 * Nitro answers `/api/galaxy/health/` from the same handler as
 * `/api/galaxy/health`, and a guard that disagreed with the router about that
 * would refuse a request the router is about to serve.
 */
function pathnameOf(path: string): string {
  const cut = path.search(/[?#]/)
  const pathname = cut === -1 ? path : path.slice(0, cut)
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

/**
 * Whether this request is one of ours.
 *
 * `/api/galaxy` is tested as well as `/api/galaxy/`, so a route registered at
 * the bare prefix one day is still the guard's. Checking only the prefix with
 * a slash is how a route escapes a middleware, which is the shape of the bug
 * #99 records.
 */
export function isGalaxyApiPath(path: string): boolean {
  const pathname = pathnameOf(path)
  return pathname === GALAXY_API_PREFIX || pathname.startsWith(`${GALAXY_API_PREFIX}/`)
}

/**
 * Whether `pattern` matches `segments`, and how specifically.
 *
 * `null` for no match; otherwise how many parameters the match spent —
 * **fewer is more specific**, and the caller keeps the lowest. A `:param` matches any
 * one segment, the empty one included: an empty middle segment satisfies a
 * parameter in h3's router — `/api/galaxy/workflows//versions` reaches the
 * versions handler with an empty `workflowId` — and a guard that rejected it
 * would send the request to a different level than the router sends it to a
 * handler.
 */
function parametersSpent(pattern: string, segments: readonly string[]): number | null {
  const patternSegments = pattern.split('/')
  if (patternSegments.length !== segments.length) {
    return null
  }
  let parameters = 0
  for (const [index, patternSegment] of patternSegments.entries()) {
    if (patternSegment.startsWith(':')) {
      parameters += 1
      continue
    }
    if (patternSegment !== segments[index]) {
      return null
    }
  }
  return parameters
}

/**
 * The level a request at `path` must clear.
 *
 * **Unlisted paths are `admin`.** What a new proxy inherits is therefore the
 * strictest answer rather than the most permissive (see the file header for
 * why that matters): it is guarded on the day it is registered, and the
 * `routes.test.ts` cross-check tells whoever added it to give it a level of
 * its own — a failing test rather than an open endpoint.
 *
 * The same default absorbs any disagreement with Nitro's router. This matches
 * the raw path and does not percent-decode, so an encoded literal segment —
 * `/api/galaxy/%68ealth` — fails to match here while the router still resolves
 * it. Every such divergence lands on `admin`, so it can cost a caller an
 * answer they were entitled to but can never hand one over.
 *
 * The most specific pattern wins, as a radix router resolves it: today no two
 * patterns can match the same path, since the four single-segment routes are
 * all literals and the two eight-segment ones differ in their last segment,
 * but a literal route added later beside a parameterised one must not be
 * decided by which was written first.
 *
 * `table` is the real one for every caller; it is a parameter so that the rule
 * in the paragraph above can be proved against a pair of patterns that do
 * overlap, which the real table deliberately has none of.
 */
export function accessForPath(
  path: string,
  table: Readonly<Record<string, GalaxyRouteAccess>> = GALAXY_ROUTE_ACCESS,
): GalaxyRouteAccess {
  const segments = pathnameOf(path).split('/')
  let best: { access: GalaxyRouteAccess, spent: number } | undefined

  for (const [pattern, access] of Object.entries(table)) {
    const spent = parametersSpent(pattern, segments)
    if (spent !== null && (best === undefined || spent < best.spent)) {
      best = { access, spent }
    }
  }

  return best?.access ?? 'admin'
}
