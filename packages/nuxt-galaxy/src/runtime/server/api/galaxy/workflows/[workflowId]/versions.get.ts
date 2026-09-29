import { useRuntimeConfig } from '#imports'
import * as bt from 'blendtype'
import { Cause, Effect, Option } from 'effect'
import { defineEventHandler, getRouterParam } from 'h3'
import { runGalaxyEffect } from '../../../../utils/evlog-effect'
import { useGalaxyLayer } from '../../../../utils/galaxy'

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
  const { public: { galaxy: { url } } } = useRuntimeConfig()

  const workflowId = getRouterParam(event, 'workflowId')
  if (workflowId) {
    const program = Effect.gen(function* () {
      return yield* bt.getWorkflowRevisionsEffect(workflowId)
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
