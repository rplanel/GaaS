import { getToolEffect, toGalaxyServiceUnavailable } from 'blendtype'
import { Effect, Either } from 'effect'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { decode } from 'ufo'
import { runGalaxyEffect } from '../../../../utils/evlog-effect'
import { useGalaxyLayer } from '../../../../utils/galaxy'
import { toHttpError } from '../../../../utils/httpError'

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
  // A matched route never leaves these `undefined`, but it does leave them
  // `''`: an empty path segment matches any parameter that is not the final
  // one, so `/api/galaxy/tools//1.0` arrives here with an empty `toolId`.
  // Falling off the end answered that with 200 and no body.
  //
  // This throw stays outside the effect on purpose: h3 only reads a status off
  // a throw in ordinary async/await, and one raised inside `Effect.gen` would
  // be captured as a defect and buried in a `FiberFailure`.
  if (!toolId || !toolVersion) {
    throw createError({ statusCode: 404, statusMessage: 'Tool not found' })
  }

  const result = await runGalaxyEffect(event, getToolEffect(decode(toolId), toolVersion).pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(useGalaxyLayer()),
    Effect.either,
  ))

  return Either.match(result, {
    onLeft: error => toHttpError(event, error, 'galaxy tool'),
    onRight: value => value,
  })
})
