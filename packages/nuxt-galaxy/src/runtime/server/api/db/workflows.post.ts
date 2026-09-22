import { useRuntimeConfig } from '#imports'
import { toGalaxyServiceUnavailable } from 'blendtype'
import { Effect, Exit, Layer, Option } from 'effect'
import { createError, defineEventHandler, readBody } from 'h3'
import { Drizzle } from '../../utils/drizzle'
import { runGalaxyEffect } from '../../utils/evlog-effect'
import { useGalaxyLayer } from '../../utils/galaxy'
import { ServerSupabaseClaims, ServerSupabaseClient } from '../../utils/grizzle/supabase'
import { insertWorkflow } from '../../utils/grizzle/workflows'
import { answerableFailure, toHttpError } from '../../utils/httpError'

/**
 * The one thing this endpoint needs from a request body, read rather than
 * assumed.
 *
 * The handler's type annotation is erased at build time, so nothing checked
 * that a body arrived at all: destructuring `undefined` threw a `TypeError`
 * into a 500, and any other shape reached the Galaxy export as-is.
 */
function readGalaxyId(body: unknown): string {
  const galaxyId = body !== null && typeof body === 'object'
    ? (body as { galaxyId?: unknown }).galaxyId
    : undefined

  if (typeof galaxyId !== 'string' || galaxyId.trim().length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: '`galaxyId` must be a non-empty string',
    })
  }

  return galaxyId
}

export default defineEventHandler<{ body: { galaxyId: string } }>(
  async (event) => {
    // read before any work is done, so a body nobody can act on costs a round
    // trip and nothing more. `readBody` throws on a body it cannot parse, which
    // is the same class of mistake and gets the same answer.
    const body = await readBody(event).catch(() => undefined)
    const galaxyId = readGalaxyId(body)

    const { public: { galaxy: { url } }, galaxy: { email } } = useRuntimeConfig()
    const finalLayer = Layer.mergeAll(
      ServerSupabaseClient.Live,
      ServerSupabaseClaims.Live,
      Drizzle.Live,
    )

    const result = await runGalaxyEffect(
      event,
      insertWorkflow(galaxyId, url, email, event).pipe(
        toGalaxyServiceUnavailable,
        Effect.provide(finalLayer),
        Effect.provide(useGalaxyLayer()),
        Effect.exit,
      ),
    )

    return Exit.match(result, {
      onFailure: (cause) => {
        // the one status this endpoint answers that travels on the error
        // rather than being decided here, so it stays at the call site. The
        // failure is unwrapped for the tag check only, and through
        // `answerableFailure` rather than `Cause.failureOption`: a 409 that
        // arrived paired with a defect is not a 409 worth answering, and
        // reading the failure directly here would have walked this one branch
        // past the logged 500 the rest of the module routes it to.
        const failure = Option.getOrUndefined(answerableFailure(cause))
        if (failure?._tag === 'WorkflowAlreadyExistsError') {
          throw createError({ statusCode: failure.statusCode, statusMessage: failure.message })
        }
        return toHttpError(event, cause, 'insert workflow')
      },
      onSuccess: value => value,
    })
  },
)
