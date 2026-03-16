import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database'

import { defineQueryOptions } from '@pinia/colada'
import { supabaseResponseToData } from '../utils'

export const SUPABASE_INSTANCES_QUERY_KEYS = {
  root: ['supabase', 'instances'] as const,
  byUrl: (instanceUrl: string) => [...SUPABASE_INSTANCES_QUERY_KEYS.root, instanceUrl] as const,
}

async function supabaseInstancesQuery({ instanceUrl, supabase }: { instanceUrl: string, supabase: SupabaseClient<Database> }) {
  return supabase
    .schema('galaxy')
    .from('instances')
    .select()
    .eq('url', instanceUrl)
    .limit(1)
    .then(supabaseResponseToData)
}

export const instanceByUrlQuery = defineQueryOptions(
  ({ instanceUrl, supabase }: { instanceUrl: string, supabase: SupabaseClient<Database> }) => ({
    key: SUPABASE_INSTANCES_QUERY_KEYS.byUrl(instanceUrl),
    query: () => supabaseInstancesQuery({ instanceUrl, supabase }),
  }),
)
