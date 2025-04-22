import type { Ref } from 'vue'
import type { WorkflowAnalysis } from '../../../utils/analysis'
import { Effect } from 'effect'
import { ref, toValue, watchEffect } from 'vue'
import { getWorkflowAnalysesEffect } from '../../../utils/analysis'
import { SupabaseConfigLive } from '../../../utils/supabase'

export function useWorkflowAnalyses(workflowId: Ref<number>) {
  const pending = ref(false)
  const analyses = ref<WorkflowAnalysis | null>(null)

  function runGetAnalyses() {
    pending.value = true
    const workflowIdVal = toValue(workflowId)
    const analysesEffect = getWorkflowAnalysesEffect(workflowIdVal)

    return Effect.runPromise(
      Effect.provide(analysesEffect, SupabaseConfigLive),
    ).finally(() => {
      pending.value = false
    })
  }

  watchEffect(() => {
    runGetAnalyses().then((analysesGot) => {
      analyses.value = analysesGot
    })
  })

  runGetAnalyses()
  return {
    pending,
    analyses,
  }
}
