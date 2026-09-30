import * as bt from 'blendtype'
import { Effect, Exit } from 'effect'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { runGalaxyEffect } from '../../../../utils/evlog-effect'
import { useGalaxyLayer } from '../../../../utils/galaxy'
import { GalaxyHasNoSuchThing, galaxyHasNoSuchThing } from '../../../../utils/grizzle/galaxyHasNoSuchThing'
import { toHttpError } from '../../../../utils/httpError'

/**
 * The revisions of a stored workflow, as Galaxy indexes them (ADR 0004, #73).
 *
 * The publish dialog lists them so an administrator can choose the revision a
 * version pins, the latest or an older one. Each entry carries its 0-based
 * index as `version`, which is the integer `POST /api/db/workflows` takes as
 * `revision`, when it was saved and how many steps it has. Nothing is read
 * from the database here: which of them are already published is the page's
 * to know, from the versions it already lists.
 *
 * Administrators only, and not because of anything in this file: the level is
 * `admin` in `galaxyAccess.ts`, and the `galaxyGuard` middleware settles it
 * before the request arrives (#99). Until then this handler provided
 * `ServerSupabaseClaims.Live` and read it nowhere, which made an absent check
 * look like a considered one.
 */
export default defineEventHandler(async (event) => {
  // a middle segment, so an empty one matches the route and arrives here
  const workflowId = getRouterParam(event, 'workflowId') ?? ''
  if (!workflowId) {
    throw createError({ statusCode: 404, statusMessage: 'Workflow not found' })
  }

  const result = await runGalaxyEffect(event, bt.getWorkflowRevisionsEffect(workflowId).pipe(
    Effect.catchIf(galaxyHasNoSuchThing, () => Effect.fail(new GalaxyHasNoSuchThing({
      message: `Galaxy holds no stored workflow ${workflowId}`,
    }))),
    bt.toGalaxyServiceUnavailable,
    Effect.provide(useGalaxyLayer()),
    Effect.exit,
  ))

  return Exit.match(result, {
    onFailure: cause => toHttpError(event, cause, 'galaxy workflow revisions', {
      statuses: { GalaxyHasNoSuchThing: 404 },
    }),
    onSuccess: value => value,
  })
})
