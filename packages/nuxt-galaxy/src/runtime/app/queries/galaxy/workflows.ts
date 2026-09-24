import type { GalaxyWorkflowRevision } from 'blendtype'
import type { Tables } from '../../../types/database'
import type { RevisionToolCheck } from '../../../types/nuxt-galaxy'
import { defineQueryOptions } from '@pinia/colada'

export const GALAXY_WORKFLOWS_QUERY_KEYS = {
  root: ['galaxy', 'workflows'] as const,
  list: () => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'list'] as const,
  byId: (id: number) => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'byId', id] as const,
  revisions: (workflowId: string) => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'revisions', workflowId] as const,
  revisionTools: (workflowId: string, revision: number) => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'revisions', workflowId, 'tools', revision] as const,
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

/**
 * The tool check of one revision (ADR 0004, #75): which of the tools it pins
 * Galaxy does not hold at their pinned version, and how many were checked.
 * The publish dialog runs it for the revision it has selected, since Galaxy
 * would refuse to run the version and the server refuses to publish it; the
 * same envelope as the revisions proxy, read the same way.
 */
export const galaxyRevisionToolsQuery = defineQueryOptions(({ workflowId, revision }: { workflowId: string, revision: number }) => ({
  key: GALAXY_WORKFLOWS_QUERY_KEYS.revisionTools(workflowId, revision),
  query: async () => {
    const { data, error } = await $fetch<{ data: RevisionToolCheck | undefined, error: { message: string } | undefined }>(`/api/galaxy/workflows/${workflowId}/revisions/${revision}/tools`)
    if (error || data === undefined) {
      throw new Error(error?.message ?? 'Galaxy did not answer the tool check')
    }
    return data
  },
}))
