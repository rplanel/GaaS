import type { GalaxyWorkflowRevision } from 'blendtype'
import type { Tables } from '../../../types/database'
import { defineQueryOptions } from '@pinia/colada'

export const GALAXY_WORKFLOWS_QUERY_KEYS = {
  root: ['galaxy', 'workflows'] as const,
  list: () => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'list'] as const,
  byId: (id: number) => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'byId', id] as const,
  revisions: (workflowId: string) => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'revisions', workflowId] as const,
}

export const galaxyWorkflowsListQuery = defineQueryOptions(() => ({
  key: GALAXY_WORKFLOWS_QUERY_KEYS.list(),
  query: () => $fetch<Tables<'workflows'>[]>('/api/galaxy/workflows'),
}))

/**
 * The revisions of a stored workflow as Galaxy indexes them (ADR 0004, #73),
 * for the publish dialog to choose one from. The proxy answers the by-id
 * proxy's envelope, so the data is read out of it here and an error it
 * carries is thrown, which is what `useQuery` reports as the query's error.
 */
export const galaxyWorkflowRevisionsQuery = defineQueryOptions(({ workflowId }: { workflowId: string }) => ({
  key: GALAXY_WORKFLOWS_QUERY_KEYS.revisions(workflowId),
  query: async () => {
    const { data, error } = await $fetch<{ data: GalaxyWorkflowRevision[] | undefined, error: { message: string } | undefined }>(`/api/galaxy/workflows/${workflowId}/versions`)
    if (error || data === undefined) {
      throw new Error(error?.message ?? 'Galaxy listed no revisions')
    }
    return data
  },
}))
