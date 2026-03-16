import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database'

import { defineQueryOptions } from '@pinia/colada'
import { supabaseResponseToCount } from '../utils'

export const SUPABASE_UPLOADED_DATASETS_QUERY_KEYS = {
  root: ['supabase', 'uploaded_datasets'] as const,
  list: () => [...SUPABASE_UPLOADED_DATASETS_QUERY_KEYS.root, 'list'] as const,
  count: () => [...SUPABASE_UPLOADED_DATASETS_QUERY_KEYS.root, 'count'] as const,
}

async function supabaseDatasetsCountQuery(supabase: SupabaseClient<Database>) {
  return supabase
    .schema('galaxy')
    .from('uploaded_datasets')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .then(supabaseResponseToCount)
}

export const datasetsCountQuery = defineQueryOptions(
  ({ supabase }: { supabase: SupabaseClient<Database> }) => ({
    key: SUPABASE_UPLOADED_DATASETS_QUERY_KEYS.count(),
    query: () => supabaseDatasetsCountQuery(supabase),
  }),
)
