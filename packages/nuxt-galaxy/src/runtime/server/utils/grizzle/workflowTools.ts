import type { GalaxyFetch, GalaxyTool, GalaxyWorkflowExport, ToolError } from 'blendtype'
import type { GalaxyCache } from '../galaxyCache'
import * as bt from 'blendtype'
import { Effect } from 'effect'

/**
 * One tool a revision pins: the id Galaxy knows it by and the version the
 * revision was saved with. A toolshed guid carries its version inside the id
 * (`toolshed.g2.bx.psu.edu/repos/iuc/foo/foo/1.2.3`); a built-in id does
 * not (`Cut1`), so the pair is what names the tool, never the id alone.
 */
export interface PinnedTool {
  readonly toolId: string
  readonly toolVersion: string
}

/**
 * What the tool check of one revision answers: the tools Galaxy does not hold
 * at their pinned version, and how many distinct tools were looked up, so a
 * reader can tell "none missing" from "nothing to check".
 */
export interface RevisionToolCheck {
  readonly missing: PinnedTool[]
  readonly checked: number
}

/**
 * The tools a revision pins, each once, in step order: the tool steps of the
 * export with both a `tool_id` and a `tool_version`. Dataset and parameter
 * inputs carry neither and are not looked up.
 */
export function pinnedTools(definition: GalaxyWorkflowExport): PinnedTool[] {
  return pinnedToolsOfSteps(Object.values(definition.steps))
}

/**
 * The same reading, off any collection of steps.
 *
 * The export and the live payload describe a step differently in every other
 * respect, but both name a tool with `tool_id` and `tool_version`, so the two
 * callers that need this list — the publish check, which holds an export, and
 * the description endpoint, which holds the live payload — share one
 * derivation rather than two that can drift.
 */
export function pinnedToolsOfSteps(
  steps: Iterable<{ readonly tool_id?: string | null, readonly tool_version?: string | null }>,
): PinnedTool[] {
  const seen = new Set<string>()
  const pinned: PinnedTool[] = []
  for (const step of steps) {
    if (!step.tool_id || !step.tool_version)
      continue
    const key = `${step.tool_id}\u0000${step.tool_version}`
    if (seen.has(key))
      continue
    seen.add(key)
    pinned.push({ toolId: step.tool_id, toolVersion: step.tool_version })
  }
  return pinned
}

/** How many tools are looked up at once; Galaxy answers each from its toolbox, so this is only politeness. */
const LOOKUPS_AT_ONCE = 4

/**
 * A 404 is Galaxy holding no version of the tool at all. Anything else it
 * fails with (a 503, a network error, a 500) says nothing about the tool and
 * is not read as missing.
 */
function holdsNoVersion(error: ToolError): boolean {
  return error.statusCode === 404
}

/**
 * The tools of a revision that Galaxy does not hold at their pinned version
 * (ADR 0004, #75). Galaxy refuses to run a revision whose tools are not
 * installed at exactly the versions it pins, so a version is not published
 * while any is missing; this is the check, run before anything is written and
 * shown in the publish dialog for the revision it has selected.
 *
 * Two answers mean missing. A 404 is Galaxy holding no version of the tool.
 * A 200 carrying another `version` is Galaxy holding the tool but not at the
 * version asked for: `GET /api/tools/{id}?tool_version=` resolves through
 * `get_tool` without `exact`, which falls back to the newest installed
 * version of the same lineage rather than refusing, so the status alone would
 * call a tool present that `require_exact_tool_versions` refuses at analysis
 * start. Each distinct tool is asked for once. Galaxy being unwell during a
 * lookup fails the whole check as blendtype's own failure, so it ends as the
 * endpoint's 503 or a logged fault, never as a tool wrongly called missing.
 */
export function missingToolsEffect(definition: GalaxyWorkflowExport): Effect.Effect<PinnedTool[], ToolError, GalaxyFetch> {
  return Effect.forEach(
    pinnedTools(definition),
    tool => bt.getToolEffect(tool.toolId, tool.toolVersion).pipe(
      Effect.map(answer => (answer.version === tool.toolVersion ? undefined : tool)),
      Effect.catchIf(holdsNoVersion, () => Effect.succeed(tool)),
    ),
    { concurrency: LOOKUPS_AT_ONCE },
  ).pipe(
    Effect.map(answers => answers.filter((tool): tool is PinnedTool => tool !== undefined)),
  )
}

/**
 * Why a tool a revision pins cannot be rendered as a form.
 *
 * - `not_installed` — Galaxy holds no version of it, a 404.
 * - `version_mismatch` — Galaxy holds the tool but answered with another
 *   version, which is what `require_exact_tool_versions` refuses at analysis
 *   start (#75).
 * - `unreachable` — Galaxy said nothing usable about it: a 503, a 500, a
 *   network error. This says nothing about the tool.
 *
 * The first two would refuse the submission and so block it; the third would
 * not (Q10, Q22). Parameter *values* come from the workflow's saved
 * `tool_inputs` rather than from the definition — the definition supplies
 * only the widgets — so an unreachable tool means a step that cannot be
 * edited, not one that would submit wrong.
 */
export type UnavailableToolReason = 'not_installed' | 'version_mismatch' | 'unreachable'

/** One tool a revision pins that came back as something other than itself. */
export interface UnavailableTool {
  readonly toolId: string
  readonly toolVersion: string
  readonly reason: UnavailableToolReason
  /** The version Galaxy answered with instead, on `version_mismatch` only. */
  readonly servedVersion?: string
}

/**
 * What one pass over a revision's pinned tools answers: the definitions
 * Galaxy served at the version asked for, keyed `<toolId>@<version>`, and
 * every tool that came back as anything else.
 *
 * A tool is in exactly one of the two. `unavailable` is a list rather than a
 * map because one tool can appear at two versions in one workflow, and every
 * tool that is not in `tools` is in it — a tool that failed is never merely
 * absent (#96).
 */
export interface ResolvedTools {
  readonly tools: Record<string, GalaxyTool>
  readonly unavailable: UnavailableTool[]
}

/** The key one resolved definition is served under. */
export function toolKey(toolId: string, version: string): string {
  return `${toolId}@${version}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A tool definition with `options.hda` and `options.hdca` removed from every
 * data parameter, at any depth.
 *
 * They are not part of the tool. `io_details=true` fills them from whichever
 * history the API account touched last, so they are a per-user, per-request
 * snapshot of somebody else's datasets; nothing on the client reads them, and
 * caching them would pin one account's history into every later answer.
 *
 * The walk is structural rather than typed because the nesting is: a data
 * parameter can sit inside a conditional's case, a repeat block or a section,
 * and only the first of those three is in `GalaxyToolParameters` at all.
 */
export function withoutDatasetOptions<T>(node: T): T {
  if (Array.isArray(node)) {
    return node.map(item => withoutDatasetOptions(item)) as T
  }
  if (!isPlainObject(node)) {
    return node
  }
  const stripped: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === 'options' && node.type === 'data' && isPlainObject(value)) {
      const { hda: _hda, hdca: _hdca, ...rest } = value
      stripped[key] = rest
      continue
    }
    stripped[key] = withoutDatasetOptions(value)
  }
  return stripped as T
}

/**
 * The tools a revision pins, each fetched once, answering both what it is and
 * whether it can be used (Q22).
 *
 * The sibling of `missingToolsEffect`, taking the pinned tools rather than an
 * export, and folding the two questions into one pass: the description
 * endpoint needs each definition anyway, and a tool that comes back at the
 * wrong version is at once "not a usable definition" and "missing", so asking
 * separately would be 2N round trips for N tools.
 *
 * Nothing here fails. One tool Galaxy could not answer for is one entry in
 * `unavailable` and the rest of the revision is still described — the request
 * is about the whole workflow, and a reader who can edit four steps of five
 * is better served than one who gets a 503.
 *
 * `cache` is read before Galaxy and filled after it, keyed by the version
 * Galaxy **served**; see `toolCacheKey`. A failure is never written, so a
 * retry refetches only what failed.
 */
export function resolvePinnedToolsEffect(
  pinned: readonly PinnedTool[],
  cache: GalaxyCache,
  galaxyUrl: string,
): Effect.Effect<ResolvedTools, never, GalaxyFetch> {
  const resolveOne = (
    tool: PinnedTool,
  ): Effect.Effect<{ definition?: GalaxyTool, unavailable?: UnavailableTool }, never, GalaxyFetch> =>
    Effect.gen(function* () {
      const cached = yield* cache.tool(galaxyUrl, tool.toolId, tool.toolVersion)
      if (cached) {
        return { definition: cached }
      }
      const answer = yield* bt.getToolEffect(tool.toolId, tool.toolVersion)
      const served = withoutDatasetOptions(answer)
      yield* cache.writeTool(galaxyUrl, tool.toolId, served.version, served)
      if (served.version !== tool.toolVersion) {
        return { unavailable: { ...tool, reason: 'version_mismatch' as const, servedVersion: served.version } }
      }
      return { definition: served }
    }).pipe(
      Effect.catchAll(error => Effect.succeed({
        unavailable: {
          ...tool,
          reason: (holdsNoVersion(error) ? 'not_installed' : 'unreachable') as UnavailableToolReason,
        },
      })),
    )

  return Effect.forEach(pinned, resolveOne, { concurrency: LOOKUPS_AT_ONCE }).pipe(
    Effect.map((answers) => {
      const tools: Record<string, GalaxyTool> = {}
      const unavailable: UnavailableTool[] = []
      for (const [index, answer] of answers.entries()) {
        if (answer.definition) {
          const asked = pinned[index]!
          tools[toolKey(asked.toolId, asked.toolVersion)] = answer.definition
        }
        else if (answer.unavailable) {
          unavailable.push(answer.unavailable)
        }
      }
      return { tools, unavailable }
    }),
  )
}
