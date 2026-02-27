import type { WorkflowRow } from 'nuxt-galaxy'
// import { useDatabaseWorkflow } from 'nuxt-galaxy'
import { pascalCase } from 'scule'

export interface UseWorkflowComponentOptions {
  workflow: Ref<WorkflowRow | undefined>
}

export function useWorkflowComponent(options: UseWorkflowComponentOptions) {
  const { workflow } = options

  const { workflowTagName, workflowTagVersion } = useDatabaseWorkflow({ workflow })

  const sanitizedWorkflowTagName = computed(() => {
    const workflowTagNameVal = toValue(workflowTagName)
    if (!workflowTagNameVal) {
      return undefined
    }
    return workflowTagNameVal.replace(/\W/g, '')
  })

  const sanitizedWorkflowTagVersion = computed(() => {
    const workflowTagVersionVal = toValue(workflowTagVersion)
    if (!workflowTagVersionVal) {
      return undefined
    }
    return workflowTagVersionVal.replace(/\W/g, '')
  })
  // <WorkflowsDefenseFinder200Galaxy1Genes></WorkflowsDefenseFinder200Galaxy1Genes>
  const componentName = computed(() => {
    const workflowTagNameVal = toValue(sanitizedWorkflowTagName)
    const workflowTagVersionVal = toValue(sanitizedWorkflowTagVersion)

    if (workflowTagNameVal && workflowTagVersionVal) {
      return `Workflows${pascalCase(workflowTagNameVal)}${pascalCase(workflowTagVersionVal)}`
    }
    throw createError('No workflow found')
  })

  return {
    workflowTagName,
    workflowTagVersion,
    sanitizedWorkflowTagName,
    sanitizedWorkflowTagVersion,
    componentName,
  }
}
