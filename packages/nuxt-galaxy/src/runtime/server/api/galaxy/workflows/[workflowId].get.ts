import type { H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import * as bt from 'blendtype'
import { Cause, Effect, Option } from 'effect'
import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { Drizzle } from '../../../utils/drizzle'
import { runGalaxyEffect } from '../../../utils/evlog-effect'
import { useGalaxyLayer } from '../../../utils/galaxy'
import { ServerSupabaseClaims, ServerSupabaseClient } from '../../../utils/grizzle/supabase'

/**
 * The revision the caller asks Galaxy to describe, or none for the latest.
 *
 * Galaxy answers `GET /api/workflows/{id}` with the latest revision unless
 * `version` names one, and until #48 this proxy never named one: the form
 * described Galaxy's latest while the server compared the datamap against,
 * and now starts, the revision the row is pinned to. The form sends that row's
 * `revision`, an integer by construction. Galaxy's `get_internal_version`
 * indexes a list, so only a non-negative integer can name a revision, and
 * anything else — a word, a negative, a fraction, a repeated parameter — is
 * refused here rather than handed to Galaxy to answer for: a caller reaching
 * this has a bug worth being told about.
 */
function requestedRevision(event: H3Event): number | undefined {
  const { version } = getQuery(event)
  if (version === undefined) {
    return undefined
  }
  if (typeof version === 'string' && /^\d+$/.test(version)) {
    return Number(version)
  }
  throw createError({
    statusCode: 400,
    statusMessage: '`version` must be a non-negative integer',
  })
}

export default defineEventHandler(async (event) => {
  const { public: { galaxy: { url } } } = useRuntimeConfig()

  const workflowId = getRouterParam(event, 'workflowId')
  // read before anything is asked of Galaxy, so a revision nobody can use
  // costs a round trip and nothing more
  const revision = requestedRevision(event)
  if (workflowId) {
    const program = Effect.gen(function* () {
      return yield* bt.getWorkflowEffect(workflowId, revision)
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
