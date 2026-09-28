/**
 * What each kind of step is called, and how it is drawn (#89).
 *
 * One map for all three facts, because they were two adjacent ternary
 * cascades over the same two booleans and a raw identifier rendered as a
 * word. `satisfies Record<WorkflowStepType, …>` is the point of it: the day
 * `blendtype` learns a fifth step type — `pause` is Galaxy's and is not
 * modelled yet — this fails to compile rather than drawing it as a blank
 * badge.
 *
 * **The words are the glossary's, not Galaxy's identifiers.** A badge reading
 * `data_input` puts an API field name in front of a reader, and `CONTEXT.md`
 * names "data input" and "input step" among the phrases to avoid. An input is
 * a *place a workflow takes a dataset*, and where it has to be told apart
 * from a parameter — which Galaxy also counts as an input — the glossary's
 * phrase is **dataset input**.
 *
 * The dataset/collection distinction stays secondary on purpose: it is
 * already in the step's own label, which `inputStepLabel` takes from Galaxy
 * ("Input Dataset Collection"), so the badge says which kind of thing the
 * step is and the label says which kind of dataset.
 */

import type { BadgeProps } from '@nuxt/ui'
import type { WorkflowStepType } from 'blendtype'

export interface StepKind {
  /** What a reader is shown, in the glossary's words. */
  readonly word: string
  readonly icon: string
  readonly color: BadgeProps['color']
}

const STEP_KINDS = {
  data_input: {
    word: 'Dataset input',
    icon: 'i-material-symbols:dataset',
    color: 'neutral',
  },
  data_collection_input: {
    word: 'Collection input',
    icon: 'i-material-symbols:dataset',
    color: 'neutral',
  },
  parameter_input: {
    word: 'Parameter',
    icon: 'i-lucide:sliders-horizontal',
    color: 'neutral',
  },
  tool: {
    word: 'Tool',
    icon: 'i-lucide:wrench',
    color: 'primary',
  },
  subworkflow: {
    word: 'Subworkflow',
    icon: 'i-lucide:workflow',
    color: 'info',
  },
} as const satisfies Record<WorkflowStepType, StepKind>

export function stepKind(type: WorkflowStepType): StepKind {
  return STEP_KINDS[type]
}
