import { getWorkflowsEffect, toGalaxyServiceUnavailable } from 'blendtype'
import { Effect, Exit } from 'effect'
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
      Effect.exit,
    ),
  )

  return Exit.match(result, {
    onFailure: cause => toHttpError(event, cause, 'galaxy workflows'),
    onSuccess: value => value,
  })
})
