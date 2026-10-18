import type { GalaxyHealth } from '../../../types/nuxt-galaxy'
import type { RequestFetch } from '../utils'
import { defineQueryOptions } from '@pinia/colada'

export const GALAXY_HEALTH_QUERY_KEYS = {
  root: ['galaxy', 'health'] as const,
}

/**
 * Handed the request's fetch like every other query, though the endpoint is
 * open and needs no session: a query that cannot reach past it stays right
 * if the endpoint's level is ever raised.
 */
export const galaxyHealthQuery = defineQueryOptions(({ requestFetch }: { requestFetch: RequestFetch }) => ({
  key: GALAXY_HEALTH_QUERY_KEYS.root,
  query: () => requestFetch<GalaxyHealth>('/api/galaxy/health'),
  refetchOnWindowFocus: true,
  staleTime: 30_000,
}))
