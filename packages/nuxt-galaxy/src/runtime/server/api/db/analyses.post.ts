import type { GalaxyWorkflowInput } from 'blendtype'
import type { AnalysisBody } from '../../../types/nuxt-galaxy.js'
import type { Database } from '~/src/runtime/types/database.js'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { defineEventHandler, readBody } from 'h3'
import { runAnalysis } from '../../utils/grizzle/analyses.js'
import { uploadDatasets } from '../../utils/grizzle/datasets'
import { addHistory } from '../../utils/grizzle/histories'
import { getWorkflow } from '../../utils/grizzle/workflows'

export default defineEventHandler<{ body: AnalysisBody }>(
  async (event) => {
    const supabase = await serverSupabaseClient<Database>(event)
    const supabaseUser = await serverSupabaseUser(event)

    const { datamap, name, parameters, workflowId } = await readBody(event)
    const workflow = await getWorkflow(workflowId)
    // create galaxy history
    const historyDb = await addHistory(name, supabaseUser.id)

    if (historyDb && workflow) {
      // upload all the datasets
      const datasets = await uploadDatasets(
        datamap,
        historyDb.galaxyId,
        historyDb.id,
        supabaseUser.id,
        supabase,
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
        // create the analysis.
      return runAnalysis(
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
  },
)
