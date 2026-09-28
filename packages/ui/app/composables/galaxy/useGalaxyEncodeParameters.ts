import type { WorkflowParameterValue, WorkflowRepeatInstanceValue, WorkflowToolParameters } from 'blendtype'
import type { ComputedRef, MaybeRef } from 'vue'
import type { EncodedGalaxyWorkflowParameter, WorkflowParametersModel } from './types'
import { isWorkflowRepeatInstanceValue } from 'blendtype'
import { computed, toValue } from 'vue'
import { flattenKey, isConditional, isPresent, repeatInstanceKey } from './parameterValue'

/**
 * Whether a list is a repeat's instances rather than one parameter's value.
 *
 * A saved list is either, and the two want opposite treatment: a repeat's
 * instances have to be named one by one or Galaxy drops the lot, while a
 * multi-select's options have to stay a list or they arrive as names no tool
 * declares. `__index__` is what tells them apart, and every entry must carry
 * one — `__APPLY_RULES__` saves `rules` and `mapping` as lists of plain
 * objects with none, and a rule that accepted a mixed list would flatten
 * those by position and invent names.
 *
 * An empty list is not a repeat either. Galaxy's `visit_input_values`
 * iterates the instances the state holds, so an empty one has nothing to
 * name; sending `[]` under the bare name is a key it ignores, which is the
 * same no-op and keeps a step's saved arity legible in the payload.
 */
function isRepeatInstances(value: WorkflowParameterValue): value is WorkflowRepeatInstanceValue[] {
  return Array.isArray(value) && value.length > 0 && value.every(isWorkflowRepeatInstanceValue)
}

/**
 * One value of the model, written into the flat dict under every name Galaxy
 * will look it up by.
 *
 * Three shapes and one rule. A bag — a conditional or a section — recurses
 * under `parent|child`; a repeat's instances recurse under
 * `parent_<position>|child`; anything else is a leaf and is written as it
 * stands. Only `undefined` is dropped, at every depth, which is #95's rule
 * unchanged and the reason this is one recursive function rather than a top
 * level and a nested one that disagreed about `0`.
 *
 * The nesting is recursive because Galaxy's own is: `_flatten_step_params`
 * recurses into every dict that is neither a dataset reference nor
 * `__POST_JOB_ACTIONS__` (`workflow/run_request.py`, byte-identical at 22.05
 * and 26.1). So a fully nested payload and a fully flattened one arrive the
 * same, and flattening here buys nothing on the wire — it is the **decoder**
 * that needs the names, since what this writes is what the analysis row
 * stores and what copying one reads back.
 *
 * The repeat is the exception where flattening is not a choice.
 * `_flatten_step_params` recurses into dicts only, and a list is not a dict,
 * so a repeat sent under its bare name passes through whole, matches no
 * `prefixed_name` in `compute_runtime_state` and is silently ignored —
 * Galaxy's own TODO on that function says as much: *"so that repeats can be
 * handled properly"*. Naming the instances here is what makes a repeat's
 * parameters reach the tool at all (#98).
 */
function encodeInto(key: string, value: WorkflowParameterValue | undefined, parameters: WorkflowToolParameters): void {
  if (!isPresent(value)) {
    return
  }
  if (isRepeatInstances(value)) {
    value.forEach((instance, position) => {
      const prefix = repeatInstanceKey(key, position)
      for (const name in instance) {
        encodeInto(flattenKey(prefix, name), instance[name], parameters)
      }
    })
    return
  }
  if (isConditional(value)) {
    for (const name in value) {
      // Bound to a local because the narrowing has to survive the assignment:
      // `name` is a plain `string`, so TypeScript cannot carry a guard on
      // `value[name]` past the loop body.
      const nested = value[name]
      encodeInto(flattenKey(key, name), nested, parameters)
    }
    return
  }
  parameters[key] = value
}

export function useGalaxyEncodeParameters(parameterModel: MaybeRef<WorkflowParametersModel>): { encodedParameters: ComputedRef<EncodedGalaxyWorkflowParameter> } {
  const encodedParameters = computed<EncodedGalaxyWorkflowParameter>(() => {
    const parametersVal = toValue(parameterModel)
    const parameters: EncodedGalaxyWorkflowParameter = {}
    if (parametersVal) {
      for (const [stepId, params] of Object.entries(parametersVal)) {
        parameters[stepId] = {}
        for (const [key, param] of Object.entries(params)) {
          encodeInto(key, param, parameters[stepId])
        }
      }
    }
    return parameters
  })

  return { encodedParameters }
}
