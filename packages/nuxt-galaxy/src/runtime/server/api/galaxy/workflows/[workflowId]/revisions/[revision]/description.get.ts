import { useRuntimeConfig } from '#imports'
import { toGalaxyServiceUnavailable } from 'blendtype'
import { Effect, Exit } from 'effect'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { Drizzle } from '../../../../../../utils/drizzle'
import { runGalaxyEffect } from '../../../../../../utils/evlog-effect'
import { useGalaxyLayer } from '../../../../../../utils/galaxy'
import { useGalaxyCache } from '../../../../../../utils/galaxyCache'
import { workflowDescriptionEffect } from '../../../../../../utils/grizzle/workflowDescription'
import { toHttpError } from '../../../../../../utils/httpError'
import { requestedRevisionParam } from '../../../../../../utils/revisionParam'

/**
 * One revision of one workflow, described in a single call (Q13(a)): its
 * steps, its inputs, the definitions of the tools it pins, and every tool
 * that came back as something other than itself.
 *
 * This replaces the 1+N uncached round trips the invoke form and the
 * analysis panel each made on every mount. Tool definitions are the most
 * cacheable data in the system and were the most refetched; they are cached
 * here, per Galaxy URL and per the version Galaxy **served**, with no expiry.
 *
 * The workflow half is read from the **stored definition** (#88, Q12) — the
 * export captured when the version was published, in this application's own
 * database — rather than from the live Galaxy API, which keys a step's
 * connections in an overwrite loop and so cannot describe an input fed by
 * two upstream outputs. So the only thing asked of Galaxy here is the tools.
 *
 * Nothing is written anywhere but the cache.
 */
export default defineEventHandler(async (event) => {
  const { public: { galaxy: { url } }, galaxy: { cache, email } } = useRuntimeConfig()

  // Read before anything else is done, so a revision nobody can use costs a
  // parse and nothing more. Mandatory by construction, and that is the point
  // (Q15): the unpinned read answers whatever Galaxy's latest revision is,
  // which moves with every save in its editor and so must not be cached.
  // Giving it no route means a caller cannot ask for it.
  const revision = requestedRevisionParam(event)
  // a middle segment, so an empty one matches the route and arrives here
  const workflowId = getRouterParam(event, 'workflowId') ?? ''
  if (!workflowId) {
    throw createError({ statusCode: 404, statusMessage: 'Workflow not found' })
  }

  const result = await runGalaxyEffect(
    event,
    workflowDescriptionEffect(workflowId, revision, useGalaxyCache(cache.enabled), url, email).pipe(
      toGalaxyServiceUnavailable,
      Effect.provide(Drizzle.Live),
      Effect.provide(useGalaxyLayer()),
      Effect.exit,
    ),
  )

  return Exit.match(result, {
    onFailure: cause => toHttpError(event, cause, 'workflow description', {
      statuses: {
        // The causes the caller can act on besides the shared ones. A
        // database read that failed for a reason of its own is a fault to
        // log, not a revision to report as absent.
        WorkflowRevisionNotFound: 404,
        // Both say the same thing about the row rather than about the
        // request: what is stored is not the revision that was asked for, or
        // is not readable as one. Neither is a fault of this request's, and
        // both are mended the same way — republish the version — so the
        // sentence, not the status, is what tells them apart.
        StoredDefinitionStale: 409,
        StoredDefinitionUnreadable: 409,
      },
    }),
    onSuccess: value => value,
  })
})
