/**
 * How every state Galaxy reports is drawn (#90).
 *
 * `GalaxyStatus` drew twelve of them as nothing: `skipped`, `stopped`,
 * `waiting`, `deleted`, `deleting`, `stop`, `resubmitted`, `upload`,
 * `empty`, `deferred`, `discarded` and `ready` all mapped to
 * `{ icon: '', color: '' }`, which renders an empty `<UIcon name="">`. A
 * skipped job and a job the list knew nothing about looked identical, which
 * is the same failure #90 exists to fix on the canvas, in the list beside
 * it.
 *
 * **A job state is not decided here.** Those come from `jobPhaseLook`, the
 * map the canvas draws its nodes from, so a colour means the same thing in
 * the jobs accordion as on the node it belongs to. What is left is the
 * states no job is ever in — an invocation's own scheduling states and a
 * dataset's — and `satisfies Record<Exclude<…, JobState>, StateLook>` is
 * what makes forgetting one a compile error.
 */

import type { GalaxyState, InvocationState, JobState } from 'blendtype'
import type { StateLook } from './stateLook'
import { JobStates } from 'blendtype'
import { jobStatePhase } from './stepMarks'
import { jobPhaseLook } from './stepPhase'

/** Every state that is not a job state: an invocation's, or a dataset's. */
const NOT_A_JOB_STATE = {
  scheduled: {
    word: 'Scheduled',
    icon: 'i-material-symbols:schedule-send-outline',
    color: 'success',
  },
  ready: {
    word: 'Ready',
    icon: 'i-lucide:circle-play',
    color: 'info',
  },
  requires_materialization: {
    word: 'Fetching inputs',
    icon: 'i-mdi:cube-scan',
    color: 'info',
  },
  completed: {
    word: 'Completed',
    icon: 'i-mdi:check-circle',
    color: 'success',
  },
  cancelled: {
    word: 'Cancelled',
    icon: 'i-mdi:cancel',
    color: 'warning',
  },
  cancelling: {
    word: 'Cancelling',
    icon: 'i-mdi:cancel',
    color: 'warning',
  },
  empty: {
    word: 'Empty',
    icon: 'i-lucide:file-x',
    color: 'neutral',
  },
  deferred: {
    word: 'Deferred',
    icon: 'i-lucide:cloud-download',
    color: 'neutral',
  },
  discarded: {
    word: 'Discarded',
    icon: 'i-lucide:file-minus',
    color: 'neutral',
  },
  // Galaxy's own two-step metadata pass over a finished dataset. Named for
  // what is happening rather than for the field: `setting_metadata` was
  // reaching the screen verbatim through the fallback branch.
  setting_metadata: {
    word: 'Reading metadata',
    icon: 'i-lucide:file-cog',
    color: 'info',
  },
  failed_metadata: {
    word: 'Metadata failed',
    icon: 'i-lucide:file-warning',
    color: 'warning',
  },
} as const satisfies Record<Exclude<GalaxyState | InvocationState, JobState>, StateLook>

/**
 * A state this application has never heard of.
 *
 * The unions are `blendtype`'s reading of Galaxy, not Galaxy itself, and a
 * state added upstream arrives as a string in neither map. Saying "unknown"
 * is the point: a blank is exactly what this module exists to stop drawing.
 */
const UNKNOWN: StateLook = Object.freeze({
  word: 'Unknown',
  icon: 'i-lucide:circle-help',
  color: 'neutral',
})

function isJobState(state: string): state is JobState {
  return (JobStates as readonly string[]).includes(state)
}

/** How to draw one state, whatever kind of thing it belongs to. */
export function galaxyStateLook(state: GalaxyState | InvocationState): StateLook {
  if (isJobState(state)) {
    return jobPhaseLook(jobStatePhase(state))
  }
  return (NOT_A_JOB_STATE as Record<string, StateLook | undefined>)[state] ?? UNKNOWN
}
