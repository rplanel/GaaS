import type { JobState } from './job'

export const InvocationTerminalStates = [
  'cancelled',
  'failed',
  'completed',
] as const

export const InvocationStates = [
  ...InvocationTerminalStates,
  'new',
  'requires_materialization',
  'ready',
  'scheduled',
  'cancelling',
] as const

export type InvocationState = typeof InvocationStates[number]
export type InvocationTerminalState = typeof InvocationTerminalStates[number]

export interface GalaxyInvocationStep {
  model_class: 'WorkflowInvocationStep'
  id: string
  update_time: string
  job_id: null | string
  workflow_step_id: string
  state: JobState
  order_index: number
  workflow_step_label: string
  workflow_step_uuid: string

}

export interface GalaxyInvocationIO {
  id: string
  src: string
  label: string
  workflow_step_id: string

}

export interface GalaxyInvocationOuput {

}

export interface GalaxyInvoke {
  model_class: 'WorkflowInvocation'
  id: string
  state: InvocationState
  update_time: string
  create_time: string
  workflow_id: string
  history_id: string
  uuid: string
}
export interface InvocationJobsSummary {
  model: 'WorkflowInvocation'
  id: string
  states: Partial<Record<JobState, number>>
  populated_state: JobState
}

export interface GalaxyInvocation extends GalaxyInvoke {
  steps: GalaxyInvocationStep[]
  inputs?: Record<string, GalaxyInvocationIO>
  outputs?: Record<string, GalaxyInvocationIO>
}
