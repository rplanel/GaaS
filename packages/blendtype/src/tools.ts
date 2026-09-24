import type { Layer } from 'effect'
import type { GalaxyTool } from './types'
import { Effect } from 'effect'
import { extractStatusCode, formatErrorMessage, ToolError } from './errors'
import { GalaxyFetch, toGalaxyServiceUnavailable, withRetry } from './galaxy'

/**
 * Retrieves a tool by ID and version using Effect-based error handling.
 *
 * Galaxy reads the version to describe from the `tool_version` query
 * parameter (`GET /api/tools/{id}`, `show` in `api/tools.py`); until #75 this
 * sent `version`, which Galaxy ignores, so the tool came back at whatever
 * version the id alone resolved to. Note what Galaxy does when it lacks the
 * version asked for: `get_tool` is called without `exact`, so it answers
 * **200 with another installed version of the same tool** when it has one,
 * and 404 only when it has none. A caller that needs the exact version has to
 * read the answer's `version`, not the status.
 *
 * The version is URL-encoded: toolshed versions carry a `+` (`1.2.3+galaxy0`),
 * and a raw `+` in a query string is a space to the server that decodes it,
 * so Galaxy read `1.2.3 galaxy0`, held no such version and answered another.
 * The id is sent as is: its slashes are the path Galaxy's route expects, and a
 * `+` in a path segment is literal.
 *
 * @param toolId - The unique identifier of the tool to retrieve
 * @param version - The version of the tool to retrieve
 * @returns An Effect that yields the GalaxyTool or fails with a ToolError
 *
 * @example
 * ```typescript
 * const tool = getToolEffect('my-tool', '1.0.0')
 * const result = await Effect.runPromise(tool)
 * ```
 *
 * @throws {ToolError} When the tool cannot be retrieved
 */
export function getToolEffect(toolId: string, version: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const tool = Effect.tryPromise({
      try: () => fetchApi<GalaxyTool>(
        `api/tools/${toolId}?io_details=true&tool_version=${encodeURIComponent(version)}`,
        {
          method: 'GET',
        },
      ),
      catch: caughtError => new ToolError({
        message: formatErrorMessage('tool', toolId, 'Error getting', caughtError),
        toolId,
        statusCode: extractStatusCode(caughtError),
        cause: caughtError,
      }),
    })
    return yield* tool
  }).pipe(withRetry)
}

/**
 * Retrieves a tool by ID and version.
 *
 * @param toolId - The unique identifier of the tool
 * @param version - The version of the tool
 * @param layer - A Layer providing GalaxyFetch (use makeGalaxyLayer() to create one)
 * @returns Promise that resolves to GalaxyTool
 */
export function getTool(toolId: string, version: string, layer: Layer.Layer<GalaxyFetch>) {
  return getToolEffect(toolId, version).pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}
