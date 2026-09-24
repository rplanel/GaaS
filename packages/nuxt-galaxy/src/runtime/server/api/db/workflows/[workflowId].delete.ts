import { Effect, Exit, Layer } from 'effect'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { Drizzle } from '../../../utils/drizzle'
import { runGalaxyEffect } from '../../../utils/evlog-effect'
import { ServerSupabaseClaims, ServerSupabaseClient } from '../../../utils/grizzle/supabase'
import { deleteVersion } from '../../../utils/grizzle/workflows'
import { toHttpError } from '../../../utils/httpError'

/**
 * Delete a version no analysis references (ADR 0004): the mistaken publish,
 * a wrong label or a wrong revision. The admin workflows page calls it from
 * the Delete control beside each version, after a confirmation naming the
 * version, but the page is not the only client, so what it refuses is written
 * down in the server docs. Whether the version can go is the database's
 * decision: the `workflows.delete` policy says who, and the foreign key from
 * `analyses` says which. Nothing is asked of Galaxy.
 */
export default defineEventHandler(async (event) => {
  // `workflowId` is the last segment, so an empty one does not match the
  // route at all and never arrives here. Anything but a non-negative integer
  // names no version, so it gets the answer a version nobody can act on
  // gets, as its PATCH sibling and `[analysisId].delete` do for their own id.
  const workflowId = getRouterParam(event, 'workflowId') ?? ''
  if (!/^\d+$/.test(workflowId)) {
    throw createError({ statusCode: 404, statusMessage: `No workflow ${workflowId} is available` })
  }

  const finalLayer = Layer.mergeAll(
    ServerSupabaseClient.Live,
    ServerSupabaseClaims.Live,
    Drizzle.Live,
  )

  const result = await runGalaxyEffect(
    event,
    deleteVersion(Number(workflowId), event).pipe(
      Effect.provide(finalLayer),
      Effect.exit,
    ),
  )

  return Exit.match(result, {
    onFailure: cause => toHttpError(event, cause, 'delete version', {
      statuses: {
        // an identifier that names no version
        WorkflowNotFoundError: 404,
        // the version exists and the caller may delete versions; what it
        // asks for conflicts with the analyses that reference this one, so
        // the sentence names the version and points at retiring instead
        WorkflowReferencedError: 409,
      },
    }),
    onSuccess: value => value,
  })
})
