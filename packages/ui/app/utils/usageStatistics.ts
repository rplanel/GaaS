import type { AnalysisMonitoringTrendPoint, TrendGranularity } from 'nuxt-galaxy'

/** Stands in for a success rate that has no value yet. */
export const NO_SUCCESS_RATE_LABEL = '—'

/**
 * The name of the single bucket collecting analyses whose workflow could not
 * be identified, because it was deleted before its name was recorded.
 */
export const UNKNOWN_WORKFLOW_LABEL = 'Unknown workflow'

/**
 * How that bucket names itself to the endpoint, having no identifier of its
 * own. A server contract, so it is written once and read everywhere rather
 * than spelt out wherever a selection is compared.
 */
export const UNKNOWN_WORKFLOW = 'unknown'

/** Explains, on hover, why a success rate has no value yet. */
export const NO_COMPLETED_ANALYSES_EXPLANATION = 'No completed analyses yet'

export interface SuccessRateDisplay {
  /** False when no analysis has reached a definitive outcome. */
  hasValue: boolean
  /** Either a whole percentage, or a dash when there is no value. */
  label: string
  /** Set only when there is no value, to explain the dash. */
  tooltip: string | undefined
}

/**
 * Decides how a success rate reads.
 *
 * Only Succeeded and Failed count towards the rate, so until one of them has
 * occurred it has no value and is shown as a dash. Showing zero instead would
 * read as total failure to someone whose analyses are all still Pending.
 *
 * The rate itself is always the one the server computed; this never recomputes
 * it, so every surface shows the same number. Whether a rate exists at all is
 * decided here from the two terminal counts, because the endpoint's response
 * carries a plain number rather than a nullable one. Should that contract ever
 * gain a nullable rate, this condition should give way to it.
 */
export function formatSuccessRate(counts: {
  success: number
  error: number
  successRate: number
}): SuccessRateDisplay {
  if (counts.success + counts.error === 0) {
    return {
      hasValue: false,
      label: NO_SUCCESS_RATE_LABEL,
      tooltip: NO_COMPLETED_ANALYSES_EXPLANATION,
    }
  }

  return {
    hasValue: true,
    label: `${Math.round(counts.successRate * 100)}%`,
    tooltip: undefined,
  }
}

/**
 * How a row of per-workflow usage names its workflow.
 *
 * The server collapses every analysis whose workflow name never survived into
 * one bucket carrying a null id; it reaches the screen under the glossary's
 * name for it, never under the raw value the server uses.
 */
export function workflowUsageLabel(usage: {
  workflowId: number | null
  name: string | null
}): string {
  if (usage.workflowId === null || usage.name === null) {
    return UNKNOWN_WORKFLOW_LABEL
  }

  return usage.name
}

/**
 * The four outcomes, with the words and colours a reader sees. One definition
 * serves the tiles, the table columns and the trend chart, so a label or a
 * colour can never mean one thing in a tile and another in the chart.
 */
export const OUTCOME_FIELDS = [
  { key: 'success', label: 'Succeeded', icon: 'i-lucide-circle-check', fill: 'var(--ui-color-success-500)' },
  { key: 'error', label: 'Failed', icon: 'i-lucide-circle-x', fill: 'var(--ui-color-error-500)' },
  { key: 'cancelled', label: 'Cancelled', icon: 'i-lucide-ban', fill: 'var(--ui-color-neutral-400)' },
  { key: 'pending', label: 'Pending', icon: 'i-lucide-clock', fill: 'var(--ui-color-warning-500)' },
] as const satisfies ReadonlyArray<{
  key: 'success' | 'error' | 'cancelled' | 'pending'
  label: string
  icon: string
  fill: string
}>

export interface TrendSegment {
  /** The bucket this segment belongs to, as the server labelled it. */
  bucket: string
  /** The outcome, in the words a reader sees. */
  outcome: string
  count: number
  fill: string
}

/**
 * Flattens a trend into one segment per bucket per outcome, which is the shape
 * a stacked bar chart needs. Outcomes that did not occur are left out, so a
 * zero-filled bucket contributes no segment and draws no bar; it keeps its
 * place on the axis through the chart's explicit bucket domain instead.
 */
export function trendSegments(trend: readonly AnalysisMonitoringTrendPoint[]): TrendSegment[] {
  return trend.flatMap(point =>
    OUTCOME_FIELDS
      .filter(field => point[field.key] > 0)
      .map(field => ({
        bucket: point.bucket,
        outcome: field.label,
        count: point[field.key],
        fill: field.fill,
      })),
  )
}

/**
 * How wide a bucket is, in the words a reader hovering one needs.
 *
 * A month key names a month plainly and a day key names a day, but a week key
 * is a date like any other: seven days of analyses under a label that reads as
 * one. Saying so is the difference between a bar understood and a bar misread
 * by a factor of seven.
 */
export function trendBucketLabel(bucket: string, granularity: TrendGranularity): string {
  return granularity === 'week' ? `Week of ${bucket}` : bucket
}

/** What the trend's axis is counting along, which the bucket width decides. */
export const TREND_AXIS_LABELS = {
  day: 'Day (UTC)',
  week: 'Week starting (UTC)',
  month: 'Month (UTC)',
} as const satisfies Record<TrendGranularity, string>

/**
 * What a reader sees on hovering one bucket: which interval it is, how much
 * ran, how it turned out, and the rate. Only outcomes that occurred are
 * listed. A rate with no value is explained rather than shown as a bare dash,
 * which carries no meaning away from the tile that defines it.
 */
export function trendBucketSummary(
  point: AnalysisMonitoringTrendPoint,
  granularity: TrendGranularity,
): string {
  const breakdown = OUTCOME_FIELDS
    .filter(field => point[field.key] > 0)
    .map(field => `${point[field.key]} ${field.label}`)

  const rate = formatSuccessRate(point)

  return [
    `${trendBucketLabel(point.bucket, granularity)} (UTC)`,
    `${point.total} analyses`,
    ...(breakdown.length > 0 ? [breakdown.join(', ')] : []),
    `Success rate ${rate.label}${rate.tooltip ? ` (${rate.tooltip})` : ''}`,
  ].join('\n')
}
