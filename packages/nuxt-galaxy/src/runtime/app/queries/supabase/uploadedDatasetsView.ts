import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database'

import { defineQueryOptions } from '@pinia/colada'
import { supabaseResponseToData } from '../utils'

export const SUPABASE_UPLOADED_DATASETS_VIEW_QUERY_KEYS = {
  root: ['supabase', 'uploaded_datasets_view'] as const,
  list: () => [...SUPABASE_UPLOADED_DATASETS_VIEW_QUERY_KEYS.root, 'list'] as const,
}

async function supabaseUploadedDatasetsViewQuery(supabase: SupabaseClient<Database>) {
  return supabase
    .schema('galaxy')
    .from('uploaded_datasets_with_storage_path')
    .select()
    .then(supabaseResponseToData)
}

export const uploadedDatasetsViewQuery = defineQueryOptions(
  ({ supabase }: { supabase: SupabaseClient<Database> }) => ({
    key: SUPABASE_UPLOADED_DATASETS_VIEW_QUERY_KEYS.list(),
    query: () => supabaseUploadedDatasetsViewQuery(supabase),
  }),
)
