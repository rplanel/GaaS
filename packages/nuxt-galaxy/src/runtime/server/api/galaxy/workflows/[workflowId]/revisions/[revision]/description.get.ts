import type { H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import { toGalaxyServiceUnavailable } from 'blendtype'
import { Effect, Exit } from 'effect'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { runGalaxyEffect } from '../../../../../../utils/evlog-effect'
import { useGalaxyLayer } from '../../../../../../utils/galaxy'
import { useGalaxyCache } from '../../../../../../utils/galaxyCache'
import { workflowDescriptionEffect } from '../../../../../../utils/grizzle/workflowDescription'
import { toHttpError } from '../../../../../../utils/httpError'

/**
 * The revision the caller asks about, by the 0-based index Galaxy lists it
 * under. Galaxy's `get_internal_version` indexes a list, so only a
 * non-negative integer can name a revision; anything else — a word, a
 * negative, a fraction, an empty middle segment — is refused here rather
 * than handed to Galaxy to answer for, as the two sibling proxies refuse
 * theirs.
 *
 * Mandatory by construction, and that is the point (Q15): the unpinned read
 * answers whatever Galaxy's latest revision is, which moves with every save
 * in its editor and so must not be cached. Giving it no route means a caller
 * has no way to ask for the uncacheable thing.
 *
 * Thrown outside the effect on purpose: h3 reads a status off a throw in
 * ordinary async code only.
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
 * One revision of one workflow, described in a single call (Q13(a)): its
 * steps, its inputs, the definitions of the tools it pins, and every tool
 * that came back as something other than itself.
 *
 * This replaces the 1+N uncached round trips the invoke form and the
 * analysis panel each made on every mount. Tool definitions are the most
 * cacheable data in the system and were the most refetched; they are cached
 * here, per Galaxy URL and per the version Galaxy **served**, with no expiry.
 *
 * Nothing is read from the database and nothing is written anywhere but the
 * cache.
 */
export default defineEventHandler(async (event) => {
  const { public: { galaxy: { url } }, galaxy: { cache } } = useRuntimeConfig()

  // read before anything is asked of Galaxy, so a revision nobody can use
  // costs a round trip and nothing more
  const revision = requestedRevision(event)
  // a middle segment, so an empty one matches the route and arrives here
  const workflowId = getRouterParam(event, 'workflowId') ?? ''
  if (!workflowId) {
    throw createError({ statusCode: 404, statusMessage: 'Workflow not found' })
  }

  const result = await runGalaxyEffect(
    event,
    workflowDescriptionEffect(workflowId, revision, useGalaxyCache(cache.enabled), url).pipe(
      toGalaxyServiceUnavailable,
      Effect.provide(useGalaxyLayer()),
      Effect.exit,
    ),
  )

  return Exit.match(result, {
    onFailure: cause => toHttpError(event, cause, 'workflow description', {
      statuses: {
        // the one cause here the caller can act on besides the shared ones.
        // Galaxy failing for a reason of its own is a fault to log, not a
        // revision to report as absent.
        WorkflowRevisionNotFound: 404,
      },
    }),
    onSuccess: value => value,
  })
})
