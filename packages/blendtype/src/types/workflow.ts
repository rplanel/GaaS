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
  input_connections: {
    input?: {
      id: number
      output_name: string
    }
  }
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

}
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
  input_connections: z.object({
    input: z.optional(z.object({
      id: z.number(),
      output_name: z.string(),
    })),
  }),
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
