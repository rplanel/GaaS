<script setup lang="ts">
import type { AnalysisMonitoringWorkflowUsage } from 'nuxt-galaxy'
import { OUTCOME_FIELDS } from '../../utils/usageStatistics'

interface Props {
  usage: AnalysisMonitoringWorkflowUsage
  /** The busiest workflow on screen, which takes the full width. */
  maxTotal: number
}

const props = defineProps<Props>()

/**
 * The narrowest a bar may be drawn, as a percentage.
 *
 * One run beside a workflow with two hundred is a quarter of a percent, which
 * rounds away to nothing on screen. A workflow that ran at all should be
 * visible as having run, so length stops being faithful at the very bottom of
 * the scale and says "a little" instead of "none".
 */
const MIN_VISIBLE_WIDTH = 2

/** How much of the full width this workflow's runs take up. */
const width = computed(() => {
  if (props.maxTotal <= 0 || props.usage.total <= 0) {
    return 0
  }
  return Math.max((props.usage.total / props.maxTotal) * 100, MIN_VISIBLE_WIDTH)
})

/**
 * One segment per outcome that occurred, in the colours the tiles and the
 * trend already use, so a colour means the same thing everywhere on the page.
 * Outcomes that did not occur draw nothing rather than a zero-width sliver.
 */
const segments = computed(() => {
  const total = props.usage.total
  if (total <= 0) {
    return []
  }
  return OUTCOME_FIELDS
    .filter(field => props.usage[field.key] > 0)
    .map(field => ({
      key: field.key,
      label: field.label,
      fill: field.fill,
      share: (props.usage[field.key] / total) * 100,
    }))
})
</script>

<template>
  <!--
    Hidden from assistive technology on purpose: every number it draws is
    already in the count columns of this same row, so announcing it again would
    only repeat them without the shape that makes it worth drawing.
  -->
  <div
    aria-hidden="true"
    data-testid="usage-outcome-bar"
    class="h-2 w-full min-w-16 overflow-hidden rounded-full bg-elevated"
  >
    <div class="flex h-full" :style="{ width: `${width}%` }">
      <span
        v-for="segment in segments"
        :key="segment.key"
        :data-testid="`usage-outcome-segment-${segment.key}`"
        class="h-full"
        :style="{ width: `${segment.share}%`, backgroundColor: segment.fill }"
      />
    </div>
  </div>
</template>
