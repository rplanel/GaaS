import type { AnalysisMonitoringStats } from '../../../types/nuxt-galaxy'
import { defineQueryOptions } from '@pinia/colada'

export const USAGE_STATISTICS_QUERY_KEYS = {
  root: ['usage-statistics'] as const,
  own: () => [...USAGE_STATISTICS_QUERY_KEYS.root, 'own'] as const,
  global: () => [...USAGE_STATISTICS_QUERY_KEYS.root, 'global'] as const,
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

/**
 * Usage statistics over every user's analyses, in aggregate.
 *
 * Same shape as the own statistics, so the same component renders both. Its
 * own key, because the two cover different analyses and must never share a
 * cache entry. The endpoint answers 403 to anyone who is not an administrator.
 */
export const globalUsageStatisticsQuery = defineQueryOptions(() => ({
  key: USAGE_STATISTICS_QUERY_KEYS.global(),
  query: () => $fetch<AnalysisMonitoringStats>('/api/db/analyses/monitoring/admin'),
}))
