import type { H3Event } from 'h3'
import type { RevisionToolCheck } from '../../../../../../utils/grizzle/workflowTools'
import { useRuntimeConfig } from '#imports'
import * as bt from 'blendtype'
import { Cause, Effect, Option } from 'effect'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { Drizzle } from '../../../../../../utils/drizzle'
import { runGalaxyEffect } from '../../../../../../utils/evlog-effect'
import { useGalaxyLayer } from '../../../../../../utils/galaxy'
import { ServerSupabaseClaims, ServerSupabaseClient } from '../../../../../../utils/grizzle/supabase'
import { missingToolsEffect, pinnedTools } from '../../../../../../utils/grizzle/workflowTools'

/**
 * The revision the caller asks about, by the 0-based index Galaxy lists it
 * under. Galaxy's `get_internal_version` indexes a list, so only a
 * non-negative integer can name a revision; anything else, a word, a
 * negative, a fraction, an empty middle segment, is refused here rather than
 * handed to Galaxy to answer for, as the by-id proxy refuses its `version`.
 * The publish dialog only ever sends a revision Galaxy listed, so a caller
 * reaching this has a bug worth being told about. Thrown outside the effect
 * on purpose: h3 reads a status off a throw in ordinary async code only.
 */
function requestedRevision(event: H3Event): number {
  const revision = getRouterParam(event, 'revision') ?? ''
  if (!/^\d+$/.test(revision)) {
    throw createError({
      statusCode: 400,
      statusMessage: '`revision` must be a non-negative integer',
    })
  }
  return Number(revision)
}

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
 */
export default defineEventHandler(async (event) => {
  const { public: { galaxy: { url } } } = useRuntimeConfig()

  // read before anything is asked of Galaxy, so a revision nobody can use
  // costs a round trip and nothing more
  const revision = requestedRevision(event)
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
      Effect.provide(Drizzle.Live),
      Effect.provide(ServerSupabaseClaims.Live),
      Effect.provide(ServerSupabaseClient.Live),
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
