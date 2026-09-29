import type { RevisionToolCheck } from '../../../../../../utils/grizzle/workflowTools'
import { useRuntimeConfig } from '#imports'
import * as bt from 'blendtype'
import { Cause, Effect, Option } from 'effect'
import { defineEventHandler, getRouterParam } from 'h3'
import { runGalaxyEffect } from '../../../../../../utils/evlog-effect'
import { useGalaxyLayer } from '../../../../../../utils/galaxy'
import { missingToolsEffect, pinnedTools } from '../../../../../../utils/grizzle/workflowTools'
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
  const { public: { galaxy: { url } } } = useRuntimeConfig()

  // read before anything is asked of Galaxy, so a revision nobody can use
  // costs a round trip and nothing more
  const revision = requestedRevisionParam(event)
  const workflowId = getRouterParam(event, 'workflowId')
  if (workflowId) {
    const program = Effect.gen(function* () {
      const definition = yield* bt.exportWorkflowEffect(workflowId, 'export', revision)
      const missing = yield* missingToolsEffect(definition)
      const check: RevisionToolCheck = { missing, checked: pinnedTools(definition).length }
      return check
    })

    return runGalaxyEffect(event, program.pipe(
      bt.toGalaxyServiceUnavailable,
      Effect.provide(useGalaxyLayer()),
      Effect.matchCause({
        onFailure: (cause) => {
          const optionFailure = Cause.failureOption(cause)
          const failureValue = Option.getOrNull(optionFailure)
          if (failureValue?._tag === 'GalaxyServiceUnavailable') {
            return { error: { message: Cause.pretty(cause), statusMessage: `Galaxy Service @ ${url} is unavailable`, statusCode: 503 }, data: undefined }
          }
          return { error: { message: Cause.pretty(cause) }, data: undefined }
        },
        onSuccess: (value) => {
          return { error: undefined, data: value }
        },
      }),
    ))
  }
  return { error: new Error('Workflow ID is required'), data: undefined }
})
