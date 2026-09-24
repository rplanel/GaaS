import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database'

import { defineQueryOptions } from '@pinia/colada'
import { supabaseResponseToData } from '../utils'

export const SUPABASE_WORKFLOWS_QUERY_KEYS = {
  root: ['supabase', 'workflows'] as const,
  list: () => [...SUPABASE_WORKFLOWS_QUERY_KEYS.root, 'list'] as const,
  adminList: () => [...SUPABASE_WORKFLOWS_QUERY_KEYS.root, 'admin', 'list'] as const,
  byId: (id: number) => [...SUPABASE_WORKFLOWS_QUERY_KEYS.root, id] as const,
}

/**
 * The versions users may start an analysis on: the active ones (ADR 0004).
 * Retiring hides a version here, in the list, and never in a select policy,
 * because a past analysis still has to resolve its version and its results
 * view. The workflows page and the sidebar read this.
 */
async function supabaseWorkflowsQuery(supabase: SupabaseClient<Database>) {
  return supabase
    .schema('galaxy')
    .from('workflows')
    .select()
    .eq('active', true)
    .then(supabaseResponseToData)
}

export const workflowsListQuery = defineQueryOptions(
  ({ supabase }: { supabase: SupabaseClient<Database> }) => ({
    key: SUPABASE_WORKFLOWS_QUERY_KEYS.list(),
    query: () => supabaseWorkflowsQuery(supabase),
  }),
)

/**
 * Every version, retired ones included: what the admin workflows page lists,
 * since retiring and making active again are decided there. Keyed apart from
 * the users' list so that neither cache answers for the other.
 */
async function supabaseAdminWorkflowsQuery(supabase: SupabaseClient<Database>) {
  return supabase
    .schema('galaxy')
    .from('workflows')
    .select()
    .then(supabaseResponseToData)
}

export const adminWorkflowsListQuery = defineQueryOptions(
  ({ supabase }: { supabase: SupabaseClient<Database> }) => ({
    key: SUPABASE_WORKFLOWS_QUERY_KEYS.adminList(),
    query: () => supabaseAdminWorkflowsQuery(supabase),
  }),
)

async function supabaseWorkflowByIdQuery({ id, supabase }: { id: number, supabase: SupabaseClient<Database> }) {
  return supabase
    .schema('galaxy')
    .from('workflows')
    // `revision` is the Galaxy revision the row is pinned to, which the form
    // asks Galaxy to describe and the server starts (#48)
    .select('id, name, galaxy_id, revision, definition')
    .eq('id', id)
    .limit(1)
    .single()
    .then(supabaseResponseToData)
}

export const workflowByIdQuery = defineQueryOptions(({ id, supabase }: { id: number, supabase: SupabaseClient<Database> }) => ({
  key: SUPABASE_WORKFLOWS_QUERY_KEYS.byId(id),
  query: () => supabaseWorkflowByIdQuery({ id, supabase }),
}))
