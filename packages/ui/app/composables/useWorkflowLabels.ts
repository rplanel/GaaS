import type { AnalysisMonitoringWorkflowUsage, WorkflowSelection } from 'nuxt-galaxy'
import type { ComputedRef, Ref } from 'vue'
import { UNKNOWN_WORKFLOW, UNKNOWN_WORKFLOW_LABEL, workflowKey, workflowUsageLabel } from '../utils/usageStatistics'

/**
 * What to call a workflow, including one the latest response no longer lists.
 *
 * A selection outlives a range that holds nothing of it, and the names come
 * from the response, so without a memory there would be nothing to call the
 * very workflow whose absence is being reported. The URL carries the
 * identifier alone: a name there would go stale on a rename, which is the
 * mistake the preset tokens already avoid.
 */
export function useWorkflowLabels(
  perWorkflow: Ref<AnalysisMonitoringWorkflowUsage[]> | ComputedRef<AnalysisMonitoringWorkflowUsage[]>,
) {
  /** Every workflow name seen so far, kept across responses. */
  const known = ref<Record<string, string>>({})

  watch(perWorkflow, (entries) => {
    const next = { ...known.value }
    for (const entry of entries) {
      const name = workflowUsageLabel(entry)
      next[workflowKey(entry)] = entry.version ? `${name} ${entry.version}` : name
    }
    known.value = next
  }, { immediate: true })

  /**
   * The name for one selection, or the truest thing available. A cold load of
   * a link into a range holding nothing of it has never been told the name,
   * and the identifier is a better answer than a guess.
   */
  function labelFor(selection: WorkflowSelection): string {
    const fallback = selection === UNKNOWN_WORKFLOW ? UNKNOWN_WORKFLOW_LABEL : `Workflow ${selection}`
    return known.value[String(selection)] ?? fallback
  }

  return { labelFor }
}
