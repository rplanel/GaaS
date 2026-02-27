export const GALAXY_WORKFLOWS_QUERY_KEYS = {
  root: ['galaxy', 'workflows'] as const,
  list: () => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'list'] as const,
  byId: (id: number) => [...GALAXY_WORKFLOWS_QUERY_KEYS.root, 'byId', id] as const,
}

export const workflowsListQuery = defineQueryOptions(() => ({
  key: GALAXY_WORKFLOWS_QUERY_KEYS.list(),
  query: () => $fetch('/api/galaxy/workflows'),
}))
