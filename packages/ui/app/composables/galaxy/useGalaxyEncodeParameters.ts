import type { ComputedRef, MaybeRef } from 'vue'
import type { EncodedGalaxyWorkflowParameter, WorkflowParametersModel } from './types'
import { computed, toValue } from 'vue'
import { isConditional, isPresent } from './parameterValue'

export function useGalaxyEncodeParameters(parameterModel: MaybeRef<WorkflowParametersModel>): { encodedParameters: ComputedRef<EncodedGalaxyWorkflowParameter> } {
  const encodedParameters = computed<EncodedGalaxyWorkflowParameter>(() => {
    const parametersVal = toValue(parameterModel)
    const parameters: EncodedGalaxyWorkflowParameter = {}
    if (parametersVal) {
      for (const [stepId, params] of Object.entries(parametersVal)) {
        parameters[stepId] = {}
        for (const [key, param] of Object.entries(params)) {
          // A conditional is flattened to `name|subname`; anything else is
          // sent as it stands. Both paths omit the same thing — only an
          // absence — so the depth of a value stops deciding whether it
          // reaches Galaxy at all (#95).
          if (isConditional(param)) {
            for (const paramKey in param) {
              // Bound to a local because the narrowing has to survive the
              // assignment: `paramKey` is a plain `string`, so TypeScript
              // cannot carry a guard on `param[paramKey]` past the `if`.
              const nested = param[paramKey]
              if (isPresent(nested)) {
                parameters[stepId][`${key}|${paramKey}`] = nested
              }
            }
          }
          else if (isPresent(param)) {
            parameters[stepId][key] = param
          }
        }
      }
    }
    return parameters
  })

  return { encodedParameters }
}
