import { getWorkflow } from 'blendtype'
import { defineEventHandler, getRouterParam } from 'h3'

export default defineEventHandler(async (event) => {
  const workflowId = getRouterParam(event, 'workflowId')
  if (workflowId) {
    return getWorkflow(workflowId)
  }
})
