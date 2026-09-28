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

/**
 * One job of an invocation step, as `?step_details=true` returns it.
 *
 * The element view of a step serialises `Job.dict_collection_visible_keys`
 * for every job the step ran, so a step that maps over a collection yields
 * one of these per element — the only place Galaxy reports those jobs
 * against their step.
 *
 * A narrower view of a job than `ShowFullJobResponse`, which describes
 * `GET /api/jobs/{id}`: only the identity and state are relied on here, and
 * the rest keep that response's optionality rather than asserting a
 * presence no caller depends on. 22.05 and 26.1 differ over the tail —
 * 26.1 serialises `tool_id`, `tool_version` and `history_id` here and 22.05
 * does not.
 */
export interface GalaxyInvocationStepJob {
  model_class: 'Job'
  id: string
  state: JobState
  exit_code?: number | null
  create_time?: string
  update_time?: string
  galaxy_version?: string | null
  tool_id?: string
  tool_version?: string
  history_id?: string
}

export interface GalaxyInvocationStep {
  model_class: 'WorkflowInvocationStep'
  id: string
  update_time: string
  /**
   * The step's single job, or `null` when it has none — which a step that
   * maps over a collection also is: its jobs belong to an implicit
   * collection, and only `jobs` reports them. Never read this as "the step
   * ran nothing".
   */
  job_id: null | string
  workflow_step_id: string
  state: JobState
  order_index: number
  workflow_step_label: string
  workflow_step_uuid: string
  /**
   * Every job of the step, present only when the invocation was fetched
   * with `step_details=true`. One entry for an ordinary step, one per
   * element for a mapped step, none for an input or a subworkflow step.
   */
  jobs?: GalaxyInvocationStepJob[]
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
