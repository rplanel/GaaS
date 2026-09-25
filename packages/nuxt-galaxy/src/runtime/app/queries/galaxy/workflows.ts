import type { GalaxyWorkflowRevision } from 'blendtype'
import type { Tables } from '../../../types/database'
import type { RevisionToolCheck, WorkflowDescription } from '../../../types/nuxt-galaxy'
import { defineQueryOptions } from '@pinia/colada'

export const GALAXY_WORKFLOWS_QUERY_KEYS = {
  root: ['galaxy', 'workflows'] as const,
  list: () => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'list'] as const,
  byId: (id: number) => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'byId', id] as const,
  revisions: (workflowId: string) => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'revisions', workflowId] as const,
  revisionTools: (workflowId: string, revision: number) => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'revisions', workflowId, 'tools', revision] as const,
  revisionDescription: (workflowId: string, revision: number) => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'revisions', workflowId, 'description', revision] as const,
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

/**
 * One revision described in one call (#87): its steps, its inputs, the
 * definitions of the tools it pins, and every tool that came back as
 * something other than itself. The key matches the endpoint's own — the
 * workflow's Galaxy id and the revision — so two screens reading the same
 * revision share one answer instead of fetching 1+N times each.
 *
 * No envelope to unwrap: the endpoint answers the description itself and
 * uses real statuses, so a refusal is an `$fetch` rejection and Colada
 * reports it as the query's error.
 *
 * `staleTime` is forever, and the contract is what makes that correct: a
 * pinned revision is immutable, and Galaxy treats a tool's version string as
 * the tool's identity. The one part of the answer that can change is
 * `unavailable` — a tool installed since, or a Galaxy that has come back —
 * and that is what the retry beside an unavailable step refetches.
 */
export const galaxyWorkflowDescriptionQuery = defineQueryOptions(({ workflowId, revision }: { workflowId: string, revision: number }) => ({
  key: GALAXY_WORKFLOWS_QUERY_KEYS.revisionDescription(workflowId, revision),
  query: () => $fetch<WorkflowDescription>(`/api/galaxy/workflows/${workflowId}/revisions/${revision}/description`),
  staleTime: Number.POSITIVE_INFINITY,
}))
