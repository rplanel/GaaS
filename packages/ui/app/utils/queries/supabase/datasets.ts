import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from 'nuxt-galaxy'
import { supabaseCountResponseToCount } from '.'

export const SUPABASE_DATASETS_QUERY_KEYS = {
  root: ['supabase', 'datasets'] as const,
  list: () => [...SUPABASE_DATASETS_QUERY_KEYS.root, 'list'] as const,
  count: () => [...SUPABASE_DATASETS_QUERY_KEYS.root, 'count'] as const,
}

// datasets count query
async function supabaseDatasetsCountQuery(supabase: SupabaseClient<Database>) {
  return supabase
    .schema('galaxy')
    .from('uploaded_datasets')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .then(supabaseCountResponseToCount)
}

export const datasetsCountQuery = defineQueryOptions(
  ({ supabase }: { supabase: SupabaseClient<Database> }) => ({
    key: SUPABASE_DATASETS_QUERY_KEYS.count(),
    query: () => supabaseDatasetsCountQuery(supabase),

  }),
)
