import type { GalaxyWorkflowInput } from 'blendtype'
import type { AnalysisBody } from '../../../types/nuxt-galaxy.js'
import { toGalaxyServiceUnavailable } from 'blendtype'
import { Effect, Exit, Layer } from 'effect'
import { defineEventHandler, readBody } from 'h3'
import { Drizzle } from '../../utils/drizzle.js'
import { runGalaxyEffect } from '../../utils/evlog-effect'
import { UrlFetch } from '../../utils/fetch'
import { useGalaxyLayer } from '../../utils/galaxy.js'
import { runAnalysis } from '../../utils/grizzle/analyses.js'
import { uploadDatasetsEffect } from '../../utils/grizzle/datasets'
import { addHistoryEffect, discardPreparedHistoryEffect } from '../../utils/grizzle/histories'
import { getSupabaseUser, GetSupabaseUserError, ServerSupabaseClaims, ServerSupabaseClient } from '../../utils/grizzle/supabase.js'
import { requireDatamapDeclaresInputs } from '../../utils/grizzle/workflowInputs'
import { getWorkflowEffect } from '../../utils/grizzle/workflows'
import { checkGalaxyHealthEffect, CheckGalaxyHealthError } from '../../utils/health.js'
import { toHttpError } from '../../utils/httpError'

export default defineEventHandler<{ body: AnalysisBody }>(
  async (event) => {
    const { datamap, name, parameters, workflowId } = await readBody(event)
    const program = Effect.gen(function* () {
      const supabaseUser = yield* getSupabaseUser(event)
      if (!supabaseUser?.id) {
        return yield* Effect.fail(new GetSupabaseUserError({ message: 'No user found' }))
      }

      // Check Galaxy health before proceeding
      const health = yield* checkGalaxyHealthEffect()
      if (health.status !== 'up') {
        const message = health.status === 'maintenance'
          ? `Galaxy is under maintenance: ${health.maintenance?.message}`
          : 'Galaxy is currently unavailable'
        return yield* Effect.fail(new CheckGalaxyHealthError({ message }))
      }

      // Both fail with a named cause rather than resolving with `undefined`
      // (ADR 0002), so the guard that used to stand here has nothing left to
      // decide. The workflow is resolved first, so an identifier nobody can
      // act on is refused before anything exists on Galaxy.
      const workflow = yield* getWorkflowEffect(workflowId)

      // `getWorkflowEffect` does `select()`, so `definition` — every step
      // with its type — is already in scope here, one line before the first
      // thing that gets created. #39 made the form refuse an unselected
      // input and left this side as it was, so the guard was client-side only
      // and the form was never the only client (#43). Refusing here means
      // nothing has been prepared when the refusal happens, which is the same
      // ordering argument as resolving the workflow first: a request nobody
      // can act on costs a round trip and nothing more.
      yield* requireDatamapDeclaresInputs(workflow.definition, datamap)

      const historyDb = yield* addHistoryEffect(name, supabaseUser.id)

      // Everything below has an analysis prepared to take back out if it
      // fails: a container on Galaxy and a row recording it, neither of which
      // a reader can reach until an analysis references them. The
      // compensation used to hang off a single upload instead, so a request
      // that uploaded nothing — an empty datamap is `Effect.all([])` — left
      // both behind, and so did any later failure, such as an invocation
      // Galaxy refuses for a reason this server cannot anticipate (#39).
      return yield* Effect.gen(function* () {
        const datasets = yield* uploadDatasetsEffect({
          datamap,
          galaxyHistoryId: historyDb.galaxyId,
          historyId: historyDb.id,
          ownerId: supabaseUser.id,
          event,
        })
        // load input dataset sous la forme de datamap mais comme id pg id
        const workflowInput: GalaxyWorkflowInput = {}
        const inputs = datasets.filter(data => data !== undefined)
          .reduce((acc, curr) => {
            if (curr) {
              const { step, galaxyId, insertedId } = curr
              acc[step] = {
                id: galaxyId,
                src: 'hda',
                dbid: insertedId,
              }
            }
            return acc
          }, workflowInput)
        const workflowSnapshot = {
          workflowName: workflow.name ?? null,
          galaxyWorkflowId: workflow.galaxyId ?? null,
          workflowVersion: workflow.versionKey ?? null,
        }
        return yield* runAnalysis(
          name,
          historyDb.galaxyId,
          workflow.galaxyId,
          historyDb.id,
          workflow.id,
          supabaseUser.id,
          inputs,
          parameters || {},
          datamap,
          workflowSnapshot,
        )
      }).pipe(
        Effect.onError(() => discardPreparedHistoryEffect(historyDb.galaxyId, historyDb.id)),
      )
    })
    const finalLayer = Layer.mergeAll(
      Drizzle.Live,
      ServerSupabaseClient.Live,
      ServerSupabaseClaims.Live,
      UrlFetch.Live,
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
      // `GalaxyUserNotFoundError` is deliberately unmapped: a deployment this
      // caller cannot do anything about, so it takes the logged 500
      onFailure: cause => toHttpError(event, cause, 'create analysis', {
        statuses: {
          // the two causes on this path the caller can act on: an identifier
          // that names no workflow they may run, and a datamap that cannot
          // start the one it names
          WorkflowNotFoundError: 404,
          DatamapMismatchError: 400,
          // Galaxy accepted the request and gave back nothing to run against,
          // which is Galaxy being unwell rather than this server being wrong
          CreateGalaxyHistoryError: 503,
          CheckGalaxyHealthError: 503,
        },
      }),
      onSuccess: value => value,
    })
  },

)
