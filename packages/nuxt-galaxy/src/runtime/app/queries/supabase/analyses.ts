import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database'
import type { ResultsViewAnalysis } from '../../../types/nuxt-galaxy'

import { createError } from '#app'
import { defineQueryOptions } from '@pinia/colada'
import { supabaseResponseToData } from '../utils'

export const SUPABASE_ANALYSES_QUERY_KEYS = {
  root: ['supabase', 'analyses'] as const,
  list: () => [...SUPABASE_ANALYSES_QUERY_KEYS.root, 'list'] as const,
  count: () => [...SUPABASE_ANALYSES_QUERY_KEYS.root, 'count'] as const,
  withWorkflowAndHistory: (withHistory?: boolean, withWorkflow?: boolean) => [...SUPABASE_ANALYSES_QUERY_KEYS.list(), { withWorkflow, withHistory }] as const,
  byId: (id: number) => [...SUPABASE_ANALYSES_QUERY_KEYS.root, id] as const,
  byIdWithJobs: (id: number, withJobs?: boolean) => [...SUPABASE_ANALYSES_QUERY_KEYS.byId(id), { withJobs }] as const,
  byIdWithOutputsAndWorkflows: (id: number, withOutputs?: boolean, withWorkflows?: boolean) => [...SUPABASE_ANALYSES_QUERY_KEYS.byId(id), { withOutputs, withWorkflows }] as const,
  byIdWithDetails: (id: number) => [...SUPABASE_ANALYSES_QUERY_KEYS.byId(id), 'details'] as const,
  byIdForResultsView: (id: number) => [...SUPABASE_ANALYSES_QUERY_KEYS.byId(id), 'results-view'] as const,
}

async function supabaseAnalysesQuery(supabase: SupabaseClient<Database>) {
  return supabase
    .schema('galaxy')
    .from('analyses')
    .select('id, name')
    .then(supabaseResponseToData)
}

export const analysesListQuery = defineQueryOptions(
  ({ supabase }: { supabase: SupabaseClient<Database> }) => ({
    key: SUPABASE_ANALYSES_QUERY_KEYS.list(),
    query: () => supabaseAnalysesQuery(supabase),
  }),
)

async function supabaseAnalysesWithWorkflowAndHistoryQuery(supabase: SupabaseClient<Database>) {
  return supabase
    .schema('galaxy')
    .from('analyses')
    .select(`
        id,
        name,
        state,
        workflows(*),
        histories(state, is_sync)
        `)
    .order('id', { ascending: true })
    .then(supabaseResponseToData)
}

export const analysesListWithWorkflowAndHistoryQuery = defineQueryOptions(
  ({ supabase }: { supabase: SupabaseClient<Database> }) => ({
    key: SUPABASE_ANALYSES_QUERY_KEYS.withWorkflowAndHistory(true, true),
    query: () => supabaseAnalysesWithWorkflowAndHistoryQuery(supabase),
  }),
)

async function supabaseAnalysisByIdWithJobsQuery(supabase: SupabaseClient<Database>, id: number) {
  return supabase
    .schema('galaxy')
    .from('analyses')
    .select(`*, jobs(*)`)
    .eq('id', id)
    .limit(1)
    .single()
    .then(supabaseResponseToData)
}

export const analysisByIdWithJobsQuery = defineQueryOptions(
  ({ id, supabase }: { id: number, supabase: SupabaseClient<Database> }) => ({
    key: SUPABASE_ANALYSES_QUERY_KEYS.byIdWithJobs(id, true),
    query: () => supabaseAnalysisByIdWithJobsQuery(supabase, id),
  }),
)

async function supabaseAnalysisByIdWithOutputsAndWorkflowsQuery(id: number, supabase: SupabaseClient<Database>) {
  return supabase
    .schema('galaxy')
    .from('analyses')
    .select(`
     *,
          analysis_outputs(
            *,
            datasets(*),
            tags(*)
          ),
          workflows(
            *
          )
    `)
    .eq('id', id)
    .limit(1)
    .single()
    .then(supabaseResponseToData)
}

export const analysisByIdWithOutputsAndWorkflowsQuery = defineQueryOptions(
  ({ id, supabase }: { id: number | undefined, supabase: SupabaseClient<Database> }) => {
    if (id === undefined) {
      throw createError({
        statusCode: 400,
        message: 'Analysis ID is required',
      })
    }
    return {
      key: SUPABASE_ANALYSES_QUERY_KEYS.byIdWithOutputsAndWorkflows(id, true, true),
      query: () => supabaseAnalysisByIdWithOutputsAndWorkflowsQuery(id, supabase),
    }
  },
)

/**
 * The one analysis a results view is opened on, with its workflow and every
 * input and output carrying its dataset and its tags (ADR 0003).
 *
 * The two sides are stored differently: an output's tags are linked to the
 * output itself, while an input has no tag link of its own and its tags hang
 * off the dataset. PostgREST can only embed what a foreign key reaches, so
 * the inputs come back as `datasets(*, tags(*))` and are reshaped here to the
 * `datasets` beside `tags` the outputs already have. A view author then reads
 * both sides the same way and never learns about the junction tables.
 */
export async function supabaseAnalysisByIdForResultsViewQuery(supabase: SupabaseClient<Database>, id: number): Promise<ResultsViewAnalysis> {
  const analysis = await supabase
    .schema('galaxy')
    .from('analyses')
    .select(`
      *,
      workflows(*),
      analysis_inputs(
        *,
        datasets(
          *,
          tags(*)
        )
      ),
      analysis_outputs(
        *,
        datasets(*),
        tags(*)
      )
    `)
    .eq('id', id)
    .limit(1)
    .single()
    .then(supabaseResponseToData)

  return {
    ...analysis,
    analysis_inputs: analysis.analysis_inputs.map(({ datasets: { tags, ...datasets }, ...input }) => ({
      ...input,
      datasets,
      tags,
    })),
  }
}

/**
 * Dedicated to the results page, so handing a view more of the analysis never
 * widens `analysisByIdWithOutputsAndWorkflowsQuery`, which the analysis panel
 * shares and refetches on every realtime update.
 */
export const analysisByIdForResultsViewQuery = defineQueryOptions(
  ({ id, supabase }: { id: number, supabase: SupabaseClient<Database> }) => ({
    key: SUPABASE_ANALYSES_QUERY_KEYS.byIdForResultsView(id),
    query: () => supabaseAnalysisByIdForResultsViewQuery(supabase, id),
  }),
)

async function supabaseAnalysisByIdWithDetailsQuery(supabase: SupabaseClient<Database>, id: number) {
  return supabase
    .schema('galaxy')
    .from('analyses')
    .select(`
      *,
      histories(*),
      jobs(*),
      workflows(*)
    `)
    .eq('id', id)
    .limit(1)
    .single()
    .then(supabaseResponseToData)
}

export const analysisByIdWithDetailsQuery = defineQueryOptions(
  ({ id, supabase }: { id: number | undefined, supabase: SupabaseClient<Database> }) => {
    if (id === undefined) {
      throw createError({
        statusCode: 400,
        message: 'Analysis ID is required',
      })
    }
    return {
      key: SUPABASE_ANALYSES_QUERY_KEYS.byIdWithDetails(id),
      query: () => supabaseAnalysisByIdWithDetailsQuery(supabase, id),
    }
  },
)
