import { GalaxyFetch, getToolEffect, runWithConfig } from 'blendtype'
import { Effect } from 'effect'
import { defineEventHandler, getRouterParam } from 'h3'
import { decode } from 'ufo'

export default defineEventHandler(async (event) => {
  const toolId = getRouterParam(event, 'toolId')
  const toolVersion = getRouterParam(event, 'toolVersion')
  if (toolId && toolVersion) {
    return getToolEffect(decode(toolId), toolVersion).pipe(
      Effect.provide(GalaxyFetch.Live),
      runWithConfig,
    )
  }
})
