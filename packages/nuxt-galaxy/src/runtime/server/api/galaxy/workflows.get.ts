import { getWorkflowsEffect, toGalaxyServiceUnavailable } from 'blendtype'
import { Effect } from 'effect'
import { defineEventHandler } from 'h3'
import { useGalaxyLayer } from '../../utils/galaxy'

export default defineEventHandler(async () => {
  return getWorkflowsEffect().pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(useGalaxyLayer()),
    Effect.runPromise,
  )
})
