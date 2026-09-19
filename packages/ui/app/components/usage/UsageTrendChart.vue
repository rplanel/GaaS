<script setup lang="ts">
import type { AnalysisMonitoringTrendPoint, TrendGranularity } from 'nuxt-galaxy'
import { ObservablePlotRender } from '#components'
import * as Plot from '@observablehq/plot'
import { useElementSize } from '@vueuse/core'
import { OUTCOME_FIELDS, TREND_AXIS_LABELS, trendBucketSummary, trendSegments } from '../../utils/usageStatistics'

interface Props {
  /**
   * Consecutive buckets, already zero-filled by the server. Whatever range and
   * granularity the response carries is what gets drawn.
   */
  trend: AnalysisMonitoringTrendPoint[]
  /**
   * How wide each of those buckets is. Not inferable from the points: a day
   * key and a week key are both a date, and one bucket could be either.
   */
  granularity: TrendGranularity
}

const props = defineProps<Props>()

const CHART_HEIGHT = 220

const container = useTemplateRef<HTMLElement>('container')
const { width: measuredWidth } = useElementSize(container)

/** Before layout settles there is no measured width, so fall back to a usable one. */
const width = computed(() => (measuredWidth.value > 0 ? Math.round(measuredWidth.value) : 640))

const segments = computed(() => trendSegments(props.trend))

/**
 * Every bucket in the response, in order. Given explicitly so a bucket with no
 * analyses keeps its slot on the axis instead of the neighbouring days closing
 * the gap and hiding a quiet period.
 */
const buckets = computed(() => props.trend.map(point => point.bucket))

/**
 * One invisible full-height bar per bucket, carrying that bucket's summary.
 * Hovering anywhere in a bucket's column reaches it, which is the only way a
 * bucket with no analyses can be hovered at all: it draws no bar of its own,
 * and it is the bucket a reader most wants explained.
 */
const hoverTargets = computed(() => {
  const tallest = Math.max(1, ...props.trend.map(point => point.total))

  return props.trend.map(point => ({
    bucket: point.bucket,
    extent: tallest,
    summary: trendBucketSummary(point, props.granularity),
  }))
})

const plotOptions = computed(() => ({
  width: width.value,
  height: CHART_HEIGHT,
  marginLeft: 44,
  marginBottom: 48,
  x: {
    // band, because a bucket is a labelled interval rather than an instant
    type: 'band' as const,
    domain: buckets.value,
    label: TREND_AXIS_LABELS[props.granularity],
    tickRotate: -35,
  },
  y: {
    label: 'Analyses',
    grid: true,
    nice: true,
  },
  marks: [
    Plot.barY(segments.value, Plot.stackY({
      x: 'bucket',
      y: 'count',
      fill: 'fill',
      order: null,
    })),
    Plot.ruleY([0]),
    // painted last so it sits above the bars and wins the hover
    Plot.barY(hoverTargets.value, {
      x: 'bucket',
      y: 'extent',
      fill: 'currentColor',
      fillOpacity: 0,
      title: 'summary',
    }),
  ],
}))
</script>

<template>
  <div class="flex flex-col gap-2">
    <ul class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <li v-for="outcome in OUTCOME_FIELDS" :key="outcome.key" class="flex items-center gap-1.5 text-xs text-muted">
        <span class="size-2.5 shrink-0 rounded-sm" :style="{ backgroundColor: outcome.fill }" />
        {{ outcome.label }}
      </li>
    </ul>

    <div ref="container" class="w-full">
      <!--
        Drawn in the browser only. The plot is built against a stand-in document
        on the server, which drops attributes the browser then emits, and the
        difference reads as a hydration mismatch.
      -->
      <ClientOnly>
        <ObservablePlotRender :options="plotOptions" />
        <template #fallback>
          <USkeleton :style="{ height: `${CHART_HEIGHT}px` }" class="w-full" />
        </template>
      </ClientOnly>
    </div>
  </div>
</template>
