import type { GalaxyFetch, GalaxyWorkflowExport, ToolError } from 'blendtype'
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
  const seen = new Set<string>()
  const pinned: PinnedTool[] = []
  for (const step of Object.values(definition.steps)) {
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
