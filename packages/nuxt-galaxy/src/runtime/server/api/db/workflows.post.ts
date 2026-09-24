import type { PublishVersionBody } from '../../utils/publishBody'
import { useRuntimeConfig } from '#imports'
import { toGalaxyServiceUnavailable } from 'blendtype'
import { Effect, Exit, Layer } from 'effect'
import { defineEventHandler, readBody } from 'h3'
import { Drizzle } from '../../utils/drizzle'
import { runGalaxyEffect } from '../../utils/evlog-effect'
import { useGalaxyLayer } from '../../utils/galaxy'
import { ServerSupabaseClaims, ServerSupabaseClient } from '../../utils/grizzle/supabase'
import { publishVersion } from '../../utils/grizzle/workflows'
import { toHttpError } from '../../utils/httpError'
import { readPublishVersionBody } from '../../utils/publishBody'

/**
 * Publish a version (ADR 0004): label one revision of a Galaxy stored
 * workflow for the web application, the one the body names or the latest
 * when it names none (#73). The admin page's publish dialog calls it,
 * but the dialog is not the only client, so what it accepts and refuses is
 * written down in the server docs rather than left to be read off the dialog.
 */
export default defineEventHandler<{ body: PublishVersionBody }>(
  async (event) => {
    // read and checked before any work is done, so a body nobody can act on
    // costs a round trip and nothing more. `readBody` throws on a body it
    // cannot parse, which is the same class of mistake and gets the same
    // answer, in this handler's words rather than h3's.
    const body = await readBody(event).catch(() => undefined)
    const version = readPublishVersionBody(body)

    const { public: { galaxy: { url } }, galaxy: { email } } = useRuntimeConfig()
    const finalLayer = Layer.mergeAll(
      ServerSupabaseClient.Live,
      ServerSupabaseClaims.Live,
      Drizzle.Live,
    )

    const result = await runGalaxyEffect(
      event,
      publishVersion(version, url, email, event).pipe(
        toGalaxyServiceUnavailable,
        Effect.provide(finalLayer),
        Effect.provide(useGalaxyLayer()),
        Effect.exit,
      ),
    )

    return Exit.match(result, {
      onFailure: cause => toHttpError(event, cause, 'publish version', {
        statuses: {
          // The request was well formed; what it asks for conflicts with a
          // version that exists, or with the lineage this stored workflow
          // already has. Each carries its own sentence, which the dialog
          // shows as written, since it names what the administrator can
          // change.
          VersionLabelTakenError: 409,
          RevisionAlreadyPublishedError: 409,
          WorkflowNameLockedError: 409,
          ConcurrentPublishError: 409,
        },
      }),
      onSuccess: value => value,
    })
  },
)
