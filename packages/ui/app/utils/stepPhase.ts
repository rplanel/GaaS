/**
 * How each phase of a step is drawn (#90).
 *
 * The sibling of `stepKind`, and the same shape for the same reason: word,
 * icon and colour in one map, because they were about to be three ternary
 * cascades over the same phase, and `satisfies Record<StepPhase, …>` is what
 * makes a new phase a compile error rather than a node drawn blank.
 *
 * **The words are the glossary's, not Galaxy's.** A node reading `ok` or
 * `stopped` puts an API value in front of a reader; `Done` and `Failed` are
 * what the state means. Several of Galaxy's fifteen job states collapse into
 * one word here — that collapsing is `stepMarks`' job, not this map's.
 *
 * Three of them must stay apart and do: **Not started**, **Skipped** and
 * **Paused** are each a different answer to "why is nothing happening here",
 * and they differ in word, icon *and* colour rather than in only one of the
 * three, because a reader with one colour channel still has to tell them
 * apart.
 */

import type { StateLook } from './stateLook'
import type { JobPhase, StepPhase } from './stepMarks'
import { uiColorVar } from './stateLook'

const STEP_PHASES = {
  // A step that runs no job of its own keeps the appearance #89 gave it:
  // nothing is known about it because there is nothing to know, and drawing
  // a mark would invent one.
  unmarked: null,
  pending: {
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
  ok: {
    word: 'Done',
    icon: 'i-mdi:check-circle',
    color: 'success',
  },
  error: {
    word: 'Failed',
    icon: 'i-mdi:alert-circle',
    color: 'error',
  },
  deleted: {
    word: 'Deleted',
    icon: 'i-mdi:delete',
    color: 'neutral',
  },
} as const satisfies Record<StepPhase, StateLook | null>

/** How to draw a phase, or `null` for a step there is no run state to draw. */
export function stepPhaseLook(phase: StepPhase): StateLook | null {
  return STEP_PHASES[phase]
}

/**
 * How to draw a phase a job can actually put a step in, which is never
 * `null`.
 *
 * Its own accessor rather than a non-null assertion at the call site:
 * `unmarked` and `pending` are the only two entries that are `null`, and
 * neither is a `JobPhase`, so the narrower argument is what proves it.
 * `galaxyStateLook` reads this, which is what stops the jobs list and the
 * canvas being two maps that agree today.
 */
export function jobPhaseLook(phase: JobPhase): StateLook {
  return STEP_PHASES[phase]
}

/**
/** A phase's colour as a CSS value, or nothing for a step with no run state.
 */
export function stepPhaseAccent(phase: StepPhase): string | undefined {
  const look = stepPhaseLook(phase)
  return look === null ? undefined : uiColorVar(look.color)
}
