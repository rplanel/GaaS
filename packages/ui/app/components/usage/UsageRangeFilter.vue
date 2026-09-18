<script setup lang="ts">
import type { DateValue } from '@internationalized/date'
import { DateFormatter, parseDate, today } from '@internationalized/date'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'

/**
 * Reads and writes the URL directly rather than taking props, so this control
 * and the page whose statistics it narrows share one source of truth and
 * cannot disagree about what is on screen.
 */
const { preset, isCustom, range, selectPreset, selectCustomRange } = useUsageFilters()

/**
 * Days are UTC everywhere, matching the buckets, so the calendar is read and
 * written in UTC rather than in whatever zone the reader keeps: clicking the
 * 18th has to mean the 18th in the data.
 */
const UTC = 'UTC'
const dayFormatter = new DateFormatter('en-GB', { dateStyle: 'medium', timeZone: UTC })
const todayUtc = today(UTC)

/**
 * The same ten years the endpoint refuses beyond, so the picker cannot offer a
 * range the server would answer with a 400.
 */
const MAX_RANGE_DAYS = 3653

const breakpoints = useBreakpoints(breakpointsTailwind)
const isDesktop = breakpoints.greaterOrEqual('sm')

const isOpen = ref(false)

/** A day from the URL, which may be anything at all until it is parsed. */
function toCalendarDate(day: string | undefined): DateValue | undefined {
  if (!day) {
    return undefined
  }
  try {
    return parseDate(day)
  }
  catch {
    return undefined
  }
}

function formatDay(day: string): string {
  const parsed = toCalendarDate(day)
  return parsed ? dayFormatter.format(parsed.toDate(UTC)) : day
}

const selection = shallowRef<{ start: DateValue | undefined, end: DateValue | undefined }>({
  start: undefined,
  end: undefined,
})

// the calendar opens on whatever is already on screen, so a reader adjusting
// one end of a range does not have to name the other again
watch(isOpen, (open) => {
  if (open) {
    selection.value = {
      start: toCalendarDate(range.value.from),
      end: toCalendarDate(range.value.to),
    }
  }
})

// a range is applied once both of its ends are known, and not before
watch(selection, (next) => {
  const picked = rangeFromSelection(next)
  if (!picked || (picked.from === range.value.from && picked.to === range.value.to)) {
    return
  }

  selectCustomRange(picked)
  isOpen.value = false
})

const customLabel = computed(() => {
  const { from, to } = range.value
  if (!isCustom.value || !from || !to) {
    return 'Custom'
  }
  return `${formatDay(from)} – ${formatDay(to)}`
})
</script>

<template>
  <div data-testid="usage-range-filter" class="flex flex-wrap items-center gap-1">
    <UButton
      v-for="option in USAGE_PRESETS"
      :key="option.value"
      :data-testid="`usage-preset-${option.value}`"
      :label="option.label"
      size="sm"
      :aria-pressed="!isCustom && preset === option.value"
      :variant="!isCustom && preset === option.value ? 'subtle' : 'ghost'"
      :color="!isCustom && preset === option.value ? 'primary' : 'neutral'"
      @click="selectPreset(option.value)"
    />

    <UPopover v-model:open="isOpen" :content="{ align: 'end' }">
      <UButton
        data-testid="usage-preset-custom"
        :label="customLabel"
        icon="i-lucide-calendar"
        size="sm"
        :aria-pressed="isCustom"
        :variant="isCustom ? 'subtle' : 'ghost'"
        :color="isCustom ? 'primary' : 'neutral'"
      />

      <template #content>
        <UCalendar
          v-model="selection"
          data-testid="usage-custom-calendar"
          range
          class="p-2"
          :number-of-months="isDesktop ? 2 : 1"
          :max-value="todayUtc"
          :maximum-days="MAX_RANGE_DAYS"
        />
      </template>
    </UPopover>
  </div>
</template>
