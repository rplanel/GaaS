import type { Layer } from 'effect'
import type { GalaxyTool } from './types'
import { Effect } from 'effect'
import { extractStatusCode, formatErrorMessage, ToolError } from './errors'
import { GalaxyFetch, toGalaxyServiceUnavailable } from './galaxy'

/**
 * Retrieves a tool by ID and version using Effect-based error handling.
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
        `api/tools/${toolId}?io_details=true&version=${version}`,
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
  })
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
