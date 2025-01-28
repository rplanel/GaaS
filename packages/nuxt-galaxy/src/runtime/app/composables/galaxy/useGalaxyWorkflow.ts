import type { MaybeRef } from '#imports'
import type { GalaxyWorkflow, WorkflowStep, WorkflowToolParameters } from 'blendtype'
import { computed, ref, toValue } from '#imports'

interface WorkflowToolStep extends WorkflowStep {
  type: 'tool'
  tool_id: string
  tool_version: string
}

export function useGalaxyWorkflow(workflowId: MaybeRef<string | undefined>) {
  const workflow = ref<GalaxyWorkflow | undefined>(undefined)

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

  async function fetchWorkflow() {
    const workflowIdVal = toValue(workflowId)
    if (workflowIdVal) {
      const data = await $fetch<GalaxyWorkflow | undefined>(`/api/galaxy/workflows/${workflowIdVal}`)
      workflow.value = data
    }
  }
  fetchWorkflow()
  return { workflow, workflowSteps, workflowInputs, workflowToolSteps, workflowToolIds, workflowParametersModel }
}
