import { getWorkflowsEffect, toGalaxyServiceUnavailable } from 'blendtype'
import { Effect, Either } from 'effect'
import { defineEventHandler } from 'h3'
import { runGalaxyEffect } from '../../utils/evlog-effect'
import { useGalaxyLayer } from '../../utils/galaxy'
import { toHttpError } from '../../utils/httpError'

export default defineEventHandler(async (event) => {
  const result = await runGalaxyEffect(
    event,
    getWorkflowsEffect().pipe(
      toGalaxyServiceUnavailable,
      Effect.provide(useGalaxyLayer()),
      Effect.either,
    ),
  )

  return Either.match(result, {
    onLeft: error => toHttpError(event, error, 'galaxy workflows'),
    onRight: value => value,
  })
})
