import type { AnalysisMonitoringStats } from '../../../types/nuxt-galaxy'
import { defineQueryOptions } from '@pinia/colada'

export const USAGE_STATISTICS_QUERY_KEYS = {
  root: ['usage-statistics'] as const,
  own: () => [...USAGE_STATISTICS_QUERY_KEYS.root, 'own'] as const,
}

/**
 * Usage statistics over the analyses the signed-in user owns.
 *
 * Every number comes from the server, including the success rate, so that one
 * formula is the only one in play.
 */
export const ownUsageStatisticsQuery = defineQueryOptions(() => ({
  key: USAGE_STATISTICS_QUERY_KEYS.own(),
  query: () => $fetch<AnalysisMonitoringStats>('/api/db/analyses/monitoring'),
}))
