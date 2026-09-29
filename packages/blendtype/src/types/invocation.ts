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
 * Where the scheduler has got to with one step — never what the step's jobs
 * came to.
 *
 * The same three on 22.05 and on 26.1
 * (`lib/galaxy/model/__init__.py:7942` at 22.05,
 * `lib/galaxy/schema/invocation.py:344` at 26.1), and they are read straight
 * off the step's own `state` column: `to_dict` once overwrote it with the
 * job's state, and on both releases that line is commented out above
 * "Following no longer makes sense". `scheduled` means the scheduler handled
 * the step, not that anything it started finished, and `ready` and `new` are
 * not job states at all.
 *
 * 26.1's response model widens the field to
 * `Optional[Union[InvocationStepState, JobState]]`, but nothing writes a job
 * state to the column: `lib/galaxy/workflow/run.py` assigns only `new`,
 * `ready` and `scheduled`.
 */
export const InvocationStepStates = [
  'new',
  'ready',
  'scheduled',
] as const

export type InvocationStepState = typeof InvocationStepStates[number]

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
   * collection, and only `jobs` reports them. A subworkflow step is `null`
   * here too, and `subworkflow_invocation_id` is the only way to its jobs.
   * Never read this as "the step ran nothing".
   */
  job_id: null | string
  workflow_step_id: string
  /**
   * The separate invocation a subworkflow step's own steps ran under, or
   * `null` for a step that embeds no workflow.
   *
   * `WorkflowInvocationStep.jobs` is `self.job or
   * implicit_collection_jobs.job_list` and a subworkflow step has neither,
   * so both `job_id` and `jobs` are empty for one and this id is the only
   * route to the jobs it ran (#119). Always serialised: it is in
   * `dict_collection_visible_keys` on 22.05 and on 26.1 alike.
   */
  subworkflow_invocation_id: null | string
  /**
   * How far the scheduler has got with the step. Not a job state — see
   * `InvocationStepState`. Nullable because the column is.
   */
  state: InvocationStepState | null
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
