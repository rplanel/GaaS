import type { GalaxyWorkflowInput } from 'blendtype'
import type { AnalysisBody } from '../../../types/nuxt-galaxy.js'
import { GalaxyFetch, runWithConfig } from 'blendtype'
import { Effect, Layer } from 'effect'
import { defineEventHandler, readBody } from 'h3'
import { Drizzle } from '../../utils/drizzle.js'
import { runAnalysis } from '../../utils/grizzle/analyses.js'
import { uploadDatasetsEffect } from '../../utils/grizzle/datasets'
import { addHistoryEffect } from '../../utils/grizzle/histories'
import { GetSupabaseUserError, ServerSupabaseClient, ServerSupabaseUser } from '../../utils/grizzle/supabase.js'
import { getWorkflowEffect } from '../../utils/grizzle/workflows'

export default defineEventHandler<{ body: AnalysisBody }>(
  async (event) => {
    const { datamap, name, parameters, workflowId } = await readBody(event)
    const program = Effect.gen(function* () {
      const createServerSupabaseUser = yield* ServerSupabaseUser
      const supabaseUser = yield* createServerSupabaseUser(event)
      if (supabaseUser) {
        const workflow = yield* getWorkflowEffect(workflowId)
        const historyDb = yield* addHistoryEffect(name, supabaseUser.id)
        if (historyDb && workflow) {
          const datasets = yield* uploadDatasetsEffect(
            datamap,
            historyDb.galaxyId,
            historyDb.id,
            supabaseUser.id,
            event,
          )
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
      ServerSupabaseUser.Live,
      GalaxyFetch.Live,
      Drizzle.Live,
    )
    return program.pipe(
      Effect.provide(finalLayer),
      runWithConfig,
    )
  },

)
