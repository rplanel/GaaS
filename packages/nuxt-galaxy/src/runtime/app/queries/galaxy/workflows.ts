import type { GalaxyWorkflowRevision } from 'blendtype'
import type { Tables } from '../../../types/database'
import type { RevisionToolCheck, WorkflowDescription } from '../../../types/nuxt-galaxy'
import type { RequestFetch } from '../utils'
import { defineQueryOptions } from '@pinia/colada'

export const GALAXY_WORKFLOWS_QUERY_KEYS = {
  root: ['galaxy', 'workflows'] as const,
  list: () => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'list'] as const,
  byId: (id: number) => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'byId', id] as const,
  revisions: (workflowId: string) => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'revisions', workflowId] as const,
  revisionTools: (workflowId: string, revision: number) => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'revisions', workflowId, 'tools', revision] as const,
  /**
   * Deliberately not under `revisions`. Colada matches a key by prefix, so
   * nesting it there would let an `invalidateQueries` of the revisions
   * list* — which the publish dialog refreshes — refetch the full
   * description for every open screen, undoing the caching this exists for.
   */
  revisionDescription: (workflowId: string, revision: number) => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'descriptions', workflowId, revision] as const,
}

export const galaxyWorkflowsListQuery = defineQueryOptions(({ requestFetch }: { requestFetch: RequestFetch }) => ({
  key: GALAXY_WORKFLOWS_QUERY_KEYS.list(),
  query: () => requestFetch<Tables<'workflows'>[]>('/api/galaxy/workflows'),
}))

/**
 * The revisions of a stored workflow as Galaxy indexes them (ADR 0004, #73),
 * for the publish dialog to choose one from.
 *
 * No envelope to unwrap (#125): the endpoint answers the list itself and
 * uses real statuses, so a refusal rejects the fetch and Colada reports it
 * as the query's error.
 */
export const galaxyWorkflowRevisionsQuery = defineQueryOptions(({ workflowId, requestFetch }: { workflowId: string, requestFetch: RequestFetch }) => ({
  key: GALAXY_WORKFLOWS_QUERY_KEYS.revisions(workflowId),
  query: () => requestFetch<GalaxyWorkflowRevision[]>(`/api/galaxy/workflows/${workflowId}/versions`),
}))

/**
 * The tool check of one revision (ADR 0004, #75): which of the tools it pins
 * Galaxy does not hold at their pinned version, and how many were checked.
 * The publish dialog runs it for the revision it has selected, since Galaxy
 * would refuse to run the version and the server refuses to publish it.
 * Answered and refused the same way as the revisions list.
 */
export const galaxyRevisionToolsQuery = defineQueryOptions(({ workflowId, revision, requestFetch }: { workflowId: string, revision: number, requestFetch: RequestFetch }) => ({
  key: GALAXY_WORKFLOWS_QUERY_KEYS.revisionTools(workflowId, revision),
  query: () => requestFetch<RevisionToolCheck>(`/api/galaxy/workflows/${workflowId}/revisions/${revision}/tools`),
}))

/**
 * One revision described in one call (#87): its steps, its inputs, the
 * definitions of the tools it pins, and every tool that came back as
 * something other than itself. The key matches the endpoint's own — the
 * workflow's Galaxy id and the revision — so two screens reading the same
 * revision share one answer instead of fetching 1+N times each.
 *
 * No envelope to unwrap: the endpoint answers the description itself and
 * uses real statuses, so a refusal rejects the fetch and Colada reports it
 * as the query's error.
 *
 * `staleTime` is forever, and the contract is what makes that correct: a
 * pinned revision is immutable, and Galaxy treats a tool's version string as
 * the tool's identity. The one part of the answer that can change is
 * `unavailable` — a tool installed since, or a Galaxy that has come back —
 * and that is what the retry beside an unavailable step refetches.
 */
export const galaxyWorkflowDescriptionQuery = defineQueryOptions(({ workflowId, revision, requestFetch }: { workflowId: string, revision: number, requestFetch: RequestFetch }) => ({
  key: GALAXY_WORKFLOWS_QUERY_KEYS.revisionDescription(workflowId, revision),
  query: () => requestFetch<WorkflowDescription>(`/api/galaxy/workflows/${workflowId}/revisions/${revision}/description`),
  staleTime: Number.POSITIVE_INFINITY,
}))
