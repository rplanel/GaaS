import { useRuntimeConfig } from '#imports'
import { toGalaxyServiceUnavailable } from 'blendtype'
import { Cause, Effect, Either, Layer } from 'effect'
import { useLogger } from 'evlog'
import { createError, defineEventHandler, readBody } from 'h3'
import { Drizzle } from '../../utils/drizzle'
import { runGalaxyEffect } from '../../utils/evlog-effect'
import { useGalaxyLayer } from '../../utils/galaxy'
import { ServerSupabaseClaims, ServerSupabaseClient } from '../../utils/grizzle/supabase'
import { insertWorkflow } from '../../utils/grizzle/workflows'

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
        Effect.either,
      ),
    )

    return Either.match(result, {
      onLeft: (error) => {
        if (error._tag === 'GetSupabaseUserError') {
          throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
        }
        // the insert goes through the user-scoped client, so an RLS refusal is
        // the database saying this caller may not import workflows: a refusal,
        // not a fault
        if (error._tag === 'ForbiddenError') {
          throw createError({ statusCode: 403, statusMessage: error.message })
        }
        if (error._tag === 'WorkflowAlreadyExistsError') {
          throw createError({ statusCode: error.statusCode, statusMessage: error.message })
        }
        if (error._tag === 'GalaxyServiceUnavailable') {
          throw createError({ statusCode: 503, statusMessage: error.message })
        }
        const log = useLogger(event)
        log.error('insert workflow handler failed', { cause: Cause.pretty(Cause.fail(error)) })
        throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
      },
      onRight: value => value,
    })
  },
)
