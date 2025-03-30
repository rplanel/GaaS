import { getTool } from 'blendtype'
import { defineEventHandler, getRouterParam } from 'h3'
import { decode } from 'ufo'

export default defineEventHandler(async (event) => {
  const toolId = getRouterParam(event, 'toolId')
  const toolVersion = getRouterParam(event, 'toolVersion')
  if (toolId && toolVersion) {
    return getTool(decode(toolId), toolVersion)
  }
})
