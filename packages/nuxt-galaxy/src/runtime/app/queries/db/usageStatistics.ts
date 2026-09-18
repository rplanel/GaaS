import type { AnalysisMonitoringStats, TrendGranularity } from '../../../types/nuxt-galaxy'
import { defineQueryOptions } from '@pinia/colada'
import { TREND_GRANULARITY_WHEN_ABSENT } from '../../../types/nuxt-galaxy'

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
 * What a usage view asks its endpoint for: which analyses to cover, and how
 * wide to make the trend's buckets. The two are separate because they answer
 * separate questions — the range decides which analyses are counted, the
 * granularity only how the trend groups them.
 */
export interface UsageStatisticsRequest {
  readonly range?: UsageStatisticsRange | undefined
  readonly granularity?: TrendGranularity | undefined
}

/**
 * Each range and bucket width caches on its own, so switching back to a view
 * already looked at shows its numbers at once instead of fetching them again.
 */
export const USAGE_STATISTICS_QUERY_KEYS = {
  root: ['usage-statistics'] as const,
  own: ({ range = {}, granularity = TREND_GRANULARITY_WHEN_ABSENT }: UsageStatisticsRequest = {}) =>
    [...USAGE_STATISTICS_QUERY_KEYS.root, 'own', range.from ?? 'all', range.to ?? 'all', granularity] as const,
  global: ({ range = {}, granularity = TREND_GRANULARITY_WHEN_ABSENT }: UsageStatisticsRequest = {}) =>
    [...USAGE_STATISTICS_QUERY_KEYS.root, 'global', range.from ?? 'all', range.to ?? 'all', granularity] as const,
}

/**
 * Only the bounds that are set, so all time sends no parameters at all. The
 * granularity is always sent, because a view that has worked out which bucket
 * width it is drawing should say so rather than rely on the endpoint's default
 * happening to agree.
 */
function requestParameters({ range = {}, granularity = TREND_GRANULARITY_WHEN_ABSENT }: UsageStatisticsRequest): Record<string, string> {
  const parameters: Record<string, string> = { granularity }
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
export const ownUsageStatisticsQuery = defineQueryOptions((request: UsageStatisticsRequest = {}) => ({
  key: USAGE_STATISTICS_QUERY_KEYS.own(request),
  query: () => $fetch<AnalysisMonitoringStats>('/api/db/analyses/monitoring', { query: requestParameters(request) }),
}))

/**
 * Usage statistics over every user's analyses, in aggregate.
 *
 * Same shape as the own statistics, so the same component renders both. Its
 * own key, because the two cover different analyses and must never share a
 * cache entry. The endpoint answers 403 to anyone who is not an administrator.
 */
export const globalUsageStatisticsQuery = defineQueryOptions((request: UsageStatisticsRequest = {}) => ({
  key: USAGE_STATISTICS_QUERY_KEYS.global(request),
  query: () => $fetch<AnalysisMonitoringStats>('/api/db/analyses/monitoring/admin', { query: requestParameters(request) }),
}))
