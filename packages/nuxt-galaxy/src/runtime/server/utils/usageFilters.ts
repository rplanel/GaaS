import type { UsageFilters } from './grizzle/analysisMonitoring'
import { createError } from 'h3'

/**
 * The only form these parameters take: a calendar day in UTC, which is also
 * what the buckets are aligned to (D-12) and what a URL can carry legibly.
 */
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/

const ONE_DAY_MS = 86_400_000

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

  return { from, to }
}
