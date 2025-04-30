import type { ComputedRef, MaybeRef } from 'vue'
// import type { WorkflowParametersModel, WorkflowParametersTool } from './useGalaxyDecodeParameters'
import { computed, toValue } from 'vue'

export type EncodedGalaxyWorkflowParameter = Record<string, WorkflowParametersTool>

export function useGalaxyEncodeParameters(parameterModel: MaybeRef<WorkflowParametersModel>): { encodedParameters: ComputedRef<EncodedGalaxyWorkflowParameter> } {
  const encodedParameters = computed<EncodedGalaxyWorkflowParameter>(() => {
    const parametersVal = toValue(parameterModel)
    const parameters: EncodedGalaxyWorkflowParameter = {}
    if (parametersVal) {
      for (const [stepId, params] of Object.entries(parametersVal)) {
        parameters[stepId] = {}
        for (const [key, param] of Object.entries(params)) {
          if (typeof param === 'object' && !Array.isArray(param)) {
            for (const paramKey in param) {
              if (param[paramKey]) {
                parameters[stepId][`${key}|${paramKey}`] = param[paramKey]
              }
            }
          }
          else {
            parameters[stepId][key] = param
          }
        }
      }
    }
    return parameters
  })

  return { encodedParameters }
}
