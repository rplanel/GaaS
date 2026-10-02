import { readdirSync } from 'node:fs'
import { sep } from 'node:path'

/** A route and method, as Nitro would give a file or as `addServerHandler` was told. */
export interface RouteAndMethod {
  readonly route: string
  /** Absent for a handler that answers every method. */
  readonly method?: string
}

/** The extensions Nitro scans a server directory for (`GLOB_SCAN_PATTERN`). */
const SCANNED_EXTENSION = /\.(?:js|mjs|cjs|ts|mts|cts|tsx|jsx)$/

/** Nitro's `suffixRegex`: an optional method, then an optional build env. */
const METHOD_SUFFIX = /(\.(?<method>connect|delete|get|head|options|patch|post|put|trace))?(\.(?<env>dev|prod|prerender))?$/

/**
 * The route and method Nitro's file routing would give a file under an
 * `api/` directory, from its path relative to that directory.
 *
 * Transcribed from `scanServerRoutes` in nitropack 2.13.4
 * (`dist/core/index.mjs`) rather than worked out afresh, so a route is
 * derived the way a Nitro app would have routed the same file: a `(group)/`
 * segment vanishes, `[...]` and `[...name]` catch everything, `[param]`
 * becomes `:param`, the method comes off the suffix and a trailing `index`
 * goes. Nitro also reads a `.dev`, `.prod` or `.prerender` env off the
 * suffix; no file here carries one, so it is stripped and not compared.
 */
export function nitroFileRoute(path: string): RouteAndMethod {
  let route = `/api/${path.split(sep).join('/')}`
    .replace(/\.[A-Z]+$/i, '')
    .replace(/\(([^(/\\]+)\)[/\\]/g, '')
    .replace(/\[\.{3}\]/g, '**')
    .replace(/\[\.{3}(\w+)\]/g, '**:$1')
    .replace(/\[([^/\]]+)\]/g, ':$1')
  const suffix = route.match(METHOD_SUFFIX)
  if (suffix?.index !== undefined)
    route = route.slice(0, suffix.index)
  route = route.replace(/\/index$/, '') || '/'
  const method = suffix?.groups?.method
  return method === undefined ? { route } : { route, method }
}

/**
 * Every file under `apiDir` Nitro would have scanned, as a path relative to
 * it, sorted so a failure lists them in a stable order.
 */
export function listHandlerFiles(apiDir: string): string[] {
  return readdirSync(apiDir, { recursive: true, encoding: 'utf8' })
    .filter(path => SCANNED_EXTENSION.test(path) && !path.endsWith('.d.ts'))
    .sort()
}

/** `GET /api/x`, or `ANY /api/x` for a handler that answers every method. */
export function describeRoute({ route, method }: RouteAndMethod): string {
  return `${method?.toUpperCase() ?? 'ANY'} ${route}`
}
