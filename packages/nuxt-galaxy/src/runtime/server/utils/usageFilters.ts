import type { H3Event } from 'h3'
import type { TrendGranularity, WorkflowSelection } from '../../types/nuxt-galaxy'
import type { UsageFilters } from './grizzle/analysisMonitoring'
import { useLogger } from 'evlog'
import { createError, getQuery } from 'h3'
import { isTrendGranularity, TREND_GRANULARITIES, TREND_GRANULARITY_WHEN_ABSENT, UNKNOWN_WORKFLOW_SELECTION } from '../../types/nuxt-galaxy'

/**
 * The only form these parameters take: a calendar day in UTC, which is also
 * what the buckets are aligned to (D-12) and what a URL can carry legibly.
 */
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/

const ONE_DAY_MS = 86_400_000

/**
 * The longest range that will be served. Ten years is longer than any
 * deployment's history and already 3653 daily buckets. Unbounded, the trend
 * draws one point per day between whatever two dates are asked for, and
 * `from=0001-01-01&to=9999-12-31` would ask it for millions: before the range
 * existed the span came from the rows themselves and so bounded itself.
 */
const MAX_RANGE_DAYS = 3653

function parseDay(value: unknown, name: 'from' | 'to'): Date | undefined {
  if (value === undefined || value === '') {
    return undefined
  }

  if (typeof value !== 'string' || !CALENDAR_DAY.test(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: `\`${name}\` must be a calendar day in UTC, written as YYYY-MM-DD`,
    })
  }

  const day = new Date(`${value}T00:00:00.000Z`)
  // a day past the end of its month rolls forward rather than failing to parse
  // -- 2026-02-31 becomes 3 March -- so the round trip is what rejects it,
  // rather than a typo quietly shifting the window a reader asked for
  if (Number.isNaN(day.getTime()) || !day.toISOString().startsWith(value)) {
    throw createError({ statusCode: 400, statusMessage: `\`${name}\` is not a real date` })
  }

  return day
}

/**
 * The range a usage request asks for, read from its query parameters.
 *
 * Both parameters name a day and a reader means both of them inclusively: "to
 * 31 August" includes the 31st. The query layer works in instants over a
 * half-open interval, so the day named by `to` becomes the start of the day
 * after it. Absent parameters keep the meaning they have always had: all time.
 */
export function parseUsageFilters(query: Record<string, unknown>): UsageFilters {
  const from = parseDay(query.from, 'from')
  const lastDay = parseDay(query.to, 'to')
  const to = lastDay === undefined ? undefined : new Date(lastDay.getTime() + ONE_DAY_MS)

  if (from !== undefined && to !== undefined && from.getTime() >= to.getTime()) {
    throw createError({ statusCode: 400, statusMessage: '`from` must not come after `to`' })
  }

  // Measured against today when no end is named, because that is where the
  // trend stops: an open-ended range means "since then", so `from` alone spans
  // just as far as both ends do and has to be bounded just as hard. Capping
  // only the two-ended case left `?from=0001-01-01` building a bucket per day
  // since year one, which is the very thing the cap exists to refuse.
  //
  // An end alone needs no cap: the span then starts at the earliest analysis,
  // so the data bounds it, as it did before any range could be asked for.
  if (from !== undefined) {
    const end = to ?? new Date()
    if ((end.getTime() - from.getTime()) / ONE_DAY_MS > MAX_RANGE_DAYS) {
      throw createError({
        statusCode: 400,
        statusMessage: `a range may cover at most ${MAX_RANGE_DAYS} days`,
      })
    }
  }

  return { from, to }
}

/**
 * The bucket width a usage request asks its trend for, read from its query
 * parameters.
 *
 * A closed allowlist, because the value reaches a `date_trunc` unit: anything
 * outside it is refused rather than quietly falling back to a day, so a
 * misspelt parameter is a mistake a caller is told about instead of silently
 * getting a chart they did not ask for. Absent means the day the endpoints
 * have always bucketed by.
 */
export function parseTrendGranularity(query: Record<string, unknown>): TrendGranularity {
  const value = query.granularity

  if (value === undefined || value === '') {
    return TREND_GRANULARITY_WHEN_ABSENT
  }

  if (!isTrendGranularity(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: `\`granularity\` must be one of ${TREND_GRANULARITIES.join(', ')}`,
    })
  }

  return value
}

/**
 * A workflow identifier as a URL carries one: plain digits, no leading zero.
 * `Number()` would take `0x10` for 16 and `1e3` for a thousand, and would read
 * ` 3` through its whitespace; an identifier written any of those ways is a
 * mistake rather than a request, and `007` is a second spelling of a number
 * that already has one.
 *
 * The leading digit also refuses `0` on its own: identifiers are `serial`, so
 * they start at 1.
 */
const WORKFLOW_ID = /^[1-9]\d*$/

/**
 * The largest identifier the column can hold, `workflow_id` being `integer`.
 * Past it Postgres refuses the bound parameter and the request dies as a 500,
 * which is the wrong answer to input a reader typed: it is malformed, not
 * broken, so it is refused here with the rest of the malformed values.
 */
const MAX_WORKFLOW_ID = 2_147_483_647

/**
 * The one workflow a usage request narrows its counts and trend to, read from
 * its query parameters. Absent means every workflow, which is what these
 * endpoints have always answered.
 *
 * The Unknown workflow bucket is selectable like any other, and travels as a
 * word because it has no identifier of its own: every monitoring row carries a
 * workflow id, and what makes one unknown is a name that was never recorded.
 */
export function parseWorkflowSelection(query: Record<string, unknown>): WorkflowSelection | undefined {
  const value = query.workflowId

  if (value === undefined || value === '') {
    return undefined
  }

  if (value === UNKNOWN_WORKFLOW_SELECTION) {
    return UNKNOWN_WORKFLOW_SELECTION
  }

  if (typeof value !== 'string' || !WORKFLOW_ID.test(value) || Number(value) > MAX_WORKFLOW_ID) {
    throw createError({
      statusCode: 400,
      statusMessage: `\`workflowId\` must be a workflow identifier or \`${UNKNOWN_WORKFLOW_SELECTION}\``,
    })
  }

  return Number(value)
}

/** How a request wants its usage statistics narrowed, and how bucketed. */
export interface UsageRequest {
  readonly filters: UsageFilters
  readonly granularity: TrendGranularity
}

/**
 * How a request wants its usage statistics narrowed and bucketed, refused with
 * a 400 when either cannot be read.
 *
 * A rejection is logged at warn, where LOGGING-SPEC puts invalid filter state:
 * the parse happens before the request's Effect runs, so without this the wide
 * event would carry a 400 and no reason for it.
 */
export function readUsageRequest(event: H3Event): UsageRequest {
  const query = getQuery(event)
  try {
    return {
      filters: { ...parseUsageFilters(query), workflowSelection: parseWorkflowSelection(query) },
      granularity: parseTrendGranularity(query),
    }
  }
  catch (error) {
    const reason = (error as { statusMessage?: string }).statusMessage
    useLogger(event).warn('usage statistics request rejected', { reason })
    throw error
  }
}
