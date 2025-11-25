import type { GalaxyWorkflowInput } from 'blendtype'
import type { AnalysisBody } from '../../../types/nuxt-galaxy.js'
import * as bt from 'blendtype'
import { Effect, Layer } from 'effect'
import { defineEventHandler, readBody } from 'h3'
import { Drizzle } from '../../utils/drizzle.js'
import { runAnalysis } from '../../utils/grizzle/analyses.js'
import { uploadDatasetsEffect } from '../../utils/grizzle/datasets'
import { addHistoryEffect } from '../../utils/grizzle/histories'
import { getSupabaseUser, GetSupabaseUserError, ServerSupabaseClaims, ServerSupabaseClient } from '../../utils/grizzle/supabase.js'
import { getWorkflowEffect } from '../../utils/grizzle/workflows'

export default defineEventHandler<{ body: AnalysisBody }>(
  async (event) => {
    const { datamap, name, parameters, workflowId } = await readBody(event)
    const program = Effect.gen(function* () {
      const supabaseUser = yield* getSupabaseUser(event)
      if (supabaseUser?.id) {
        const workflow = yield* getWorkflowEffect(workflowId)
        const historyDb = yield* addHistoryEffect(name, supabaseUser.id)
        if (historyDb && workflow) {
          const datasets = yield* uploadDatasetsEffect({
            datamap,
            galaxyHistoryId: historyDb.galaxyId,
            historyId: historyDb.id,
            ownerId: supabaseUser.id,
            event,
            file: false,
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
          )
        }
      }
      else {
        yield* Effect.fail(new GetSupabaseUserError({ message: 'No user found' }))
      }
    })
    const finalLayer = Layer.mergeAll(
      ServerSupabaseClient.Live,
      ServerSupabaseClaims.Live,
      bt.GalaxyFetch.Live,
      Drizzle.Live,
    )
    return program.pipe(
      Effect.provide(finalLayer),
      bt.runWithConfig,
    )
  },

)
