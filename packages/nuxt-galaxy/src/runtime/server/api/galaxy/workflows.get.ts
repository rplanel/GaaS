import { getWorkflowsEffect, toGalaxyServiceUnavailable } from 'blendtype'
import { Effect, Exit } from 'effect'
import { defineEventHandler } from 'h3'
import { runGalaxyEffect } from '../../utils/evlog-effect'
import { useGalaxyLayer } from '../../utils/galaxy'
import { toHttpError } from '../../utils/httpError'

/**
 * The stored workflows of the Galaxy account GaaS runs as, hidden ones
 * included: hidden is a display flag of Galaxy's own list and says nothing
 * about whether GaaS can publish or run a workflow, and the admin page reads
 * a stored workflow absent from this list as one Galaxy no longer has. Only
 * deleted ones are left out, which is what "no longer has" means.
 */
export default defineEventHandler(async (event) => {
  const result = await runGalaxyEffect(
    event,
    getWorkflowsEffect({ includeHidden: true }).pipe(
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
