import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database'

import { defineQueryOptions } from '@pinia/colada'
import { supabaseResponseToData } from '../utils'

export const SUPABASE_WORKFLOWS_QUERY_KEYS = {
  root: ['supabase', 'workflows'] as const,
  list: () => [...SUPABASE_WORKFLOWS_QUERY_KEYS.root, 'list'] as const,
  byId: (id: number) => [...SUPABASE_WORKFLOWS_QUERY_KEYS.root, id] as const,
}

async function supabaseWorkflowsQuery(supabase: SupabaseClient<Database>) {
  return supabase
    .schema('galaxy')
    .from('workflows')
    .select()
    .then(supabaseResponseToData)
}

export const workflowsListQuery = defineQueryOptions(
  ({ supabase }: { supabase: SupabaseClient<Database> }) => ({
    key: SUPABASE_WORKFLOWS_QUERY_KEYS.list(),
    query: () => supabaseWorkflowsQuery(supabase),
  }),
)

async function supabaseWorkflowByIdQuery({ id, supabase }: { id: number, supabase: SupabaseClient<Database> }) {
  return supabase
    .schema('galaxy')
    .from('workflows')
    .select('id, name, galaxy_id, definition')
    .eq('id', id)
    .limit(1)
    .single()
    .then(supabaseResponseToData)
}

export const workflowByIdQuery = defineQueryOptions(({ id, supabase }: { id: number, supabase: SupabaseClient<Database> }) => ({
  key: SUPABASE_WORKFLOWS_QUERY_KEYS.byId(id),
  query: () => supabaseWorkflowByIdQuery({ id, supabase }),
}))
