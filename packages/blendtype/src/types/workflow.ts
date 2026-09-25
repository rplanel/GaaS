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

const workflowStepTypes = ['data_input', 'parameter_input', 'data_collection_input', 'tool'] as const

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

export interface WorkflowToolParameters {
  [paramName: string]: WorkflowParameterValue
}

export interface WorkflowConditionalParametersValue {
  [paramName: string]: WorkflowParameterValue
}
export type WorkflowParameterValue = string | string[] | WorkflowConditionalParametersValue

export interface WorkflowStep {
  id: number
  type: WorkflowStepType
  tool_id: null | string
  tool_version: null | string
  annotation: null | string
  tool_inputs: WorkflowToolParameters
  input_steps: Record<string, WorkflowInputStep>
}

export interface WorkflowToolStep extends WorkflowStep {
  type: 'tool'
  tool_id: string
  tool_version: string
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
  content_id: string | null
  label: string | null
  tool_id: string | null
  type: WorkflowStepType
  uuid: string
  tool_state: string
  tool_version: string | null
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
   * The nested export a `subworkflow` step embeds, kept verbatim. Nothing
   * reads into it: a subworkflow is drawn as one step that links out to its
   * own invocation, never expanded inline.
   */
  subworkflow?: Record<string, unknown> | null
}
export const workflowStepConnectionSchema = z.looseObject({
  id: z.number(),
  output_name: z.string(),
})

export const workflowStepExportSchema = z.object({
  annotation: z.string(),
  id: z.number(),
  name: z.string(),
  content_id: z.string().nullable(),
  label: z.string().nullable(),
  tool_id: z.string().nullable(),
  type: z.enum(workflowStepTypes),
  uuid: z.string(),
  tool_state: z.string(),
  tool_version: z.string().nullable(),
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
  // Kept whole, never read into: a subworkflow is one step that links out.
  subworkflow: z.looseObject({}).nullish(),

  // Loose on purpose. `galaxyWorkflowExportSchema` is parsed with `.loose()`,
  // but that reaches the outer object only, so this schema stripping by
  // default is what emptied a stored definition of everything the client had
  // not thought to model (#82).
}).loose()

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
