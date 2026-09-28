/**
 * The recorded Galaxy payloads the characterisation suite reads (#86).
 *
 * Each fixture directory is one revision of one real workflow, recorded by
 * `scripts/record-workflow-fixtures.mts` and committed. Nothing here talks to
 * Galaxy: the whole point of recording was that the suite runs without it.
 * See `../fixtures/galaxy-workflow/README.md` for how to record another.
 */

import type { GalaxyTool, GalaxyWorkflow } from 'blendtype'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FIXTURE_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'galaxy-workflow',
)

/** What the recorder wrote beside the payloads, so the suite can read the recording itself. */
export interface Manifest {
  recordedAt: string
  instance: string
  galaxyVersion: string
  workflowId: string
  workflowName: string
  revision: number
  command: string
  datasetOptionsRedacted: boolean
  toolsRecorded: boolean
  missingShapes: string[]
  tools: Record<string, { file: string, askedVersion: string, servedVersion: string }>
}

export interface WorkflowFixture {
  /** The directory name, which is also how the suite names the case. */
  slug: string
  manifest: Manifest
  /**
   * `GET /api/workflows/{id}` — what the description endpoint read and
   * served verbatim until #88. Kept because it is the payload the stored
   * definition is measured against, not because anything serves it now.
   */
  live: GalaxyWorkflow
  /**
   * `GET /api/workflows/{id}/download?style=export` — what publishing
   * stores, and so what the description endpoint describes a revision from
   * since #88.
   */
  exported: Record<string, unknown>
  /** `GET /api/tools/{id}?io_details=true&tool_version=…`, by `toolId@version`. */
  tools: Record<string, GalaxyTool>
}

function readJson<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(path.join(FIXTURE_ROOT, ...segments), 'utf-8')) as T
}

export function loadFixture(slug: string): WorkflowFixture {
  const manifest = readJson<Manifest>(slug, 'manifest.json')
  const tools: Record<string, GalaxyTool> = {}
  for (const [key, { file }] of Object.entries(manifest.tools)) {
    tools[key] = readJson<GalaxyTool>(slug, ...file.split('/'))
  }
  return {
    slug,
    manifest,
    live: readJson<GalaxyWorkflow>(slug, 'workflow.live.json'),
    exported: readJson<Record<string, unknown>>(slug, 'workflow.export.json'),
    tools,
  }
}

/**
 * The recordings, and what each is here to pin.
 *
 * No single real workflow carries all five shapes #86 names at a size worth
 * committing: a survey of 160 published workflows on usegalaxy.eu found only
 * four that do, the smallest of them 57 steps. The ticket allows "one
 * workflow or a small set", so this is the set.
 */
export const FIXTURES = {
  /**
   * Pasteur's own instance, at the version production runs today. This is the
   * baseline the ticket literally asks for — what the invoke form reads *now*
   * — and the only one of the three recorded from a Galaxy this project
   * controls.
   */
  ccqtlToday: 'ccqtl-today',
  /**
   * A conditional, a repeat and a `RuntimeValue` in five steps, from
   * usegalaxy.eu at 26.1 — the version this refactor targets, and the only
   * place these shapes were available: no workflow in Pasteur's account has a
   * conditional or a repeat at all.
   */
  conditionalRepeatRuntime: 'conditional-repeat-runtime',
  /**
   * An input fed by two upstream outputs, recorded without tool definitions
   * because a fan-in lives entirely in the connections. Its fan-in is keyed
   * `batchmode|input_fastas`, so it pins the `|`-nested input name as well as
   * the array-valued connection.
   */
  fanIn: 'fan-in',
  /**
   * A subworkflow step, and a subworkflow inside that subworkflow — the shape
   * the export schema refused outright until #89, which meant a workflow
   * holding one could not be published at all.
   *
   * Two levels deep on purpose: the graph draws a subworkflow as one node and
   * drills into its nested definition when the node is opened (Q19), and a
   * recording only one level deep would let a normaliser that fails to
   * recurse pass. Recorded without tool definitions, as `fan-in` is: what it
   * pins lives in the step shape and the connections, and never reaches a
   * tool.
   */
  subworkflowNested: 'subworkflow-nested',
} as const
