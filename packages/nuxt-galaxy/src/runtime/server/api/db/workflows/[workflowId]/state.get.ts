import { toGalaxyServiceUnavailable } from 'blendtype'
import { Effect, Exit, Layer } from 'effect'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { Drizzle } from '../../../../utils/drizzle'
import { runGalaxyEffect } from '../../../../utils/evlog-effect'
import { useGalaxyLayer } from '../../../../utils/galaxy'
import { GetSupabaseUserError, ServerSupabaseClaims, ServerSupabaseClient } from '../../../../utils/grizzle/supabase'
import { versionStateEffect } from '../../../../utils/grizzle/versionState'
import { getWorkflowEffect } from '../../../../utils/grizzle/workflows'
import { toHttpError } from '../../../../utils/httpError'

/**
 * The state of one version (ADR 0004, #76): whether it can still run, read
 * live from Galaxy. Runnable, tools missing (named), missing in Galaxy, or
 * revision mismatch. The admin workflows page asks it once per version it
 * lists, so the page never fans out one request per tool; the fan-out to
 * Galaxy happens here, bounded. The reading writes nothing, and nothing is
 * retired from it: the administrator reads the badge and decides.
 */
export default defineEventHandler(async (event) => {
  // `workflowId` is a middle segment here, so an empty one can arrive;
  // anything but a non-negative integer names no version and gets the answer
  // a version nobody can act on gets, as the PATCH and DELETE siblings do
  const workflowId = getRouterParam(event, 'workflowId') ?? ''
  if (!/^\d+$/.test(workflowId)) {
    throw createError({ statusCode: 404, statusMessage: `No workflow ${workflowId} is available` })
  }

  const program = Effect.gen(function* () {
    // a session is required, as for every version endpoint, and checked
    // before the row is read so a caller with none costs nothing further
    const createServerSupabaseClaims = yield* ServerSupabaseClaims
    const supabaseClaims = yield* createServerSupabaseClaims(event)
    if (!supabaseClaims) {
      return yield* Effect.fail(new GetSupabaseUserError({ message: 'Unauthorized' }))
    }
    const version = yield* getWorkflowEffect(Number(workflowId))
    return yield* versionStateEffect({
      galaxyId: version.galaxyId,
      revision: version.revision,
      revisionUuid: version.revisionUuid,
    })
  })

  const finalLayer = Layer.mergeAll(
    ServerSupabaseClient.Live,
    ServerSupabaseClaims.Live,
    Drizzle.Live,
  )

  const result = await runGalaxyEffect(
    event,
    program.pipe(
      toGalaxyServiceUnavailable,
      Effect.provide(finalLayer),
      Effect.provide(useGalaxyLayer()),
      Effect.exit,
    ),
  )

  return Exit.match(result, {
    onFailure: cause => toHttpError(event, cause, 'version state', {
      statuses: {
        // the one cause on this path the caller can act on besides the
        // shared ones: an identifier that names no version. A Galaxy read
        // that failed for a reason of its own is a fault, never a state.
        WorkflowNotFoundError: 404,
      },
    }),
    onSuccess: value => value,
  })
})
