import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database'

import { defineQueryOptions } from '@pinia/colada'
import { supabaseResponseToData } from '../utils'

export const SUPABASE_ANALYSES_OUTPUTS_VIEW_QUERY_KEYS = {
  root: ['supabase', 'analyses_outputs_view'] as const,
  list: () => [...SUPABASE_ANALYSES_OUTPUTS_VIEW_QUERY_KEYS.root, 'list'] as const,
}

async function supabaseAnalysesOutputsViewQuery(supabase: SupabaseClient<Database>) {
  return supabase
    .schema('galaxy')
    .from('uploaded_datasets_with_storage_path')
    .select()
    .then(supabaseResponseToData)
}

export const analysesOutputsViewQuery = defineQueryOptions(
  ({ supabase }: { supabase: SupabaseClient<Database> }) => ({
    key: SUPABASE_ANALYSES_OUTPUTS_VIEW_QUERY_KEYS.list(),
    query: () => supabaseAnalysesOutputsViewQuery(supabase),
  }),
)
