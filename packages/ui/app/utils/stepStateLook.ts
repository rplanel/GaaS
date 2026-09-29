/**
 * What a step of a running analysis has come to, and how it is drawn (#90).
 *
 * `CONTEXT.md`'s **Step state**, in this application's own words — not
 * Galaxy's. Galaxy has fifteen job states; a reader has eight step states,
 * and several of Galaxy's collapse into one because they are the same thing
 * to a reader: `stop`, `stopped`, `failed` and `error` are all Failed.
 * `_Avoid_: … phase` in the glossary is why none of this is called one.
 *
 * Three of the eight must stay apart, and each is a different answer to
 * "why is nothing happening here": **Not started**, **Skipped** and
 * **Paused**. They differ in word, icon *and* colour rather than in only one
 * of the three, because a reader with one colour channel still has to tell
 * them apart.
 *
 * The sibling of `stepKind`, and the same shape for the same reason: word,
 * icon and colour in one map, so they cannot become three cascades over the
 * same state, and `satisfies Record<StepState, …>` makes a new state a
 * compile error rather than a node drawn blank.
 */

import type { JobState } from 'blendtype'
import type { StateLook } from './stateLook'
import { uiColorVar } from './stateLook'

/**
 * The glossary's eight, plus the absence of any.
 *
 * `unmarked` is not a step state: it is a step that **runs no job of its
 * own** — an input step, or a subworkflow step, whose jobs are the jobs of
 * the steps inside it and are recorded against its index (#119). The
 * glossary says such a step is drawn without a state rather than as Not
 * started, and that is what this member is for.
 */
export type StepState
  = | 'unmarked'
    | 'notStarted'
    | 'queued'
    | 'running'
    | 'paused'
    | 'skipped'
    | 'succeeded'
    | 'failed'
    | 'cancelled'

/**
 * The states a **job** can put a step in: every one except the two that no
 * job produces.
 *
 * Named because looking a job state's drawing up has to find one, and these
 * are exactly the members whose drawing is not `null`.
 */
export type JobStepState = Exclude<StepState, 'unmarked' | 'notStarted'>

/** Galaxy's fifteen job states, as the glossary's eight. */
const JOB_STEP_STATE = {
  new: 'queued',
  waiting: 'queued',
  queued: 'queued',
  resubmitted: 'queued',
  upload: 'queued',
  running: 'running',
  paused: 'paused',
  skipped: 'skipped',
  ok: 'succeeded',
  error: 'failed',
  failed: 'failed',
  stop: 'failed',
  stopped: 'failed',
  // A job Galaxy deleted is one that was stopped on purpose, which is what
  // the glossary calls Cancelled. `deleting` is the same thing in progress.
  deleted: 'cancelled',
  deleting: 'cancelled',
} as const satisfies Record<JobState, JobStepState>

const STEP_STATES = {
  // A step that runs no job of its own keeps the appearance #89 gave it:
  // nothing is known about it because there is nothing to know, and drawing
  // a state would invent one.
  unmarked: null,
  notStarted: {
    word: 'Not started',
    icon: 'i-lucide:circle-dashed',
    color: 'neutral',
  },
  queued: {
    word: 'Queued',
    icon: 'i-mdi:tray-full',
    color: 'info',
  },
  running: {
    word: 'Running',
    icon: 'i-svg-spinners:bars-scale',
    color: 'primary',
  },
  paused: {
    word: 'Paused',
    icon: 'i-mdi:pause-circle',
    color: 'warning',
  },
  skipped: {
    word: 'Skipped',
    icon: 'i-lucide:skip-forward',
    color: 'secondary',
  },
  succeeded: {
    word: 'Succeeded',
    icon: 'i-mdi:check-circle',
    color: 'success',
  },
  failed: {
    word: 'Failed',
    icon: 'i-mdi:alert-circle',
    color: 'error',
  },
  cancelled: {
    word: 'Cancelled',
    icon: 'i-mdi:cancel',
    color: 'neutral',
  },
} as const satisfies Record<StepState, StateLook | null>

/**
 * Which of a mapped step's states the node is drawn in: the highest here.
 *
 * Ordered by what a reader most needs to be told, not by how far along the
 * step is. One failure among thirty successes is the thing worth seeing, and
 * Skipped outranks Succeeded for the same reason — a step where some
 * elements did not run is not a step that ran.
 */
export const STEP_STATE_RANK = {
  failed: 7,
  paused: 6,
  running: 5,
  queued: 4,
  cancelled: 3,
  skipped: 2,
  succeeded: 1,
  notStarted: 0,
  unmarked: 0,
} as const satisfies Record<StepState, number>

/** The step state one job state puts a step in. */
export function jobStepState(state: JobState): JobStepState {
  return JOB_STEP_STATE[state]
}

/** How to draw a step state, or `null` for a step with none to draw. */
export function stepStateLook(state: StepState): StateLook | null {
  return STEP_STATES[state]
}

/**
 * How to draw one of Galaxy's job states, which always has a drawing.
 *
 * The jobs list reads this and the canvas reads `stepStateLook`, over one
 * map, so a colour means the same thing in the list as on the node beside
 * it. Never `null`, and proved so by `JobStepState` rather than asserted:
 * `unmarked` and `notStarted` are the only entries without a drawing, and no
 * job produces either.
 */
export function jobStateLook(state: JobState): StateLook {
  return STEP_STATES[jobStepState(state)]
}

/** A step state's colour as a CSS value, or nothing for a step with none. */
export function stepStateAccent(state: StepState): string | undefined {
  const look = stepStateLook(state)
  return look === null ? undefined : uiColorVar(look.color)
}
