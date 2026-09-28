import type { TagCollection } from './tag'
import type { GalaxyToolParameters, GalaxyToolParameterValue } from './tool'
import { z } from 'zod'

export type SrcInput = 'hda' | 'ldda' | 'ld' | 'hdca'

export type GalaxyWorkflowInput = Record<
  string,
  {
    id: string
    src: SrcInput
    uuid?: string
    dbid?: number
  }
>

/**
 * The step types a stored definition can hold.
 *
 * `subworkflow` was missing until #89, and its absence meant more than an
 * unnamed case: `workflowStepExportSchema` refused the whole export, so a
 * workflow with a subworkflow step could not be published at all. Measured
 * against three published workflows on usegalaxy.eu at 26.1.2 — every one of
 * them failed to parse on `type`, `content_id`, `tool_state` and
 * `tool_version` together.
 *
 * `pause` is Galaxy's fifth step type and is still absent here, deliberately:
 * nothing in this project has measured one, and the set is widened from
 * recordings rather than from Galaxy's source. A workflow carrying one is
 * refused the same way a subworkflow step was.
 */
const workflowStepTypes = ['data_input', 'parameter_input', 'data_collection_input', 'tool', 'subworkflow'] as const

export type WorkflowStepType = typeof workflowStepTypes[number]

export interface WorkflowInput {
  label: string
  value: string
  uuid: string
}

export type GalaxyWorkflowParameters = Record<string, string | boolean>

export interface WorkflowInputStep {
  source_step: number
  step_output: string
}

/**
 * The values one tool step of a workflow was saved with, by parameter name.
 *
 * This is the decoded `tool_state`: Galaxy's `state.encode(nested=True)`,
 * which is arbitrary JSON and not a flat map of strings. Galaxy's own
 * bookkeeping rides in it too — `__page__`, `__rerun_remap_job_id__` — so a
 * reader drops what it does not recognise rather than expecting a fixed set
 * of keys.
 */
export interface WorkflowToolParameters {
  [paramName: string]: WorkflowParameterValue
}

export interface WorkflowConditionalParametersValue {
  [paramName: string]: WorkflowParameterValue
}

/**
 * A value a stored definition leaves to be filled when the workflow runs.
 *
 * Galaxy writes two spellings and reads them as one thing: `is_runtime_value`
 * answers true for `RuntimeValue` and `ConnectedValue` alike
 * (`tools/parameters/basic.py:80` at 22.05, moved to
 * `tools/parameters/workflow_utils.py:50` by 26.1 with its test unchanged).
 * Which one gets written is decided at *save* time by `add_dummy_datasets`,
 * so the marker says nothing about what will happen at run time — what
 * decides that is the step's connection, which `replacement_for_input` reads
 * and nothing else (#97). One concept to Galaxy, so one type here.
 *
 * Every data parameter of a stored tool step is one of these — Galaxy says so
 * in as many words, "All data parameters are represented as runtime values"
 * (`workflow/modules.py:602` at 22.05, `:1029` at 26.1). The converse does
 * **not** hold, and the recordings are where that shows: `__APPLY_RULES__`
 * carries a marker under `collapsible_value` inside each of its rule
 * objects, which is no parameter of any kind. So finding one says the run
 * will fill it, not that a dataset is what gets filled in.
 *
 * 52 `ConnectedValue` and 10 `RuntimeValue` across the four recorded live
 * payloads, and more again in the exports.
 */
export interface WorkflowRuntimeValue {
  __class__: 'RuntimeValue' | 'ConnectedValue'
}

/**
 * One instance of a `repeat` parameter, as the saved state keeps it.
 *
 * A tool declares one blueprint for its repeat block and the state holds
 * however many instances the author added, each as an object carrying its own
 * `__index__` alongside the block's own parameters. `__index__` is the number
 * Galaxy gave the instance when it was added and the one its connections are
 * keyed by (`datasets_3|input`) — never its position in the array, which a
 * deleted middle entry makes different (#97).
 *
 * Measured on `conditional-repeat-runtime`: `__BUILD_LIST__` on step 2 keeps
 * five `datasets` entries, and `__MERGE_COLLECTION__` on steps 3 and 4 two
 * `inputs` entries each.
 */
export interface WorkflowRepeatInstanceValue {
  __index__: number
  [paramName: string]: WorkflowParameterValue
}

/**
 * One value of a saved tool state.
 *
 * As wide as JSON, and deliberately: `tool_state` is whatever a tool's own
 * form put there, and the recordings show it. `number`, `boolean` and `null`
 * are all in `integron_finder`'s state on step 1 of
 * `conditional-repeat-runtime` (`__page__: 0`, `gbk: true`,
 * `type_replicon: null`); the lists run from `string[]` on step 5 of `fan-in`
 * through `number[]` and a list of plain objects carrying no `__index__` at
 * all in `__APPLY_RULES__`'s `rules` and `mapping`, on step 11 of the inner
 * subworkflow of `subworkflow-nested`. A member narrow enough to refuse any
 * of those would be a member that lies, which is what #102 was.
 *
 * So what the union is *for* is naming the three shapes that carry meaning:
 * `WorkflowRuntimeValue` for a value the run will fill,
 * `WorkflowRepeatInstanceValue` for one instance of a repeat, and
 * `WorkflowConditionalParametersValue` for the plain nesting a `conditional`
 * or a `section` saves.
 *
 * Only two of the three are members. A repeat's instances arrive through the
 * list member, because `WorkflowRepeatInstanceValue[]` is subsumed by
 * `WorkflowParameterValue[]` — an open index signature of this union accepts
 * `__index__: number` like any other key — and a union member that another
 * member already covers buys a reader nothing: narrowing
 * `WorkflowRepeatInstanceValue[] | WorkflowParameterValue[]` still cannot
 * reach `__index__`. `isWorkflowRuntimeValue` and
 * `isWorkflowRepeatInstanceValue` below are how a reader gets to either type,
 * and are the reason both are named rather than written inline at each site
 * that asks.
 *
 * Which shapes the recordings *actually* hold is pinned in
 * `packages/ui/test/characterisation/parameterValueTypes.test.ts`, whose walk
 * names each of them and refuses anything else — narrower than this union on
 * purpose, so that a re-recording carrying something new fails a test rather
 * than passing silently.
 */
export type WorkflowParameterValue
  = | string
    | number
    | boolean
    | null
    | WorkflowRuntimeValue
    | WorkflowParameterValue[]
    | WorkflowConditionalParametersValue

/**
 * Whether a saved value is one of the two runtime markers.
 *
 * The predicate the type exists for. Both spellings and no distinction
 * between them, because `is_runtime_value` draws none: a caller asking "will
 * the run fill this" wants both, and one asking "which spelling was written"
 * wants neither and should compare `__class__` itself — which is what
 * `parameterModel.ts` does, keeping the two apart as separate shapes on
 * purpose.
 */
export function isWorkflowRuntimeValue(value: unknown): value is WorkflowRuntimeValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const marker = (value as { __class__?: unknown }).__class__
  return marker === 'RuntimeValue' || marker === 'ConnectedValue'
}

/**
 * Whether a saved value is one instance of a repeat.
 *
 * `__index__` being a `number` is the whole test, and the reason to go
 * through a predicate rather than a cast: the index is what a connection is
 * keyed by, so reading it off something that has none — or that has it as a
 * string — is the mistake that names the wrong input (#97).
 */
export function isWorkflowRepeatInstanceValue(value: unknown): value is WorkflowRepeatInstanceValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  return typeof (value as { __index__?: unknown }).__index__ === 'number'
}

export interface WorkflowStep {
  id: number
  type: WorkflowStepType
  tool_id: null | string
  tool_version: null | string
  annotation: null | string
  /**
   * `null` on a `subworkflow` step, which runs no tool and so saved no tool
   * state — measured on steps 8 and 12 of `subworkflow-nested` at 26.1,
   * where `tool_id` and `tool_version` are `null` beside it. Every other
   * step type carries an object, empty or not.
   */
  tool_inputs: WorkflowToolParameters | null
  input_steps: Record<string, WorkflowInputStep>
}

export interface WorkflowToolStep extends WorkflowStep {
  type: 'tool'
  tool_id: string
  tool_version: string
  /** Never `null` on a tool step: the `null` above belongs to a subworkflow one. */
  tool_inputs: WorkflowToolParameters
}

export interface GalaxyWorkflowsItem {

  model_class: string
  id: string
  name: string
  create_time: Date
  update_time: Date
  published: boolean
  importable: boolean
  deleted: boolean
  hidden: boolean
  tags: TagCollection
  latest_workflow_uuid: string
  annotation: string | null
  url: string
  owner: string
  source_metadata: string | null
  number_of_steps: number
  show_in_tool_panel: boolean

}

export interface GalaxyWorkflow {
  model_class: string
  id: string
  name: string
  create_time: Date
  update_time: Date
  published: boolean
  importable: boolean
  deleted: boolean
  hidden: boolean
  tags: TagCollection
  latest_workflow_uuid: string
  url: string
  owner: string
  inputs: { [key: string]: WorkflowInput }
  annotation: string | null
  license: string | null
  creator: string | null
  source_metadata: string | null
  steps: { [key: string]: WorkflowStep }
  version: number
}

export interface WorkflowStepRun {
  annotation?: string
  step_index: number
  step_label: string
  step_name: string
  step_version: string
  step_type: WorkflowStepType
}

export interface WorkflowStepDataExport extends WorkflowStepRun {
  step_type: Extract<WorkflowStepType, 'data_input'>
}
// parameter_input
export interface WorkflowStepParameterExport extends WorkflowStepRun {
  step_type: Extract<WorkflowStepType, 'parameter_input'>
}
export interface WorkflowStepDataCollectionExport extends WorkflowStepRun {
  step_type: Extract<WorkflowStepType, 'data_collection_input'>
}

export interface WorkflowStepToolExport extends WorkflowStepRun {
  id: string
  step_type: Extract<WorkflowStepType, 'tool'>
  action: string
  citation: boolean
  creator: null | string
  display: boolean
  description: string
  edam_operations: string[]
  edam_topics: string[]
  enctype: string
  help: string
  history_id: string
  is_workflow_compatible: boolean
  license: string | null
  model_class: string
  label: null | string
  name: string
  requirements: { name: string, version: string | null }[]
  sharable_url: string
  tool_shed_repository: {
    changeset_revision: string
    name: string
    owner: string
    tool_shed: string
  }
  version: string
  versions: string[]
  inputs: GalaxyToolParameters[]
  state_inputs: Record<
    string,
    Record<
      string,
      GalaxyToolParameterValue
    >
  >

}

/**
 * One connection of a stored definition, as an export writes it: `id` is the
 * upstream step's `order_index`, which is the integer that keys `steps` and
 * the one a job row carries as `step_id`, and `output_name` the output of
 * that step feeding this input. A subworkflow connection carries an
 * `input_subworkflow_step_id` beside them, which is kept rather than modelled.
 */
export interface WorkflowStepConnection {
  id: number
  output_name: string
}

/**
 * The incoming connections of a step, keyed by the name of the input they feed.
 *
 * Galaxy keys this by *input name* — `input1`, `queries_0|input2` — not by a
 * fixed set of keys, and the value is an **array** when several outputs feed
 * one input. A singleton list is collapsed to a bare object on the way out,
 * a back-compat hack `_workflow_to_dict_export` comments must never be
 * removed, so both shapes arrive and a reader handles both (#82).
 */
export type WorkflowStepConnections = Record<
  string,
  WorkflowStepConnection | WorkflowStepConnection[]
>

/**
 * One step of a stored definition, as `download?style=export` writes it.
 *
 * The fields below are the ones this client reads or means to draw from;
 * anything else Galaxy emits is **kept, not stripped**. A definition exists
 * to be drawn from later, so a step schema that dropped what it did not
 * model would leave the row describing a set of steps with nothing joining
 * them (#82).
 */
export interface WorkflowStepExport {
  annotation: string
  id: number
  name: string
  /**
   * Absent on a subworkflow step, which Galaxy writes without it (#89). The
   * three keys below go the same way, and for the same reason: they describe
   * a tool, and a subworkflow step runs none.
   */
  content_id?: string | null
  label: string | null
  /** Present but `null` on a subworkflow step, unlike the three optional keys. */
  tool_id: string | null
  type: WorkflowStepType
  uuid: string
  tool_state?: string
  tool_version?: string | null
  input_connections: WorkflowStepConnections
  inputs: Array<{
    description: string
    name: string
  }>
  outputs: Array<{
    name: string
    type: string
  }>
  tool_shed_repository?: {
    changeset_revision: string
    name: string
    owner: string
    tool_shed: string
  }
  workflow_outputs: Array<{
    label: string
    output_name: string
    uuid: string
  } | undefined>
  /**
   * Where the editor last laid the step out. A workflow built through the
   * API has none, and Galaxy writes that as `null` or leaves it out, so
   * neither is a reason to refuse an export.
   */
  position?: {
    left: number
    top: number
  } | null
  /**
   * The expression that decides whether the step runs, on a conditional step
   * (Galaxy 23.0 and later). `null` on an unconditional one, absent before
   * 23.0: a step that did not run because of this is not the same as one that
   * has not run yet.
   */
  when?: string | null
  /**
   * The workflow a `subworkflow` step runs, embedded whole.
   *
   * Modelled rather than kept opaque since #89, because there is now a
   * reader: the graph draws the step as **one** node — never expanded inline
   * (Q19) — and drilling into that node draws the nested definition's own
   * steps and connections. The nested export is the only description of it
   * there is; it carries a `uuid` and a `name` but no stored-workflow id, so
   * nothing else could be looked up.
   */
  subworkflow?: WorkflowSubworkflowExport | null
}

/**
 * The workflow embedded in a `subworkflow` step, as an export writes it.
 *
 * The same shape as a whole export **minus `version`**, which Galaxy adds to
 * a downloaded dict and not to a nested one — measured on usegalaxy.eu at
 * 26.1.2. So it cannot be modelled as `GalaxyWorkflowExport`, and it is not
 * a revision anything can be pinned to: only the outer workflow has an index
 * an invocation runs (#48).
 *
 * Its own steps may hold a further `subworkflow` step, which is why this and
 * `WorkflowStepExport` refer to each other. `subworkflow-nested` is recorded
 * with exactly that shape, two levels deep.
 *
 * Only `steps` is required, and only because the alternative is worse.
 * Everything parsed here is parsed on the publish path, so a required key
 * Galaxy ever omits is a workflow nobody can publish — which is why `uuid`,
 * `annotation`, `tags`, `creator`, `license` and `report` are all left to the
 * catchall although every recorded nested export carries some of them.
 * `steps` earns the exception: a nested export whose steps cannot be read
 * would be *drawn*, as a graph with no nodes and nothing on the picture to
 * say why, and #82 settled that a graph which silently omits what it cannot
 * read is worse than a refusal.
 */
export interface WorkflowSubworkflowExport {
  steps: { [key: string]: WorkflowStepExport }
  /**
   * What the subworkflow is called. Optional because nothing must fail to
   * publish for want of a name: it is the fallback label for the node when
   * the author never labelled the step, and an unnamed node beats an
   * unpublishable workflow.
   */
  name?: string
}
export const workflowStepConnectionSchema = z.looseObject({
  id: z.number(),
  output_name: z.string(),
})

export const workflowStepExportSchema = z.looseObject({
  annotation: z.string(),
  id: z.number(),
  name: z.string(),
  content_id: z.string().nullish(),
  label: z.string().nullable(),
  tool_id: z.string().nullable(),
  type: z.enum(workflowStepTypes),
  uuid: z.string(),
  // Optional, not nullable: Galaxy leaves all three keys **out** of a
  // subworkflow step rather than writing them as `null` (#89).
  tool_state: z.string().optional(),
  tool_version: z.string().nullish(),
  // Keyed by input name, one connection or several: see
  // `WorkflowStepConnections`. Modelling it as a single key named `input`
  // discarded every connection of every real workflow (#82).
  input_connections: z.record(
    z.string(),
    z.union([workflowStepConnectionSchema, z.array(workflowStepConnectionSchema)]),
  ),
  inputs: z.array(
    z.object({
      description: z.string(),
      name: z.string(),
    }),
  ),
  outputs: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
    }),
  ),
  tool_shed_repository: z.optional(z.object({
    changeset_revision: z.string(),
    name: z.string(),
    owner: z.string(),
    tool_shed: z.string(),
  })),
  workflow_outputs:
    z.object({
      label: z.string(),
      output_name: z.string(),
      uuid: z.string(),
    }).optional().array().catch([]),
  // Absent or null on a workflow that was never laid out in the editor, so
  // all three of object, null and absent are an export this client accepts.
  position: z.looseObject({
    left: z.number(),
    top: z.number(),
  }).nullish(),
  when: z.string().nullish(),
  // Parsed rather than kept opaque since #89: the graph drills into it. The
  // getter is what lets this and `workflowSubworkflowExportSchema` refer to
  // each other, since a subworkflow's own steps may hold another one.
  //
  // The forward reference is the recursion, not an ordering mistake: swapping
  // the two declarations moves the same reference into the other one's
  // `steps` getter. It is safe because a getter is not run until something
  // parses — see the `z.looseObject` note below for what happens when
  // something runs it sooner.
  get subworkflow() {
    // eslint-disable-next-line ts/no-use-before-define
    return workflowSubworkflowExportSchema.nullish()
  },

  // `z.looseObject` rather than `z.object().loose()`, which is the same
  // schema by a route that does not break: `.loose()` clones the object and
  // enumerates its shape there and then, which runs the `subworkflow` getter
  // above before the schema it names has been initialised — a
  // `ReferenceError` at import time, not at parse time. Loose either way,
  // and for the reason #82 established: `galaxyWorkflowExportSchema` is
  // parsed with `.loose()` but that reaches the outer object only, so this
  // schema stripping by default is what emptied a stored definition of
  // everything the client had not thought to model.
})

/**
 * The workflow a `subworkflow` step embeds.
 *
 * Annotated with its interface rather than left to inference, because this
 * and `workflowStepExportSchema` refer to each other and an inferred pair
 * has no base case to stop at. Loose for the same reason every other schema
 * here is: `comments`, `creator`, `license`, `report`, `tags` and
 * `format-version` all arrive on a real nested export and none of them is
 * modelled, so stripping would be #82 again one level down.
 */
export const workflowSubworkflowExportSchema: z.ZodType<WorkflowSubworkflowExport> = z.looseObject({
  name: z.string().optional(),
  get steps() {
    return z.record(z.string(), workflowStepExportSchema)
  },
})

/**
 * A stored workflow as `GET /api/workflows/{id}/download` exports it, at one
 * revision. Two fields name that revision (ADR 0004): `version`, the 0-based
 * index Galaxy adds to every downloaded dict and the integer an invocation
 * takes (#48), and `uuid`, the identifier Galaxy gave the revision when it was
 * saved. A published version keeps both; the index alone could not tell a
 * rewritten history from a stable one.
 */
export interface rawGalaxyWorkflowExport {
  'a_galaxy_workflow': string
  'format-version': string
  'name': string
  'tags': TagCollection
  'annotation': string
  'steps': { [key: string]: WorkflowStepExport }
  'version': number
  'uuid': string
}

export interface GalaxyWorkflowExport extends Omit<rawGalaxyWorkflowExport, 'a_galaxy_workflow'> {
  a_galaxy_workflow: boolean
}

/**
 * One revision of a stored workflow as `GET /api/workflows/{id}/versions`
 * lists it. `version` is the 0-based index Galaxy indexes the revision by:
 * the same integer the export carries as `version`, `download?version=` takes
 * and an invocation runs (#48). It is read off the entry, never off the
 * entry's position in the list. `update_time` is when that revision was saved
 * and `steps` how many steps it has.
 */
export interface GalaxyWorkflowRevision {
  version: number
  update_time: string
  steps: number
}

export const galaxyWorkflowExportSchema = z.object({
  'a_galaxy_workflow': z.coerce.boolean(),
  'format-version': z.string(),
  'name': z.string(),
  'tags': z.array(z.string()),
  'annotation': z.string(),
  'version': z.number(),
  'uuid': z.string(),
  'steps': z.record(z.string(), workflowStepExportSchema),
})
