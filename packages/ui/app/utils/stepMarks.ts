/**
 * What each step of a running invocation is drawn as (#90).
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
 * - **A step that runs no job of its own is unmarked, never pending.** An
 *   input step is *provided*, not waiting, and a subworkflow step's jobs
 *   belong to a separate invocation this application does not record at all
 *   (#119). Derived from job rows alone, both would read "not started" for
 *   the whole invocation.
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

import type { JobState, WorkflowStepType } from 'blendtype'
import type { DescribedStep, JobRow } from 'nuxt-galaxy'

/**
 * A recorded job, reduced to the two fields a mark is derived from.
 *
 * Narrower than `JobRow` so that what this module reads is stated rather
 * than implied, and so a test can build one without inventing an owner, a
 * Galaxy id and a timestamp that play no part.
 */
export type MarkableJob = Pick<JobRow, 'step_id' | 'state'>

/**
 * How a step is drawn, which is fewer states than Galaxy has.
 *
 * Galaxy's fifteen job states collapse to these because several are the same
 * thing to a reader — `stop` and `stopped` and `failed` are all "it did not
 * work" — while three of them must not collapse at all: `skipped`, `paused`
 * and the absence of any job are each a different answer to "why is nothing
 * happening here".
 *
 * Two of these are not job states at all. `unmarked` is a step that runs no
 * job of its own — an input step, or a subworkflow step (#119). `pending` is
 * a step that could run one and has none recorded: its turn has not come.
 */
export type StepPhase
  = | 'unmarked'
    | 'pending'
    | 'queued'
    | 'running'
    | 'paused'
    | 'skipped'
    | 'ok'
    | 'error'
    | 'deleted'

/** One step's jobs, as the canvas and the panel beside it read them. */
export interface StepMark {
  readonly phase: StepPhase
  /**
   * Whether an edge leaving this step animates.
   *
   * Its own field rather than `phase === 'running'` at each call site: an
   * animated edge out of a step that has merely been queued would be the
   * graph saying something is flowing when nothing is, and that rule should
   * be stated once.
   */
  readonly isRunning: boolean
  /**
   * Every state this step's jobs are in, with how many are in it, in the
   * order a badge names them. States with no jobs are left out.
   */
  readonly counts: readonly { readonly state: JobState, readonly count: number }[]
  /** How many jobs the step ran; `0` for an unmarked or a pending step. */
  readonly total: number
}

/**
 * Which kinds of step run a job of their own.
 *
 * `satisfies Record<WorkflowStepType, boolean>` is the point of the shape:
 * the day `blendtype` learns Galaxy's `pause` step type (#118) this fails to
 * compile rather than quietly drawing it as pending, which is the one thing
 * a paused step must not be drawn as.
 */
const RUNS_JOBS = {
  data_input: false,
  data_collection_input: false,
  parameter_input: false,
  tool: true,
  subworkflow: false,
} as const satisfies Record<WorkflowStepType, boolean>

/**
 * The phases a **job** can put a step in: every one except the two that are
 * not job states at all.
 *
 * Named because `galaxyStateLook` needs to look a job state's drawing up and
 * know it will find one — `unmarked` and `pending` are the only phases with
 * no drawing, and neither is reachable from a job.
 */
export type JobPhase = Exclude<StepPhase, 'unmarked' | 'pending'>

/** Galaxy's fifteen job states, as this application draws them. */
const PHASE_OF = {
  new: 'queued',
  waiting: 'queued',
  queued: 'queued',
  resubmitted: 'queued',
  upload: 'queued',
  running: 'running',
  paused: 'paused',
  skipped: 'skipped',
  ok: 'ok',
  error: 'error',
  failed: 'error',
  stop: 'error',
  stopped: 'error',
  deleted: 'deleted',
  deleting: 'deleted',
} as const satisfies Record<JobState, JobPhase>

/**
 * The phase one job state puts a step in.
 *
 * Exported so the jobs list draws a state exactly as the canvas draws it,
 * rather than keeping a second map that agrees today (#90).
 */
export function jobStatePhase(state: JobState): JobPhase {
  return PHASE_OF[state]
}

/**
 * Which of a mapped step's phases the node is drawn in: the highest here.
 *
 * Ordered by what a reader most needs to be told, not by how far along the
 * step is. One failure among thirty successes is the thing worth seeing, and
 * `skipped` outranks `ok` for the same reason — a step where some elements
 * did not run is not a step that ran.
 */
const PHASE_RANK = {
  error: 7,
  paused: 6,
  running: 5,
  queued: 4,
  deleted: 3,
  skipped: 2,
  ok: 1,
  pending: 0,
  unmarked: 0,
} as const satisfies Record<StepPhase, number>

/**
 * The order a badge names the states in: `ok` first, then whatever went
 * wrong, then whatever is still to come.
 *
 * A record rather than an array so it is exhaustive over `JobState` by
 * construction — a state missing from a display order sorts arbitrarily,
 * which is a badge whose wording changes between renders.
 */
const BADGE_ORDER = {
  ok: 0,
  error: 1,
  failed: 2,
  stop: 3,
  stopped: 4,
  paused: 5,
  deleted: 6,
  deleting: 7,
  skipped: 8,
  running: 9,
  resubmitted: 10,
  queued: 11,
  waiting: 12,
  upload: 13,
  new: 14,
} as const satisfies Record<JobState, number>

/**
 * The mark of a step nothing is known about, and the one a canvas handed no
 * marks at all draws every node with.
 *
 * Exported because `workflowGraph` needs a default: invoke-mode supplies no
 * marks, and the node data is not optional — one representation of "draw no
 * run state here" rather than a `null` that means the same thing.
 */
export const UNMARKED_STEP: StepMark = Object.freeze({ phase: 'unmarked', isRunning: false, counts: [], total: 0 })

const PENDING: StepMark = Object.freeze({ phase: 'pending', isRunning: false, counts: [], total: 0 })

/** One step's mark, from the states of the jobs recorded against it. */
function markOf(states: readonly JobState[]): StepMark {
  if (states.length === 0) {
    return PENDING
  }

  const tally = new Map<JobState, number>()
  let phase: StepPhase = 'ok'
  for (const state of states) {
    tally.set(state, (tally.get(state) ?? 0) + 1)
    const candidate = PHASE_OF[state]
    if (PHASE_RANK[candidate] > PHASE_RANK[phase]) {
      phase = candidate
    }
  }

  const counts = [...tally.entries()]
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => BADGE_ORDER[a.state] - BADGE_ORDER[b.state])

  return { phase, isRunning: phase === 'running', counts, total: states.length }
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
  const statesByStep = new Map<string, JobState[]>()
  for (const job of jobs ?? []) {
    const key = String(job.step_id)
    const states = statesByStep.get(key)
    if (states === undefined) {
      statesByStep.set(key, [job.state])
    }
    else {
      states.push(job.state)
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
 * The `ok` count leads as a fraction so the **total is always on the badge**,
 * whatever the jobs are doing: that is the whole of AC3, and a badge naming
 * only the states that happen to be occupied would be the same failure #84
 * fixed — a step's jobs read as fewer than it ran.
 *
 * Nothing for a step with a single job: its state is already the node's
 * colour, and "1/1 ok" beside it is noise.
 */
export function stepMarkSummary(mark: StepMark): string | null {
  if (mark.total <= 1) {
    return null
  }
  const ok = mark.counts.find(count => count.state === 'ok')?.count ?? 0
  const rest = mark.counts
    .filter(count => count.state !== 'ok')
    .map(count => `${count.count} ${count.state}`)
  return [`${ok}/${mark.total} ok`, ...rest].join(', ')
}
