import type { Layer } from 'effect'
import type { GalaxyBooleanToolParameter, GalaxyTool } from './types'
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

/**
 * A boolean parameter's value, read the way Galaxy reads it.
 *
 * Published because the wire type *changes between the two releases this
 * project spans*, and Galaxy@Pasteur is about to cross that line: a caller
 * narrowing `boolean | string | null` itself would work on 22.05 and quietly
 * invert on 26.1, and the flip would land as a behaviour change nobody edited.
 *
 * **Nothing calls this yet**, and saying so is the point: no production code
 * reads a tool parameter's `value` at all — the invoke form binds a widget to
 * the *workflow's* saved state and never to the tool's declared default. The
 * first caller is #101, which renders the parameters nested in a section or a
 * repeat. Published ahead of it because #110 asked which of the two shapes a
 * reader should get, and a reader cannot be handed a union whose meaning
 * depends on a release; the test suite is what exercises it until then.
 *
 * Faithful to `BooleanToolParameter.to_python`, which dispatches on `optional`
 * and is identical on both releases:
 *
 * - not optional → `string_as_bool`, true for `true`, `yes`, `on` **and `1`**;
 * - optional → `string_as_bool_or_none`, `null` for `none` and `null`, true
 *   for `true`, `yes`, `on` — and **not** for `1`, which that function omits.
 *
 * The `1` is not a transcription slip: the two helpers really disagree about
 * it (`util/__init__.py`, both releases), so an optional and a required
 * boolean read `"1"` differently and this follows suit. Comparison is
 * case-insensitive in both, as Galaxy's `str(string).lower()` makes it.
 *
 * That `'null'` is a string at 22.05 costs nothing here, and nothing upstream
 * either: `string_as_bool_or_none` accepts `"null"` as well as `"none"`, so
 * Galaxy's own round trip survives it even though its docstring names only
 * `'None'`.
 */
export function booleanToolParameterValue(
  parameter: Pick<GalaxyBooleanToolParameter, 'value' | 'optional'>,
): boolean | null {
  const { value, optional } = parameter
  if (typeof value === 'boolean') {
    return value
  }
  const spelling = String(value).toLowerCase()
  if (optional) {
    if (spelling === 'none' || spelling === 'null') {
      return null
    }
    return spelling === 'true' || spelling === 'yes' || spelling === 'on'
  }
  return spelling === 'true' || spelling === 'yes' || spelling === 'on' || spelling === '1'
}
