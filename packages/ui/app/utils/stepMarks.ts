/**
 * What each step of a running invocation has come to (#90).
 *
 * Pure, and outside the canvas on purpose. The canvas takes no mode (Q2'):
 * what differs between following an invocation and starting one is only
 * which per-step marks are supplied, and this is where following one derives
 * them.
 *
 * They come from **the job rows this application already holds** (Q4), not
 * from Galaxy: they are cached, they arrive over the realtime subscription
 * `AnalysisHistoryPanel` already has, and their `step_id` is the step's
 * `order_index` — the same key the canvas gives its nodes and the stored
 * definition keys its steps by.
 *
 * Three things here are decisions rather than mechanics, and each exists
 * because the obvious derivation says something false:
 *
 * - **A step that runs no job of its own is unmarked, never Not started.**
 *   An input step is *provided*, not waiting, and a subworkflow step's jobs
 *   belong to a separate invocation this application does not record
 *   (#119). Derived from job rows alone, both would read Not started for the
 *   whole invocation — which is what `CONTEXT.md`'s Step state entry now
 *   says they must not.
 * - **Skipped is a job row, not a missing one.** A conditional whose `when`
 *   evaluates false still gets a real job, set to `skipped` at
 *   `lib/galaxy/tools/actions/__init__.py:755`. So it needs no `when` on the
 *   definition, and it is distinguishable from a step whose turn has not
 *   come, which has no row at all (Q20).
 * - **A mapped step is counted, not collapsed.** One step, many jobs: no
 *   single state is true of it, so it keeps every count and is drawn in the
 *   most telling one (Q18).
 *
 * The invocation step's own state is deliberately not read. Galaxy's
 * `InvocationStepState` is `new | ready | scheduled` on both 22.05 and 26.1
 * (`lib/galaxy/schema/invocation.py:344`) — `scheduled` means the scheduler
 * handled the step, not that its jobs finished — so it cannot supply a
 * colour, and reading it would mean reading `analyses.invocation`, which is
 * #107's open question.
 */

import type { WorkflowStepType } from 'blendtype'
import type { DescribedStep, JobRow } from 'nuxt-galaxy'
import type { StepState } from './stepStateLook'
import { jobStepState, STEP_STATE_RANK, stepStateLook } from './stepStateLook'

/**
 * A recorded job, reduced to the two fields a mark is derived from.
 *
 * Narrower than `JobRow` so that what this module reads is stated rather
 * than implied, and so a test can build one without inventing an owner, a
 * Galaxy id and a timestamp that play no part.
 */
export type MarkableJob = Pick<JobRow, 'step_id' | 'state'>

/** One step's jobs, as the canvas and the panel beside it read them. */
export interface StepMark {
  /** `CONTEXT.md`'s Step state, or `unmarked` for a step that runs no job. */
  readonly state: StepState
  /**
   * Whether an edge leaving this step animates.
   *
   * Its own field rather than `state === 'running'` at each call site: an
   * animated edge out of a step that has merely been queued would be the
   * graph saying something is flowing when nothing is, and that rule should
   * be stated once.
   */
  readonly isRunning: boolean
  /**
   * Every state this step's jobs are in, with how many are in it, in the
   * order a badge names them. States with no jobs are left out.
   *
   * Counted by **step state**, not by Galaxy's job state: a step with one
   * `error` job and one `stopped` one has two failures, not one of each of
   * two things a reader has never heard of.
   */
  readonly counts: readonly { readonly state: StepState, readonly count: number }[]
  /** How many jobs the step ran; `0` for an unmarked or a Not started step. */
  readonly total: number
}

/**
 * Which kinds of step run a job of their own.
 *
 * `satisfies Record<WorkflowStepType, boolean>` is the point of the shape:
 * the day `blendtype` learns Galaxy's `pause` step type (#118) this fails to
 * compile rather than quietly drawing it as Not started, which is the one
 * thing a paused step must not be drawn as.
 */
const RUNS_JOBS = {
  data_input: false,
  data_collection_input: false,
  parameter_input: false,
  tool: true,
  subworkflow: false,
} as const satisfies Record<WorkflowStepType, boolean>

/**
 * The order a badge names the states in: Succeeded first, then whatever went
 * wrong, then whatever is still to come.
 *
 * A record rather than an array so it is exhaustive over `StepState` by
 * construction — a state missing from a display order sorts arbitrarily,
 * which is a badge whose wording changes between renders.
 */
const BADGE_ORDER = {
  succeeded: 0,
  failed: 1,
  paused: 2,
  cancelled: 3,
  skipped: 4,
  running: 5,
  queued: 6,
  notStarted: 7,
  unmarked: 8,
} as const satisfies Record<StepState, number>

/**
 * The mark of a step nothing is known about, and the one a canvas handed no
 * marks at all draws every node with.
 *
 * Exported because the canvas needs a default: invoke-mode supplies no
 * marks, and one representation of "draw no run state here" is better than a
 * `null` that means the same thing.
 */
export const UNMARKED_STEP: StepMark = Object.freeze({ state: 'unmarked', isRunning: false, counts: [], total: 0 })

const NOT_STARTED: StepMark = Object.freeze({ state: 'notStarted', isRunning: false, counts: [], total: 0 })

/** One step's mark, from the states of the jobs recorded against it. */
function markOf(states: readonly StepState[]): StepMark {
  if (states.length === 0) {
    return NOT_STARTED
  }

  const tally = new Map<StepState, number>()
  let state: StepState = 'succeeded'
  for (const candidate of states) {
    tally.set(candidate, (tally.get(candidate) ?? 0) + 1)
    if (STEP_STATE_RANK[candidate] > STEP_STATE_RANK[state]) {
      state = candidate
    }
  }

  const counts = [...tally.entries()]
    .map(([of, count]) => ({ state: of, count }))
    .sort((left, right) => BADGE_ORDER[left.state] - BADGE_ORDER[right.state])

  return { state, isRunning: state === 'running', counts, total: states.length }
}

/**
 * Every step of a revision, marked with what its jobs are doing.
 *
 * Keyed as `steps` is keyed, so a caller holding a node id holds a mark id.
 * A job row naming a step the revision does not declare is dropped rather
 * than thrown on: reachable whenever the revision being described is not the
 * one that ran — an analysis started before #48 recorded none, and the
 * workflow row's pinned revision stands in — and losing the whole canvas over
 * one unplaceable row would cost a reader far more than the row is worth.
 */
export function stepMarks(
  steps: Record<string, DescribedStep>,
  jobs: readonly MarkableJob[] | undefined,
): Record<string, StepMark> {
  const statesByStep = new Map<string, StepState[]>()
  for (const job of jobs ?? []) {
    const key = String(job.step_id)
    const states = statesByStep.get(key)
    if (states === undefined) {
      statesByStep.set(key, [jobStepState(job.state)])
    }
    else {
      states.push(jobStepState(job.state))
    }
  }

  const marks: Record<string, StepMark> = {}
  for (const [stepId, step] of Object.entries(steps)) {
    marks[stepId] = RUNS_JOBS[step.type]
      ? markOf(statesByStep.get(stepId) ?? [])
      : UNMARKED_STEP
  }
  return marks
}

/**
 * What a mapped step's badge says, or `null` for a step that needs none.
 *
 * In the glossary's words, never Galaxy's: `12/15 Succeeded, 3 Running`, not
 * `12/15 ok, 3 running`. A badge naming `deleting` or `resubmitted` would be
 * the API value on the screen that `stepStateLook` exists to keep off it.
 *
 * The Succeeded count leads as a fraction so the **total is always on the
 * badge**, whatever the jobs are doing: that is the whole of AC3, and a
 * badge naming only the states that happen to be occupied would be the same
 * failure #84 fixed — a step's jobs read as fewer than it ran.
 *
 * Nothing for a step with a single job: its state is already the node's
 * colour, and "1/1 Succeeded" beside it is noise.
 */
export function stepMarkSummary(mark: StepMark): string | null {
  if (mark.total <= 1) {
    return null
  }
  const wordFor = (state: StepState) => stepStateLook(state)?.word ?? state
  const succeeded = mark.counts.find(count => count.state === 'succeeded')?.count ?? 0
  const rest = mark.counts
    .filter(count => count.state !== 'succeeded')
    .map(count => `${count.count} ${wordFor(count.state)}`)
  return [`${succeeded}/${mark.total} ${wordFor('succeeded')}`, ...rest].join(', ')
}
