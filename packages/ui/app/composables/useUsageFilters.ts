import type { UsageStatisticsRange } from 'nuxt-galaxy'
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

export interface UsageFilterControls {
  /** The preset in force, or undefined while a custom range is. */
  preset: ComputedRef<UsagePreset | undefined>
  /** True when the reader named their own dates. */
  isCustom: ComputedRef<boolean>
  /** The range to ask the endpoint for, whichever way it was chosen. */
  range: ComputedRef<UsageStatisticsRange>
  selectPreset: (preset: UsagePreset) => void
  selectCustomRange: (range: UsageStatisticsRange) => void
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

  // replace rather than push: a filter is a way of looking at one page, not a
  // place of its own, so Back should leave the page rather than undo a click
  function selectPreset(next: UsagePreset) {
    const { from: _from, to: _to, ...rest } = route.query
    router.replace({ query: { ...rest, range: next } })
  }

  function selectCustomRange(next: UsageStatisticsRange) {
    const { range: _range, from: _from, to: _to, ...rest } = route.query
    router.replace({
      query: {
        ...rest,
        ...(next.from ? { from: next.from } : {}),
        ...(next.to ? { to: next.to } : {}),
      },
    })
  }

  return { preset, isCustom, range, selectPreset, selectCustomRange }
}
