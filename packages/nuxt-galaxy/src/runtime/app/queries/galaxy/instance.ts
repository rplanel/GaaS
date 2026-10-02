import type { GalaxyInstanceDetails } from '../../../types/nuxt-galaxy'
import { defineQueryOptions } from '@pinia/colada'

export const GALAXY_INSTANCE_QUERY_KEYS = {
  root: ['galaxy', 'instance'] as const,
}

/**
 * The Galaxy this application talks to, and the release it runs.
 *
 * The invoke form reads the release because what Galaxy refuses at invoke
 * depends on it (#105). Left to Colada's default freshness: a release only
 * moves when the instance is upgraded, but a form left open across an
 * upgrade should not go on judging by the old one.
 */
export const galaxyInstanceQuery = defineQueryOptions(() => ({
  key: GALAXY_INSTANCE_QUERY_KEYS.root,
  query: () => $fetch<GalaxyInstanceDetails>('/api/galaxy/instance'),
}))
