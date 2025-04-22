import type { Ref } from '#imports'
import type { GalaxyWorkflow, WorkflowToolParameters, WorkflowToolStep } from 'blendtype'
import { computed, createError, ref, showError, toValue, watch } from '#imports'

export function useGalaxyWorkflow(workflowId: Ref<string | undefined>) {
  const workflow = ref<GalaxyWorkflow | undefined>(undefined)
  const error = ref<Error | null>(null)
  const workflowSteps = computed(() => {
    const workflowVal = toValue(workflow)
    if (workflowVal) {
      return workflowVal.steps
    }
    return {}
  })

  /**
   * Computed property that filters and returns only the workflow steps of type 'tool'
   * from the workflow steps collection.
   *
   * @returns {Record<string, WorkflowToolStep>} An object containing only the tool steps,
   * where the key is the step ID and the value is the WorkflowToolStep
   */

  const workflowToolSteps = computed(() => {
    const workflowStepsVal = toValue(workflowSteps)
    const entries = Object.entries(workflowStepsVal)
    const filtered = entries
      .filter((entry): entry is [string, WorkflowToolStep] => {
        const [_, step] = entry
        return step.type === 'tool' && step.tool_id !== null && step.tool_version !== null
      })
    const res = filtered
      .reduce<Record<string, WorkflowToolStep>>((acc, [stepId, step]) => {
        acc[stepId] = step
        return acc
      }, {})
    return res
  })

  const workflowToolIds = computed(() => {
    const workflowToolStepsVal = toValue(workflowToolSteps)
    return Object.values(workflowToolStepsVal).map(step => ({
      toolId: step.tool_id,
      toolVersion: step.tool_version,
    }))
  })

  const workflowInputs = computed(() => {
    const workflowVal = toValue(workflow)
    if (workflowVal) {
      return workflowVal.inputs
    }
    return {}
  })

  const workflowParametersModel = computed(() => {
    const workflowToolStepsVal = toValue(workflowToolSteps)
    return Object.entries(workflowToolStepsVal).reduce<Record<string, WorkflowToolParameters>>((acc, [stepId, step]) => {
      acc[stepId] = step.tool_inputs
      return acc
    }, {} as Record<string, WorkflowToolParameters>)
  })

  const stepToTool = computed(() => {
    const workflowToolStepsVal = toValue(workflowToolSteps)
    const stepToToolMap: Record<string, string> = {}

    for (const stepId in workflowToolStepsVal) {
      const step = workflowToolStepsVal[stepId]
      const { tool_id: toolId } = step
      stepToToolMap[stepId] = toolId
    }
    return stepToToolMap
  })

  async function fetchWorkflow() {
    const workflowIdVal = toValue(workflowId)
    if (!workflowIdVal) {
      return
    }
    const { error: getWorkflowError, data } = await $fetch<{ error: { message: string, statusMessage: string, statusCode: number } | string | undefined, data: GalaxyWorkflow | undefined }>(
      `/api/galaxy/workflows/${workflowIdVal}`,
    )
    if (getWorkflowError) {
      if (typeof getWorkflowError === 'string') {
        throw showError(getWorkflowError)
      }
      else {
        throw showError({ ...getWorkflowError })
      }
    }

    if (data === undefined) {
      throw createError('Workflow not found')
    }
    workflow.value = data
  }

  watch(workflowId, () => {
    fetchWorkflow()
  }, { immediate: true, deep: true })

  // fetchWorkflow()
  return {
    workflow,
    workflowSteps,
    workflowInputs,
    workflowToolSteps,
    workflowToolIds,
    workflowParametersModel,
    stepToTool,
    error,
  }
}
