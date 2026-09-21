import type { GalaxyWorkflowInput } from 'blendtype'
import type { AnalysisBody } from '../../../types/nuxt-galaxy.js'
import { toGalaxyServiceUnavailable } from 'blendtype'
import { Cause, Effect, Either, Layer } from 'effect'
import { useLogger } from 'evlog'
import { createError, defineEventHandler, readBody } from 'h3'
import { Drizzle } from '../../utils/drizzle.js'
import { runGalaxyEffect } from '../../utils/evlog-effect'
import { UrlFetch } from '../../utils/fetch'
import { useGalaxyLayer } from '../../utils/galaxy.js'
import { runAnalysis } from '../../utils/grizzle/analyses.js'
import { uploadDatasetsEffect } from '../../utils/grizzle/datasets'
import { addHistoryEffect } from '../../utils/grizzle/histories'
import { getSupabaseUser, GetSupabaseUserError, ServerSupabaseClaims, ServerSupabaseClient } from '../../utils/grizzle/supabase.js'
import { getWorkflowEffect } from '../../utils/grizzle/workflows'
import { checkGalaxyHealthEffect, CheckGalaxyHealthError } from '../../utils/health.js'

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
      const historyDb = yield* addHistoryEffect(name, supabaseUser.id)

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
        Effect.either,
      ),
    )

    return Either.match(result, {
      onLeft: (error) => {
        if (error._tag === 'GetSupabaseUserError') {
          throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
        }
        // the only cause on this path the caller can act on: an identifier
        // that names no workflow they may run
        if (error._tag === 'WorkflowNotFoundError') {
          throw createError({ statusCode: 404, statusMessage: error.message })
        }
        // Galaxy accepted the request and gave back nothing to run against,
        // which is Galaxy being unwell rather than this server being wrong
        if (error._tag === 'CreateGalaxyHistoryError') {
          throw createError({ statusCode: 503, statusMessage: error.message })
        }
        if (error._tag === 'CheckGalaxyHealthError') {
          throw createError({ statusCode: 503, statusMessage: error.message })
        }
        if (error._tag === 'GalaxyServiceUnavailable') {
          throw createError({ statusCode: 503, statusMessage: error.message })
        }
        // everything else, `GalaxyUserNotFoundError` included: a deployment
        // this caller cannot do anything about, so the reason goes to the log
        // and not to them
        const log = useLogger(event)
        log.error('create analysis handler failed', { cause: Cause.pretty(Cause.fail(error)) })
        throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
      },
      onRight: value => value,
    })
  },

)
