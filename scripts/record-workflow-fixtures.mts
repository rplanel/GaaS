/**
 * Record one real Galaxy workflow as the fixtures the characterisation suite
 * reads (#86).
 *
 * The point of that suite is to pin the shapes Galaxy *really* emits —
 * including the ones nobody thought to model — so its fixtures cannot be
 * hand-written. This script takes them straight off a live instance, making
 * exactly the calls `blendtype` makes, so what lands on disk is what the
 * application sees and not a tidied version of it.
 *
 * Run it from the repository root with the Galaxy credentials in the
 * environment. `playground/.env` already holds them:
 *
 *     set -a && . ./playground/.env && set +a
 *     node scripts/record-workflow-fixtures.mts <workflowId> --name <slug>
 *
 * Node 24 strips the types itself, so this has no dependencies and no build
 * step. Keep it that way: only erasable TypeScript syntax (no enums, no
 * parameter properties, no namespaces).
 *
 * Usage:
 *   node scripts/record-workflow-fixtures.mts <workflowId> [options]
 *
 *     --name <slug>           Directory to write under the fixtures root.
 *                             Defaults to a slug of the workflow's name.
 *     --revision <n>          The 0-based revision to record. Left out,
 *                             Galaxy describes and exports its latest, which
 *                             is what an unpinned caller gets.
 *     --out <dir>             Fixtures root. Defaults to
 *                             packages/ui/test/fixtures/galaxy-workflow.
 *     --keep-dataset-options  Do not blank a data parameter's `options`.
 *                             See `redactDatasetOptions` for why the default
 *                             is to blank them.
 *     --census-only           Report what the workflow contains and write
 *                             nothing. Use it to check a candidate workflow
 *                             before committing its payloads.
 *     --no-tools              Record the payloads but no tool definitions.
 *                             For a workflow recorded to pin a connection
 *                             shape rather than a parameter one.
 *     --survey                 Take no workflow id: report which of the
 *                             shapes #86 needs each stored workflow of the
 *                             account carries, and write nothing. Use it to
 *                             find a candidate in the first place.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

// ---------------------------------------------------------------- arguments

interface Options {
  workflowId: string
  name?: string
  revision?: number
  out: string
  keepDatasetOptions: boolean
  censusOnly: boolean
  survey: boolean
  instance?: string
  published: boolean
  limit: number
  noTools: boolean
}

function parseArgs(argv: string[]): Options {
  const positional: string[] = []
  const flags = new Map<string, string | true>()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const name = arg.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      flags.set(name, true)
    }
    else {
      flags.set(name, next)
      i++
    }
  }

  const survey = flags.get('survey') === true
  const workflowId = positional[0]
  if (workflowId === undefined && !survey) {
    throw new Error('a workflow id is required: node scripts/record-workflow-fixtures.mts <workflowId>')
  }

  const rawRevision = flags.get('revision')
  const revision = typeof rawRevision === 'string' ? Number(rawRevision) : undefined
  if (revision !== undefined && !Number.isInteger(revision)) {
    throw new TypeError(`--revision takes the 0-based revision index, not ${String(rawRevision)}`)
  }

  const name = flags.get('name')
  const out = flags.get('out')
  const instance = flags.get('instance')
  const rawLimit = flags.get('limit')
  const limit = typeof rawLimit === 'string' ? Number(rawLimit) : 40
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError(`--limit takes a positive whole number, not ${String(rawLimit)}`)
  }
  return {
    survey,
    instance: typeof instance === 'string' ? instance : undefined,
    published: flags.get('published') === true,
    noTools: flags.get('no-tools') === true,
    limit,
    workflowId: workflowId ?? '',
    name: typeof name === 'string' ? name : undefined,
    revision,
    out: typeof out === 'string' ? out : path.join('packages', 'ui', 'test', 'fixtures', 'galaxy-workflow'),
    keepDatasetOptions: flags.get('keep-dataset-options') === true,
    censusOnly: flags.get('census-only') === true,
  }
}

// ------------------------------------------------------------------- galaxy

/**
 * One GET against Galaxy, shaped like `blendtype`'s `GalaxyFetch`: the key
 * travels in `x-api-key`, and a non-2xx answer is an error carrying whatever
 * Galaxy said, because a fixture recorded from a 404 body is worse than no
 * fixture.
 *
 * The key is optional. A public instance serves its *published* workflows to
 * anyone — list, show and export alike — and that is how a shape this
 * account's own workflows do not carry gets found and recorded without
 * anybody's credentials being involved.
 */
async function galaxyGet<T>(base: string, key: string | undefined, pathAndQuery: string): Promise<T> {
  const url = `${base.replace(/\/+$/, '')}/${pathAndQuery.replace(/^\/+/, '')}`
  const response = await fetch(url, {
    headers: key === undefined ? { accept: 'application/json' } : { 'x-api-key': key, 'accept': 'application/json' },
  })
  if (!response.ok) {
    const said = await response.text().catch(() => '')
    throw new Error(`GET ${pathAndQuery} answered ${response.status}: ${said.slice(0, 400)}`)
  }
  return await response.json() as T
}

// --------------------------------------------------------------- redaction

/**
 * Blank the `hda` / `hdca` lists a data parameter carries.
 *
 * `io_details=true` makes Galaxy populate a `DataToolParameter`'s `options`
 * from whichever history the account touched last, so those lists are real
 * dataset names belonging to a real person and they change between two runs
 * of this script an hour apart. Neither belongs in a fixture: the suite
 * asserts on the derived parameter *model*, which reads a data parameter's
 * type, name and multiplicity and never its options, so blanking them costs
 * the suite nothing and removes both the leak and the only source of churn
 * that would make a re-recording look like a behaviour change.
 *
 * `--keep-dataset-options` turns this off, for the day someone needs to pin
 * what the picker offers. Read what it writes before committing it.
 */
function redactDatasetOptions(value: unknown): { value: unknown, redacted: number } {
  let redacted = 0
  function walk(node: unknown): unknown {
    if (Array.isArray(node)) {
      return node.map(walk)
    }
    if (node === null || typeof node !== 'object') {
      return node
    }
    const record = node as Record<string, unknown>
    const isDataParameter = record.model_class === 'DataToolParameter'
      || record.model_class === 'DataCollectionToolParameter'
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(record)) {
      if (isDataParameter && k === 'options' && v !== null && typeof v === 'object') {
        const options = v as Record<string, unknown>
        const emptied: Record<string, unknown> = {}
        for (const [optionKey, optionValue] of Object.entries(options)) {
          if (Array.isArray(optionValue)) {
            redacted += optionValue.length
            emptied[optionKey] = []
          }
          else {
            emptied[optionKey] = optionValue
          }
        }
        out[k] = emptied
        continue
      }
      out[k] = walk(v)
    }
    return out
  }
  return { value: walk(value), redacted }
}

// ----------------------------------------------------------------- census

type Shape = 'data_input' | 'conditional' | 'repeat' | 'RuntimeValue' | 'ConnectedValue' | 'fan-in'

/**
 * What a parameter state contains, by the markers Galaxy writes into it: a
 * conditional carries `__current_case__`, a repeat is a list of dicts each
 * carrying `__index__`, and a runtime parameter serialises as
 * `{"__class__": "RuntimeValue"}`. These are the shapes #86 exists to pin,
 * and this census is how a candidate workflow is judged before its payloads
 * are committed.
 */
function shapesIn(state: unknown, found: Set<Shape> = new Set()): Set<Shape> {
  if (Array.isArray(state)) {
    if (state.length > 0 && state.every(item => item !== null && typeof item === 'object')
      && state.some(item => '__index__' in (item as Record<string, unknown>))) {
      found.add('repeat')
    }
    for (const item of state) shapesIn(item, found)
    return found
  }
  if (state === null || typeof state !== 'object') {
    return found
  }
  const record = state as Record<string, unknown>
  if ('__current_case__' in record)
    found.add('conditional')
  if (record.__class__ === 'RuntimeValue')
    found.add('RuntimeValue')
  if (record.__class__ === 'ConnectedValue')
    found.add('ConnectedValue')
  for (const value of Object.values(record)) shapesIn(value, found)
  return found
}

/**
 * A step's parameter state as each payload spells it. The live show hands
 * back the raw `tool_inputs` column; the export hands back `tool_state`, a
 * JSON *string* of `encode(nested=True)`. Both are read here, because #86
 * pins the derived model taken from each and they need not agree.
 */
function stateOf(step: Record<string, unknown>): unknown {
  if ('tool_inputs' in step) {
    return step.tool_inputs ?? {}
  }
  const toolState = step.tool_state
  if (typeof toolState !== 'string') {
    return {}
  }
  try {
    return JSON.parse(toolState)
  }
  catch {
    return {}
  }
}

interface CensusRow {
  stepId: string
  type: string
  toolId: string | null
  shapes: Shape[]
  fanInInputs: string[]
}

function census(steps: Record<string, Record<string, unknown>>): CensusRow[] {
  return Object.entries(steps)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([stepId, step]) => {
      const shapes = shapesIn(stateOf(step))
      if (step.type === 'data_input')
        shapes.add('data_input')
      // The export keys connections by input name and makes the value an
      // array when several outputs feed one input; the live show's
      // `input_steps` is keyed the same way but assigned in a loop, so it
      // cannot express a fan-in at all — the last connection silently wins.
      // Reading both is how the suite shows that difference rather than
      // assuming it.
      const connections = (step.input_connections ?? step.input_steps ?? {}) as Record<string, unknown>
      const fanInInputs = Object.entries(connections)
        .filter(([, value]) => Array.isArray(value) && value.length > 1)
        .map(([inputName]) => inputName)
      if (fanInInputs.length > 0)
        shapes.add('fan-in')
      return {
        stepId,
        type: String(step.type ?? '?'),
        toolId: typeof step.tool_id === 'string' ? step.tool_id : null,
        shapes: [...shapes].sort(),
        fanInInputs,
      }
    })
}

function reportCensus(label: string, rows: CensusRow[]) {
  console.log(`\n-- ${label} --`)
  for (const row of rows) {
    const tool = row.toolId === null ? '-' : row.toolId.split('/').slice(-2).join('/')
    const marks = row.shapes.length > 0 ? row.shapes.join(',') : '-'
    const fanIn = row.fanInInputs.length > 0 ? `  fan-in: ${row.fanInInputs.join(',')}` : ''
    console.log(`  ${row.stepId.padStart(2)}  ${row.type.padEnd(22)} ${tool.padEnd(44)} ${marks}${fanIn}`)
  }
}

/** The five shapes #86 names, and whether this workflow exercises each. */
const REQUIRED_SHAPES: Shape[] = ['data_input', 'conditional', 'repeat', 'RuntimeValue', 'fan-in']

function reportVerdict(rows: CensusRow[]): Shape[] {
  const present = new Set(rows.flatMap(row => row.shapes))
  console.log('\n== what #86 asks for ==')
  const missing: Shape[] = []
  for (const shape of REQUIRED_SHAPES) {
    const ok = present.has(shape)
    if (!ok)
      missing.push(shape)
    console.log(`  ${ok ? 'yes' : 'NO '}  ${shape}`)
  }
  return missing
}

// ------------------------------------------------------------------- write

/**
 * A filesystem-safe name for a tool, whose id is a toolshed guid full of
 * slashes. The manifest maps the real `toolId@version` back, so nothing has
 * to reverse this.
 */
function toolFileName(toolId: string, version: string) {
  return `${`${toolId}@${version}`.replace(/[^\w.@+-]+/g, '_')}.json`
}

async function writeJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workflow'
}

// ------------------------------------------------------------------ survey

/**
 * Which of the shapes #86 needs each stored workflow of the account carries.
 *
 * Recording is cheap; *finding* a workflow that exercises a conditional, a
 * repeat and a fan-in is not, and guessing from names does not work. This
 * exports every stored workflow once and prints one line each, so the choice
 * is made against what Galaxy actually holds rather than against a hunch.
 *
 * Both of Galaxy's lists are asked for: `GET /api/workflows` applies
 * `hidden == show_hidden`, so the default answers the visible ones only and
 * `show_hidden=true` answers only the hidden ones. A hidden workflow is
 * usually a piece of another one, which makes it a likely home for exactly
 * the nested shapes this is hunting for.
 */
async function survey(base: string, key: string | undefined, options: Options) {
  let listed: { id: string, name: string, note: string }[]
  if (options.published) {
    // A public instance's published workflows, which need no key. The IWC
    // keeps curated ones here, and a curated workflow is far likelier to use
    // a conditional or a repeat than anything written for one lab.
    const shown = await galaxyGet<{ id: string, name: string, owner?: string }[]>(
      base,
      key,
      `api/workflows?show_published=true&limit=${options.limit}`,
    )
    listed = shown.map(workflow => ({ ...workflow, note: workflow.owner ? `@${workflow.owner}` : '' }))
  }
  else {
    const [visible, hidden] = await Promise.all([
      galaxyGet<{ id: string, name: string }[]>(base, key, 'api/workflows'),
      galaxyGet<{ id: string, name: string }[]>(base, key, 'api/workflows?show_hidden=true'),
    ])
    listed = [
      ...visible.map(workflow => ({ ...workflow, note: '' })),
      ...hidden.map(workflow => ({ ...workflow, note: '(hidden)' })),
    ]
  }
  console.log(`${listed.length} workflow(s) to census\n`)

  const header = REQUIRED_SHAPES.map(shape => shape.slice(0, 4).padEnd(4)).join(' ')
  console.log(`  ${'id'.padEnd(16)} ${header} ${'steps'.padStart(5)}  name`)

  const covered: { id: string, name: string, shapes: Shape[], steps: number }[] = []
  for (const workflow of listed) {
    let rows: CensusRow[]
    try {
      const exported = await galaxyGet<Record<string, unknown>>(
        base,
        key,
        `api/workflows/${workflow.id}/download?style=export`,
      )
      rows = census((exported.steps ?? {}) as Record<string, Record<string, unknown>>)
    }
    catch {
      // A stored workflow can refuse to export — a missing tool, a broken
      // subworkflow. That is a fact about the candidate, not a reason to
      // abandon the survey.
      console.log(`  ${workflow.id.padEnd(16)} ${'.'.repeat(header.length)} ${'?'.padStart(5)}  ${workflow.name} (export failed)`)
      continue
    }
    const present = new Set(rows.flatMap(row => row.shapes))
    const marks = REQUIRED_SHAPES.map(shape => (present.has(shape) ? 'yes ' : '  . ')).join(' ')
    const hits = REQUIRED_SHAPES.filter(shape => present.has(shape))
    covered.push({ id: workflow.id, name: workflow.name, shapes: hits, steps: rows.length })
    console.log(`  ${workflow.id.padEnd(16)} ${marks} ${String(rows.length).padStart(5)}  ${workflow.name} ${workflow.note}`.trimEnd())
  }

  const everywhere = new Set(covered.flatMap(row => row.shapes))
  const unreachable = REQUIRED_SHAPES.filter(shape => !everywhere.has(shape))
  console.log(
    unreachable.length === 0
      ? '\nEvery shape #86 asks for exists somewhere in what was surveyed.'
      : `\nNothing surveyed here carries: ${unreachable.join(', ')}.`,
  )
}

// -------------------------------------------------------------------- main

async function main() {
  const options = parseArgs(process.argv.slice(2))

  // `--instance` names a Galaxy other than the configured one, and then the
  // key is optional: what is read there is published and public.
  const base = options.instance ?? process.env.GALAXY_URL
  const key = options.instance === undefined ? process.env.GALAXY_API_KEY : process.env.GALAXY_API_KEY_PUBLIC
  if (!base) {
    throw new Error(
      'GALAXY_URL must be in the environment, or --instance must name one. From the repository root:\n'
      + '  set -a && . ./playground/.env && set +a',
    )
  }
  if (options.instance === undefined && !key) {
    throw new Error(
      'GALAXY_API_KEY must be in the environment to read the configured instance. From the repository root:\n'
      + '  set -a && . ./playground/.env && set +a',
    )
  }

  if (options.survey) {
    await survey(base, key, options)
    return
  }

  const { workflowId, revision } = options
  const versionQuery = revision === undefined ? '' : `&version=${revision}`

  const galaxyVersion = await galaxyGet<{ version_major?: string, version_minor?: string }>(
    base,
    key,
    'api/version',
  )

  // The three calls the application makes, spelled exactly as `blendtype`
  // spells them: `getWorkflowEffect`, `exportWorkflowEffect` and
  // `getWorkflowRevisionsEffect`.
  const live = await galaxyGet<Record<string, unknown>>(
    base,
    key,
    `api/workflows/${workflowId}${revision === undefined ? '' : `?version=${revision}`}`,
  )
  const exported = await galaxyGet<Record<string, unknown>>(
    base,
    key,
    `api/workflows/${workflowId}/download?style=export${versionQuery}`,
  )
  const revisions = await galaxyGet<unknown[]>(base, key, `api/workflows/${workflowId}/versions`)

  const liveSteps = (live.steps ?? {}) as Record<string, Record<string, unknown>>
  const exportSteps = (exported.steps ?? {}) as Record<string, Record<string, unknown>>

  console.log(`galaxy     : ${galaxyVersion.version_major ?? '?'}.${galaxyVersion.version_minor ?? '?'}`)
  console.log(`workflow   : ${String(live.name)} (${workflowId})`)
  console.log(`revision   : ${revision === undefined ? `latest (${String(exported.version)})` : revision}`)
  console.log(`steps      : ${Object.keys(liveSteps).length} live, ${Object.keys(exportSteps).length} export`)

  const liveRows = census(liveSteps)
  const exportRows = census(exportSteps)
  reportCensus('live show — tool_inputs, input_steps', liveRows)
  reportCensus('export — tool_state, input_connections', exportRows)
  // The export is the one that decides: it is the payload Q12 makes the
  // source of truth, and the only one that can express a fan-in at all.
  const missing = reportVerdict(exportRows)

  if (options.censusOnly) {
    console.log('\n--census-only: nothing written.')
    return
  }
  if (missing.length > 0) {
    console.log(
      `\nWARNING: this workflow does not exercise ${missing.join(', ')}.`
      + '\nRecording it anyway; the suite will only pin what is here.',
    )
  }

  // One tool definition per distinct tool id *and* version, read the way
  // `getToolEffect` reads it.
  //
  // `--no-tools` skips them, for a workflow recorded to pin a *connection*
  // shape rather than a parameter one: a fan-in lives in `input_connections`
  // and never reaches a tool definition, so fetching twenty of them would
  // add a quarter of a megabyte to the repository to prove nothing. The version is URL-encoded because a toolshed
  // version carries a `+` and a raw `+` in a query decodes to a space, which
  // made Galaxy answer with another installed version entirely (#75).
  const wanted = new Map<string, { toolId: string, version: string }>()
  for (const step of options.noTools ? [] : Object.values(liveSteps)) {
    const toolId = step.tool_id
    const version = step.tool_version
    if (typeof toolId === 'string' && typeof version === 'string') {
      wanted.set(`${toolId}@${version}`, { toolId, version })
    }
  }

  const slug = options.name ?? slugify(String(live.name ?? workflowId))
  const root = path.join(options.out, slug)
  await rm(root, { recursive: true, force: true })

  let redactedTotal = 0
  const tools: Record<string, { file: string, askedVersion: string, servedVersion: string }> = {}
  for (const [k, { toolId, version }] of wanted) {
    const tool = await galaxyGet<Record<string, unknown>>(
      base,
      key,
      `api/tools/${toolId}?io_details=true&tool_version=${encodeURIComponent(version)}`,
    )
    const { value, redacted } = options.keepDatasetOptions
      ? { value: tool, redacted: 0 }
      : redactDatasetOptions(tool)
    redactedTotal += redacted
    const file = toolFileName(toolId, version)
    await writeJson(path.join(root, 'tools', file), value)
    // Galaxy's `get_tool` is called without `exact`, so it answers 200 with
    // another installed version when it lacks the one asked for. Recording
    // both versions is how a reader of the fixture can tell that happened
    // rather than believing the version they asked for.
    tools[k] = { file: `tools/${file}`, askedVersion: version, servedVersion: String(tool.version ?? '?') }
  }

  await writeJson(path.join(root, 'workflow.live.json'), live)
  await writeJson(path.join(root, 'workflow.export.json'), exported)
  await writeJson(path.join(root, 'revisions.json'), revisions)
  await writeJson(path.join(root, 'manifest.json'), {
    recordedAt: new Date().toISOString().slice(0, 10),
    // The host, so a reader knows which Galaxy these shapes came from and at
    // which version. The key travels in a header, never in the URL, so there
    // is nothing here that a committed fixture should not carry.
    instance: new URL(base).host,
    toolsRecorded: !options.noTools,
    galaxyVersion: `${galaxyVersion.version_major ?? '?'}.${galaxyVersion.version_minor ?? '?'}`,
    workflowId,
    workflowName: live.name,
    revision: revision ?? exported.version,
    command: `node scripts/record-workflow-fixtures.mts ${workflowId}`
      + `${revision === undefined ? '' : ` --revision ${revision}`} --name ${slug}`,
    datasetOptionsRedacted: !options.keepDatasetOptions,
    shapes: {
      live: Object.fromEntries(liveRows.map(row => [row.stepId, row.shapes])),
      export: Object.fromEntries(exportRows.map(row => [row.stepId, row.shapes])),
    },
    missingShapes: missing,
    tools,
  })

  const mismatched = Object.entries(tools).filter(([, t]) => t.askedVersion !== t.servedVersion)
  console.log(`\nwrote ${root}`)
  console.log(`  ${Object.keys(tools).length} tool definition(s)`
    + `${options.keepDatasetOptions ? '' : `, ${redactedTotal} dataset option(s) blanked`}`)
  for (const [k, t] of mismatched) {
    console.log(`  NOTE: ${k} was served version ${t.servedVersion}; Galaxy lacks the one asked for`)
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
