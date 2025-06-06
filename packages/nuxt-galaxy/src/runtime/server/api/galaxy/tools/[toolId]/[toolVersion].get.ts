import { GalaxyFetch, getToolEffect, runWithConfig } from 'blendtype'
import { Effect } from 'effect'
import { defineEventHandler, getRouterParam } from 'h3'
import { decode } from 'ufo'

/**
 * API handler to fetch a specific Galaxy tool by its ID and version.
 * It uses the Blendtype library to get the tool effect and provides it with the GalaxyFetch layer.
 *
 * @param event - The H3 event object containing the request context.
 * @returns An Effect that resolves to the Galaxy tool data.
 */
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
