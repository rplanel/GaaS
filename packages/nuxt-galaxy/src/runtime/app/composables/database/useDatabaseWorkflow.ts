import type { ComputedRef, Ref } from 'vue'
import type { WorkflowRow } from '~/src/runtime/types/nuxt-galaxy'
import { computed, toValue } from 'vue'

export interface UseDatabaseWorkflowOptions {
  workflow: Ref<WorkflowRow | undefined>
}

export function useDatabaseWorkflow(options: UseDatabaseWorkflowOptions): { workflowTagName: ComputedRef<string | undefined>, workflowTagVersion: ComputedRef<string | undefined> } {
  const { workflow } = options

  const workflowTagName = computed(() => {
    const workflowVal = toValue(workflow)
    if (!workflowVal?.name_key) {
      return
    }
    return workflowVal.name_key
  })

  const workflowTagVersion = computed(() => {
    const workflowVal = toValue(workflow)
    if (!workflowVal?.version_key) {
      return
    }
    return workflowVal.version_key
  })

  return {
    workflowTagName,
    workflowTagVersion,
  }
}
