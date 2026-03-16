import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database'

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
