import type { WorkflowConditionalParametersValue, WorkflowToolParameters } from 'blendtype'
import type { MaybeRef } from 'vue'
import type { EncodedGalaxyWorkflowParameter } from './types'
import { computed, toValue } from 'vue'
import { isPresent } from './parameterValue'

export type WorkflowParametersModel = Record<string, WorkflowToolParameters>

export function useGalaxyDecodeParameters(galaxyWorkflowParameters: MaybeRef<EncodedGalaxyWorkflowParameter>) {
  const decodedParameters = computed<Record<string, WorkflowToolParameters>>(() => {
    const galaxyWorkflowParametersVal = toValue(galaxyWorkflowParameters)
    const inputParameters: Record<string, WorkflowToolParameters> = {}
    for (const stepId in galaxyWorkflowParametersVal) {
      inputParameters[stepId] = {}

      for (const paramName in galaxyWorkflowParametersVal[stepId]) {
        const value = galaxyWorkflowParametersVal[stepId][paramName]
        // The same rule the encoder writes by: only an absence is dropped.
        // Tested once, before the name is split, because the guard this
        // replaced sat on both branches and refused a falsy value twice —
        // a `0` at the top of a step failed the single-segment test, fell
        // into the nesting branch, and was refused again there (#95).
        if (!isPresent(value)) {
          continue
        }
        const splittedParamName = paramName.split('|')
        if (splittedParamName.length === 1) {
          inputParameters[stepId][paramName] = value
        }
        else {
          // init object
          const parentParam = splittedParamName.slice(0, -1)
          const childParam = splittedParamName.slice(-1)

          let currParamVisit: WorkflowToolParameters | WorkflowConditionalParametersValue = inputParameters[stepId]

          // we are creating the object structure.
          // each parent param should correspond to a WorkflowConditionalParametersValue type

          for (const param of parentParam) {
            if (!currParamVisit?.[param]) {
              inputParameters[stepId][param] = {}
            }
            currParamVisit = inputParameters[stepId][param] as WorkflowConditionalParametersValue || {}
          }
          if (childParam.length >= 1 && childParam[0]) {
            currParamVisit[childParam[0]] = value
          }
        }
      }
    }
    return inputParameters
  })
  return { decodedParameters }
}
