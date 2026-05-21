import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database'

import { defineQueryOptions } from '@pinia/colada'
import { supabaseResponseToData } from '../utils'

export const SUPABASE_ANALYSES_INPUTS_VIEW_QUERY_KEYS = {
  root: ['supabase', 'analyses_inputs_view'] as const,
  list: () => [...SUPABASE_ANALYSES_INPUTS_VIEW_QUERY_KEYS.root, 'list'] as const,
  byId: (id: number) => [...SUPABASE_ANALYSES_INPUTS_VIEW_QUERY_KEYS.root, id] as const,
  byAnalysisId: (analysisId: number) => [...SUPABASE_ANALYSES_INPUTS_VIEW_QUERY_KEYS.root, 'by-analysis', analysisId] as const,
}

async function supabaseAnalysesInputsViewQuery(supabase: SupabaseClient<Database>) {
  return supabase
    .schema('galaxy')
    .from('analysis_inputs_with_storage_path')
    .select()
    .then(supabaseResponseToData)
}

export const analysesInputsViewQuery = defineQueryOptions(
  ({ supabase }: { supabase: SupabaseClient<Database> }) => ({
    key: SUPABASE_ANALYSES_INPUTS_VIEW_QUERY_KEYS.list(),
    query: () => supabaseAnalysesInputsViewQuery(supabase),
  }),
)

export async function supabaseAnalysesInputsViewByAnalysisId(supabase: SupabaseClient<Database>, analysisId: number) {
  return supabase
    .schema('galaxy')
    .from('analysis_inputs_with_storage_path')
    .select('*')
    .eq('analysis_id', analysisId)
    .then(supabaseResponseToData)
}

export const analysisInputsViewByIdQuery = defineQueryOptions(
  ({ analysisId, supabase }: { analysisId: number | undefined, supabase: SupabaseClient<Database> }) => ({
    key: SUPABASE_ANALYSES_INPUTS_VIEW_QUERY_KEYS.byAnalysisId(analysisId ?? 0),
    query: () => analysisId ? supabaseAnalysesInputsViewByAnalysisId(supabase, analysisId) : Promise.resolve([]),
    enabled: !!analysisId,
  }),
)
