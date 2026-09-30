import type { RevisionToolCheck } from '../../../../../../utils/grizzle/workflowTools'
import * as bt from 'blendtype'
import { Effect, Exit } from 'effect'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { runGalaxyEffect } from '../../../../../../utils/evlog-effect'
import { useGalaxyLayer } from '../../../../../../utils/galaxy'
import { GalaxyHasNoSuchThing, galaxyHasNoSuchThing } from '../../../../../../utils/grizzle/galaxyHasNoSuchThing'
import { missingToolsEffect, pinnedTools } from '../../../../../../utils/grizzle/workflowTools'
import { toHttpError } from '../../../../../../utils/httpError'
import { requestedRevisionParam } from '../../../../../../utils/revisionParam'

/**
 * The tool check of one revision of a stored workflow (ADR 0004, #75).
 *
 * Galaxy refuses to run a revision whose tools are not installed at their
 * exact pinned version, and `POST /api/db/workflows` refuses to publish one
 * for the same reason. The publish dialog runs the same check here for the
 * revision it has selected, so the administrator reads which tools are
 * missing before clicking Publish rather than after. The revision is exported
 * and each distinct tool it pins is looked up at its pinned version; the
 * answer names the missing ones and says how many were checked. Nothing is
 * read from the database, and nothing is written anywhere.
 *
 * Administrators only, and not because of anything in this file: the level is
 * `admin` in `galaxyAccess.ts`, and the `galaxyGuard` middleware settles it
 * before the request arrives (#99). It matters more here than next door — the
 * export this runs reaches any stored workflow, published in GaaS or not.
 */
export default defineEventHandler(async (event) => {
  // read before anything is asked of Galaxy, so a revision nobody can use
  // costs a round trip and nothing more
  const revision = requestedRevisionParam(event)
  // a middle segment, so an empty one matches the route and arrives here
  const workflowId = getRouterParam(event, 'workflowId') ?? ''
  if (!workflowId) {
    throw createError({ statusCode: 404, statusMessage: 'Workflow not found' })
  }

  const program = Effect.gen(function* () {
    const definition = yield* bt.exportWorkflowEffect(workflowId, 'export', revision).pipe(
      Effect.catchIf(galaxyHasNoSuchThing, () => Effect.fail(new GalaxyHasNoSuchThing({
        message: `Galaxy holds no revision ${bt.galaxyRevisionNumber(revision)} of stored workflow ${workflowId}`,
      }))),
    )
    const missing = yield* missingToolsEffect(definition)
    const check: RevisionToolCheck = { missing, checked: pinnedTools(definition).length }
    return check
  })

  const result = await runGalaxyEffect(event, program.pipe(
    bt.toGalaxyServiceUnavailable,
    Effect.provide(useGalaxyLayer()),
    Effect.exit,
  ))

  return Exit.match(result, {
    // Only the export is read this way. A tool lookup that answered 404 is
    // a missing tool, which the check reports, and anything else from one is
    // a fault to log, not a revision to report as absent.
    onFailure: cause => toHttpError(event, cause, 'galaxy revision tools', {
      statuses: { GalaxyHasNoSuchThing: 404 },
    }),
    onSuccess: value => value,
  })
})
