import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from 'nuxt-galaxy'
import { supabaseResponseToData } from '.'

export const ANALYSES_OUTPUTS_VIEW_QUERY_KEYS = {
  root: ['supabase', 'analyses_outputs_view'] as const,
  list: () => [...ANALYSES_OUTPUTS_VIEW_QUERY_KEYS.root, 'list'] as const,
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
    key: ANALYSES_OUTPUTS_VIEW_QUERY_KEYS.list(),
    query: () => supabaseAnalysesOutputsViewQuery(supabase),
  }),
)
