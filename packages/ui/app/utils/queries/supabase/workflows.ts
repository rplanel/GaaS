import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from 'nuxt-galaxy'

import { supabaseResponseToData } from '.'

export const WORKFLOWS_QUERY_KEYS = {
  root: ['supabase', 'workflows'] as const,
  list: () => [...WORKFLOWS_QUERY_KEYS.root, 'list'] as const,
  byId: (id: number) => [...WORKFLOWS_QUERY_KEYS.root, id] as const,
}

// simple workflows list query without any relationships
async function supabaseWorkflowsQuery(supabase: SupabaseClient<Database>) {
  return supabase
    .schema('galaxy')
    .from('workflows')
    .select()
    .then(supabaseResponseToData)
}
export const workflowsListQuery = defineQueryOptions(
  ({ supabase }: { supabase: SupabaseClient<Database> }) => ({
    key: WORKFLOWS_QUERY_KEYS.list(),
    query: () => supabaseWorkflowsQuery(supabase),
  }),
)

// workflow by id
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
  key: WORKFLOWS_QUERY_KEYS.byId(id),
  query: () => supabaseWorkflowByIdQuery({ id, supabase }),
}))
