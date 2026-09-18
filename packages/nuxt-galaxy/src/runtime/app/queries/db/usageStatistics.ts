import type { AnalysisMonitoringStats } from '../../../types/nuxt-galaxy'
import { defineQueryOptions } from '@pinia/colada'

/**
 * The range a usage view asks for, in the form the URL and the endpoint both
 * carry: UTC calendar days. Both ends absent means all time, which is what the
 * endpoints answer when they are sent nothing.
 */
export interface UsageStatisticsRange {
  readonly from?: string | undefined
  readonly to?: string | undefined
}

/**
 * Each range caches on its own, so switching back to a range already looked at
 * shows its numbers at once instead of fetching them again.
 */
export const USAGE_STATISTICS_QUERY_KEYS = {
  root: ['usage-statistics'] as const,
  own: (range: UsageStatisticsRange = {}) =>
    [...USAGE_STATISTICS_QUERY_KEYS.root, 'own', range.from ?? 'all', range.to ?? 'all'] as const,
  global: (range: UsageStatisticsRange = {}) =>
    [...USAGE_STATISTICS_QUERY_KEYS.root, 'global', range.from ?? 'all', range.to ?? 'all'] as const,
}

/** Only the bounds that are set, so all time sends no parameters at all. */
function rangeParameters(range: UsageStatisticsRange): Record<string, string> {
  const parameters: Record<string, string> = {}
  if (range.from) {
    parameters.from = range.from
  }
  if (range.to) {
    parameters.to = range.to
  }
  return parameters
}

/**
 * Usage statistics over the analyses the signed-in user owns.
 *
 * Every number comes from the server, including the success rate, so that one
 * formula is the only one in play.
 */
export const ownUsageStatisticsQuery = defineQueryOptions((range: UsageStatisticsRange = {}) => ({
  key: USAGE_STATISTICS_QUERY_KEYS.own(range),
  query: () => $fetch<AnalysisMonitoringStats>('/api/db/analyses/monitoring', { query: rangeParameters(range) }),
}))

/**
 * Usage statistics over every user's analyses, in aggregate.
 *
 * Same shape as the own statistics, so the same component renders both. Its
 * own key, because the two cover different analyses and must never share a
 * cache entry. The endpoint answers 403 to anyone who is not an administrator.
 */
export const globalUsageStatisticsQuery = defineQueryOptions((range: UsageStatisticsRange = {}) => ({
  key: USAGE_STATISTICS_QUERY_KEYS.global(range),
  query: () => $fetch<AnalysisMonitoringStats>('/api/db/analyses/monitoring/admin', { query: rangeParameters(range) }),
}))
