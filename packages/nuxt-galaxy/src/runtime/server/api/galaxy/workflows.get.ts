import { getWorkflows } from 'blendtype'
import { defineEventHandler } from 'h3'

export default defineEventHandler(async () => {
  return getWorkflows()
})
