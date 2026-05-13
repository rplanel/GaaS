import type { GalaxyHealth } from '../../../types/nuxt-galaxy'
import { defineQueryOptions } from '@pinia/colada'

export const GALAXY_HEALTH_QUERY_KEYS = {
  root: ['galaxy', 'health'] as const,
}

export const galaxyHealthQuery = defineQueryOptions(() => ({
  key: GALAXY_HEALTH_QUERY_KEYS.root,
  query: () => $fetch<GalaxyHealth>('/api/galaxy/health'),
  refetchOnWindowFocus: true,
  staleTime: 30_000,
}))
