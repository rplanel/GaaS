import type { VersionActiveBody } from '../../../utils/versionActiveBody'
import { Effect, Exit, Layer } from 'effect'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { Drizzle } from '../../../utils/drizzle'
import { runGalaxyEffect } from '../../../utils/evlog-effect'
import { ServerSupabaseClaims, ServerSupabaseClient } from '../../../utils/grizzle/supabase'
import { setVersionActive } from '../../../utils/grizzle/workflows'
import { toHttpError } from '../../../utils/httpError'
import { readVersionActiveBody } from '../../../utils/versionActiveBody'

/**
 * Retire a version, or make it active again (ADR 0004): `active` is the one
 * column of a version an update may touch, and this is the one endpoint that
 * touches it. The admin workflows page calls it from the Active switch beside
 * each version, but the switch is not the only client, so what it accepts and
 * refuses is written down in the server docs rather than left to be read off
 * the switch. Nothing is asked of Galaxy: retiring is GaaS's alone.
 */
export default defineEventHandler<{ body: VersionActiveBody }>(
  async (event) => {
    // `workflowId` is the last segment, so an empty one does not match the
    // route at all and never arrives here. Anything but a non-negative integer
    // names no version, so it gets the answer a version nobody can act on
    // gets, as `[analysisId].delete` does for its own id, and before the body
    // is read.
    const workflowId = getRouterParam(event, 'workflowId') ?? ''
    if (!/^\d+$/.test(workflowId)) {
      throw createError({ statusCode: 404, statusMessage: `No workflow ${workflowId} is available` })
    }

    // read and checked before any work is done, so a body nobody can act on
    // costs a round trip and nothing more. `readBody` throws on a body it
    // cannot parse, which is the same class of mistake and gets the same
    // answer, in this handler's words rather than h3's.
    const body = await readBody(event).catch(() => undefined)
    const { active } = readVersionActiveBody(body)

    const finalLayer = Layer.mergeAll(
      ServerSupabaseClient.Live,
      ServerSupabaseClaims.Live,
      Drizzle.Live,
    )

    const result = await runGalaxyEffect(
      event,
      setVersionActive(Number(workflowId), active, event).pipe(
        Effect.provide(finalLayer),
        Effect.exit,
      ),
    )

    return Exit.match(result, {
      onFailure: cause => toHttpError(event, cause, 'retire version', {
        statuses: {
          // the one cause on this path the caller can act on besides the
          // shared ones: an identifier that names no version
          WorkflowNotFoundError: 404,
        },
      }),
      onSuccess: value => value,
    })
  },
)
