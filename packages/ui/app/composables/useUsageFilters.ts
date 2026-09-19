import type { TrendGranularity, UsageStatisticsRange, WorkflowSelection } from 'nuxt-galaxy'
import type { ComputedRef } from 'vue'

/** The ranges offered without asking anyone to name a date. */
export type UsagePreset = '7d' | '30d' | '90d' | 'all'

/** How many days each preset covers, counting today. */
const PRESET_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const

export const USAGE_PRESETS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
] as const satisfies ReadonlyArray<{ value: UsagePreset, label: string }>

/**
 * What a reader sees before choosing anything. The endpoints default to all
 * time, which is deliberate: a bare API call means everything, while someone
 * opening the page is almost always asking about the recent past.
 */
export const DEFAULT_USAGE_PRESET: UsagePreset = '30d'

function isPreset(value: unknown): value is UsagePreset {
  return USAGE_PRESETS.some(preset => preset.value === value)
}

/** The UTC calendar day an instant falls on, which is how buckets are aligned. */
function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * The days a preset covers, counting today, in UTC. "Last 7 days" therefore
 * draws seven buckets with today as the last one, rather than seven days that
 * stop short of it.
 */
export function presetRange(preset: UsagePreset, today: Date = new Date()): UsageStatisticsRange {
  if (preset === 'all') {
    return {}
  }

  const start = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate() - (PRESET_DAYS[preset] - 1),
  ))

  return { from: utcDay(start), to: utcDay(today) }
}

/** A day as a calendar hands it back, which prints as YYYY-MM-DD. */
interface PickedDay {
  toString: () => string
}

/**
 * The range a calendar selection stands for, or nothing while it is only half
 * made. A range picker reports the first click with no end yet, and half a
 * range is not a filter: applying it would narrow the page to a single instant
 * the moment a reader started choosing.
 */
export function rangeFromSelection(
  selection: { start?: PickedDay | null, end?: PickedDay | null } | null | undefined,
): UsageStatisticsRange | undefined {
  if (!selection?.start || !selection?.end) {
    return undefined
  }

  return { from: String(selection.start), to: String(selection.end) }
}

/**
 * How each bucket width the endpoint knows is named on screen. A record rather
 * than a list, so a width added to the shared type is a type error here until
 * it is given a name: what is offered cannot fall behind what is accepted.
 */
const GRANULARITY_LABELS = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
} as const satisfies Record<TrendGranularity, string>

/** The bucket widths on offer, in the order they are shown, coarsest last. */
export const USAGE_GRANULARITIES: ReadonlyArray<{ value: TrendGranularity, label: string }>
  = Object.entries(GRANULARITY_LABELS).map(([value, label]) => ({ value: value as TrendGranularity, label }))

function isGranularity(value: unknown): value is TrendGranularity {
  return typeof value === 'string' && Object.hasOwn(GRANULARITY_LABELS, value)
}

/** The longest span still drawn one bar per day. */
const MAX_DAILY_DAYS = 90

/**
 * The longest span still drawn one bar per week. Two calendar years run to 730
 * days, or 731 across a leap day, and both should read as two years.
 */
const MAX_WEEKLY_DAYS = 731

const ONE_DAY_MS = 86_400_000

/** The days a range covers, counting both ends, or nothing if it has no start. */
function spanInDays(range: UsageStatisticsRange, today: Date): number | undefined {
  if (!range.from) {
    // With no start the span belongs to the data, which only the server has
    // seen. An all-time trend is treated as the long one it may well be.
    return undefined
  }

  const from = Date.parse(`${range.from}T00:00:00.000Z`)
  const to = range.to ? Date.parse(`${range.to}T00:00:00.000Z`) : Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return undefined
  }

  return (to - from) / ONE_DAY_MS + 1
}

/**
 * The bucket width a range is drawn at when nobody has chosen one (Q9).
 *
 * It follows from how many bars the range would produce: a quarter of daily
 * bars can still be read one by one, two years of weekly ones can, and beyond
 * that only months stay legible. A reader who wants otherwise overrides it.
 */
export function automaticGranularity(
  range: UsageStatisticsRange,
  today: Date = new Date(),
): TrendGranularity {
  const days = spanInDays(range, today)
  if (days === undefined) {
    return 'month'
  }
  if (days <= MAX_DAILY_DAYS) {
    return 'day'
  }
  if (days <= MAX_WEEKLY_DAYS) {
    return 'week'
  }
  return 'month'
}

/** An identifier as a URL carries one: plain digits, no leading zero. */
const WORKFLOW_ID = /^[1-9]\d*$/

/**
 * The largest identifier the column behind the endpoint can hold. Mirrors the
 * bound in `parseWorkflowSelection`, which refuses anything past it: sending
 * one would buy a 400 and an error banner, where a URL nobody can read should
 * simply mean nothing is selected.
 */
const MAX_WORKFLOW_ID = 2_147_483_647

/**
 * The workflow a URL selects, or nothing.
 *
 * Anything unreadable means nothing selected rather than an error. The server
 * refuses the same value with a 400, and the asymmetry is deliberate: an API
 * caller sending nonsense should hear about it, while a reader who lands on a
 * mangled link should still get their page, exactly as an unreadable preset or
 * bucket width already gives them the default.
 */
export function workflowSelectionFromToken(token: unknown): WorkflowSelection | undefined {
  if (token === UNKNOWN_WORKFLOW) {
    return UNKNOWN_WORKFLOW
  }
  if (typeof token !== 'string' || !WORKFLOW_ID.test(token)) {
    return undefined
  }
  const id = Number(token)
  return id <= MAX_WORKFLOW_ID ? id : undefined
}

export interface UsageFilterControls {
  /** The preset in force, or undefined while a custom range is. */
  preset: ComputedRef<UsagePreset | undefined>
  /** True when the reader named their own dates. */
  isCustom: ComputedRef<boolean>
  /** The range to ask the endpoint for, whichever way it was chosen. */
  range: ComputedRef<UsageStatisticsRange>
  /** The bucket width the trend is drawn at, overridden or worked out. */
  granularity: ComputedRef<TrendGranularity>
  /** The width a reader chose, or undefined while the range decides it. */
  granularityOverride: ComputedRef<TrendGranularity | undefined>
  selectPreset: (preset: UsagePreset) => void
  selectCustomRange: (range: UsageStatisticsRange) => void
  /** Chooses a width, or undefined to hand the choice back to the range. */
  selectGranularity: (granularity: TrendGranularity | undefined) => void
  /** The workflow the counts and the trend are narrowed to, if any. */
  workflowSelection: ComputedRef<WorkflowSelection | undefined>
  /** Selects one workflow, or undefined to go back to all of them. */
  selectWorkflow: (selection: WorkflowSelection | undefined) => void
}

/**
 * The range a usage page is showing, held in the URL.
 *
 * The URL is the only copy of this state, so a page and its filter control can
 * each read it without passing anything between them, and a link carries the
 * exact view it was copied from. A preset travels as its token rather than as
 * the dates it resolved to that day, so a bookmarked "last 30 days" still
 * means the last 30 days a month later (Q17).
 */
export function useUsageFilters(): UsageFilterControls {
  const route = useRoute()
  const router = useRouter()

  // an empty bound is no bound: `?from=` would otherwise claim a custom range
  // on screen while the query it produces asks for all time
  const customFrom = computed(() => (typeof route.query.from === 'string' && route.query.from !== '' ? route.query.from : undefined))
  const customTo = computed(() => (typeof route.query.to === 'string' && route.query.to !== '' ? route.query.to : undefined))
  const isCustom = computed(() => customFrom.value !== undefined || customTo.value !== undefined)

  const preset = computed<UsagePreset | undefined>(() => {
    if (isCustom.value) {
      return undefined
    }
    // an unreadable token is not worth an error page; it simply means nothing
    // was chosen, and the default stands
    return isPreset(route.query.range) ? route.query.range : DEFAULT_USAGE_PRESET
  })

  const range = computed<UsageStatisticsRange>(() => {
    if (isCustom.value) {
      return { from: customFrom.value, to: customTo.value }
    }
    return presetRange(preset.value ?? DEFAULT_USAGE_PRESET)
  })

  // absent means automatic, so an unreadable token reads as nothing chosen
  // rather than as an error, exactly as an unreadable preset token does
  const granularityOverride = computed<TrendGranularity | undefined>(() =>
    isGranularity(route.query.granularity) ? route.query.granularity : undefined,
  )

  const granularity = computed<TrendGranularity>(() =>
    granularityOverride.value ?? automaticGranularity(range.value),
  )

  const workflowSelection = computed(() => workflowSelectionFromToken(route.query.workflowId))

  /**
   * Rewrites part of the filter state, leaving the rest of the URL alone.
   *
   * Replace rather than push, and in one place: a filter is a way of looking
   * at one page, not a place of its own, so Back should leave the page rather
   * than undo a click. `drop` names what this change supersedes; anything in
   * `set` with no value is left out, absence being how every one of these
   * says "nothing chosen".
   */
  function replaceQuery(drop: readonly string[], set: Record<string, string | undefined>) {
    const query = { ...route.query }
    for (const key of drop) {
      delete query[key]
    }
    for (const [key, value] of Object.entries(set)) {
      if (value === undefined) {
        delete query[key]
      }
      else {
        query[key] = value
      }
    }
    router.replace({ query })
  }

  function selectPreset(next: UsagePreset) {
    replaceQuery(['from', 'to'], { range: next })
  }

  function selectCustomRange(next: UsageStatisticsRange) {
    replaceQuery(['range', 'from', 'to'], { from: next.from, to: next.to })
  }

  // the override outlives a change of range on purpose: a reader who asked for
  // weeks meant weeks, and the automatic setting is one click away
  function selectGranularity(next: TrendGranularity | undefined) {
    replaceQuery([], { granularity: next })
  }

  // the range and the bucket width are left alone: the three are independent,
  // and a reader picking a workflow has not asked to see a different period
  function selectWorkflow(next: WorkflowSelection | undefined) {
    replaceQuery([], { workflowId: next === undefined ? undefined : String(next) })
  }

  return {
    preset,
    isCustom,
    range,
    granularity,
    granularityOverride,
    workflowSelection,
    selectPreset,
    selectCustomRange,
    selectGranularity,
    selectWorkflow,
  }
}
