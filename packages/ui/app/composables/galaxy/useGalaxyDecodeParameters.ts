import type { WorkflowConditionalParametersValue, WorkflowToolParameters } from 'blendtype'
import type { MaybeRef } from 'vue'
import type { EncodedGalaxyWorkflowParameter } from './types'
import { computed, toValue } from 'vue'
import { isConditional, isPresent, splitKey } from './parameterValue'

export function useGalaxyDecodeParameters(galaxyWorkflowParameters: MaybeRef<EncodedGalaxyWorkflowParameter>) {
  const decodedParameters = computed<Record<string, WorkflowToolParameters>>(() => {
    const galaxyWorkflowParametersVal = toValue(galaxyWorkflowParameters)
    const inputParameters: Record<string, WorkflowToolParameters> = {}
    for (const stepId in galaxyWorkflowParametersVal) {
      inputParameters[stepId] = {}

      for (const paramName in galaxyWorkflowParametersVal[stepId]) {
        const value = galaxyWorkflowParametersVal[stepId][paramName]
        // Which values are dropped is the one thing this has to answer the
        // same way the encoder does, so it asks the same question: only an
        // absence goes. Asked once, before the name is split, because the
        // guard this replaced sat on both branches and refused a falsy value
        // twice — a `0` at the top of a step failed the single-segment test,
        // fell into the nesting branch, and was refused again there (#95).
        if (!isPresent(value)) {
          continue
        }
        const splittedParamName = splitKey(paramName)
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
            // Asks whether there is already a bag to nest into, rather than
            // whether what sits there is truthy: a falsy scalar parked under
            // this name would otherwise be read as "nothing here" and the
            // same truthiness fault would survive inside the fix for it.
            if (!isConditional(currParamVisit?.[param])) {
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
