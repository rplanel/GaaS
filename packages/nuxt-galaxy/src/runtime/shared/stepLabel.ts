/**
 * What an input step of a workflow is called, in the one spelling both halves
 * of the runtime use.
 *
 * `describedInputsOf` derives the labels the invoke form keys its datamap by;
 * the graph has to label the same steps as nodes, including the input steps
 * of a *nested* subworkflow, for which no `inputs` list is derived at all.
 * Written twice the two would drift, and the drift would be invisible: both
 * would show a plausible name and they would disagree about which.
 *
 * The three default strings and the order of the fallbacks are Galaxy's own,
 * checked against `managers/workflows.py` on both 22.05 (`:1499`) and 26.1
 * (`:1896`) — the same three on both.
 *
 * This lives outside `server/` and `app/` for the reason `toolKey` does: it
 * is a fact about Galaxy that both sides have to state identically.
 */

import type { WorkflowStepType } from 'blendtype'

/**
 * The step types Galaxy counts as inputs — `Workflow.input_step_types` — and
 * what it calls one of them that carries no label and no name.
 *
 * One map rather than a set beside a lookup table: which types are inputs
 * and what an unnamed one is called are the same three facts, and stated
 * twice they can drift apart.
 */
export const DEFAULT_INPUT_LABELS = {
  data_input: 'Input Dataset',
  data_collection_input: 'Input Dataset Collection',
  parameter_input: 'Input Parameter',
} as const satisfies Partial<Record<WorkflowStepType, string>>

/** The part of a step this reads: its type, its label and its saved state. */
export interface LabellableStep {
  readonly type: WorkflowStepType
  readonly label: string | null
  readonly tool_inputs: Readonly<Record<string, unknown>>
}

/** Whether Galaxy counts this step as one of a workflow's inputs. */
export function isInputStep<T extends LabellableStep>(
  step: T,
): step is T & { type: keyof typeof DEFAULT_INPUT_LABELS } {
  return step.type in DEFAULT_INPUT_LABELS
}

/**
 * What to call an input step: the author's own label, else the `name` in the
 * step's saved state, else what the type is called.
 *
 * `step.label ||` rather than `??`: Galaxy writes the empty string for a step
 * nobody named as readily as it writes nothing at all, and an input labelled
 * `''` has to fall through to the next candidate rather than be drawn blank.
 */
export function inputStepLabel(step: LabellableStep & { type: keyof typeof DEFAULT_INPUT_LABELS }): string {
  const named = step.tool_inputs.name
  return step.label || (typeof named === 'string' && named ? named : DEFAULT_INPUT_LABELS[step.type])
}
