import { getWorkflowsEffect, toGalaxyServiceUnavailable } from 'blendtype'
import { Effect } from 'effect'
import { defineEventHandler } from 'h3'
import { runGalaxyEffect } from '../../utils/evlog-effect'
import { useGalaxyLayer } from '../../utils/galaxy'

export default defineEventHandler(async (event) => {
  return runGalaxyEffect(
    event,
    getWorkflowsEffect().pipe(
      toGalaxyServiceUnavailable,
      Effect.provide(useGalaxyLayer()),
    ),
  )
})
