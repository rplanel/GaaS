import type { DatasetTerminalState } from 'blendtype'
import type { Ref } from 'vue'
import type { AnalysisOutputRow } from '~/src/runtime/types/nuxt-galaxy'
import { DatasetsTerminalStates } from 'blendtype'
import { computed, toValue } from 'vue'

export interface UseDatabaseAnalysisOutputOptions {
  analysisOutput: Ref<AnalysisOutputRow>
}

export function useDatabaseAnalysisOutput(options: UseDatabaseAnalysisOutputOptions) {
  const { analysisOutput } = options

  const state = computed(() => {
    const analysisOutputVal = toValue(analysisOutput)
    return analysisOutputVal.state
  })

  const isTerminalState = computed(() => {
    const stateVal = toValue(state)
    return DatasetsTerminalStates.includes(stateVal as DatasetTerminalState)
  })

  return {
    state,
    isTerminalState,
  }
}
