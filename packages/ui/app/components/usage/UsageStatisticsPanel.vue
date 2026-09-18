<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AnalysisMonitoringCounts, AnalysisMonitoringStats, AnalysisMonitoringWorkflowUsage } from 'nuxt-galaxy'
import { formatSuccessRate, OUTCOME_FIELDS, workflowUsageLabel } from '../../utils/usageStatistics'
import ColumnTableSort from '../ColumnTableSort.vue'
import UsageStatTile from './UsageStatTile.vue'
import UsageTrendChart from './UsageTrendChart.vue'

interface Props {
  /**
   * Usage statistics to display. The same shape whether they cover one user's
   * own analyses or every user's, so this panel serves both. Undefined while
   * they are still being fetched.
   */
  stats: AnalysisMonitoringStats | undefined
  /** True while the statistics are being fetched. */
  isLoading?: boolean
  /** Why the statistics could not be fetched, when they could not be. */
  errorMessage?: string | undefined
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  errorMessage: undefined,
})

/**
 * Statistics are fetched when the page opens and never pushed, so the reader
 * needs a way to ask for current numbers.
 */
const emit = defineEmits<{ refresh: [] }>()

const UBadge = resolveComponent('UBadge')
const UTooltip = resolveComponent('UTooltip')

/**
 * The counts a reader sees, in the order they appear: the total, then the four
 * outcomes with the labels and colours the trend chart also uses. One list
 * drives the tiles and the table columns, so nothing can disagree between
 * them.
 */
const COUNT_FIELDS = [
  { key: 'total', label: 'Total', icon: 'i-lucide-layers', fill: undefined },
  ...OUTCOME_FIELDS,
] as const satisfies ReadonlyArray<{
  key: keyof AnalysisMonitoringCounts
  label: string
  icon: string
  fill: string | undefined
}>

const countTiles = computed(() => {
  const stats = props.stats
  if (!stats) {
    return []
  }

  return COUNT_FIELDS.map(field => ({
    ...field,
    value: String(stats[field.key]),
  }))
})

const successRate = computed(() => (props.stats ? formatSuccessRate(props.stats) : undefined))

const perWorkflow = computed(() => props.stats?.perWorkflow ?? [])

const trend = computed(() => props.stats?.trend ?? [])

/**
 * True once statistics have arrived and there is nothing in them. Zero tiles
 * would read as a broken page, so the panel invites the user to start an
 * analysis instead.
 */
const hasNothingYet = computed(() => props.stats?.total === 0)

/** Most-used workflow first, which is what a reader looks for. */
const sorting = ref([{ id: 'total', desc: true }])

function countColumn(key: keyof AnalysisMonitoringCounts, label: string): TableColumn<AnalysisMonitoringWorkflowUsage> {
  return {
    accessorKey: key,
    header: ({ column }) => h(ColumnTableSort, { column, label }),
    cell: ({ row }) => h('span', { class: 'tabular-nums' }, String(row.original[key])),
  }
}

const perWorkflowColumns: TableColumn<AnalysisMonitoringWorkflowUsage>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => h(ColumnTableSort, { column, label: 'Workflow' }),
    cell: ({ row }) => h('div', { class: 'flex items-center gap-2' }, [
      h('span', { class: 'truncate' }, workflowUsageLabel(row.original)),
      row.original.version
        ? h(UBadge, { label: row.original.version, size: 'sm', variant: 'subtle', color: 'neutral' })
        : null,
    ]),
  },
  ...COUNT_FIELDS.map(field => countColumn(field.key, field.label)),
  {
    accessorKey: 'successRate',
    header: ({ column }) => h(ColumnTableSort, { column, label: 'Success rate' }),
    cell: ({ row }) => {
      const rate = formatSuccessRate(row.original)
      const value = h('span', { class: rate.hasValue ? 'tabular-nums' : 'tabular-nums text-dimmed' }, rate.label)
      return rate.tooltip ? h(UTooltip, { text: rate.tooltip }, () => value) : value
    },
  },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-end">
      <UButton
        data-testid="usage-refresh"
        icon="i-lucide-refresh-cw"
        variant="ghost"
        color="neutral"
        size="sm"
        label="Refresh"
        :loading="isLoading"
        @click="emit('refresh')"
      />
    </div>

    <UAlert
      v-if="errorMessage"
      data-testid="usage-error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Could not load usage statistics"
      :description="errorMessage"
    />

    <div
      v-else-if="!stats"
      data-testid="usage-loading"
      class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
    >
      <USkeleton v-for="placeholder in COUNT_FIELDS.length + 1" :key="placeholder" class="h-22" />
    </div>

    <template v-else-if="hasNothingYet">
      <!-- overridable, because "run a workflow" is not what an operator viewing global usage should be told -->
      <slot name="empty">
        <div class="flex flex-col items-center gap-3 p-8 text-center">
          <p class="text-sm text-muted">
            No analyses yet
          </p>
          <UButton to="/workflows" icon="i-lucide:workflow" variant="subtle" label="Run a workflow" />
        </div>
      </slot>
    </template>

    <template v-else>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <UsageStatTile
          v-for="countTile in countTiles"
          :key="countTile.key"
          :data-testid="`usage-tile-${countTile.key}`"
          :label="countTile.label"
          :value="countTile.value"
          :icon="countTile.icon"
          :icon-color="countTile.fill"
        />

        <UsageStatTile
          v-if="successRate"
          data-testid="usage-tile-successRate"
          label="Success rate"
          icon="i-lucide-percent"
          :value="successRate.label"
          :tooltip="successRate.tooltip"
        />
      </div>

      <div v-if="trend.length > 0" data-testid="usage-trend" class="flex flex-col gap-2">
        <h3 class="text-sm font-semibold">
          Analyses over time
        </h3>
        <UsageTrendChart :trend="trend" />
      </div>

      <div v-if="perWorkflow.length > 0" data-testid="usage-per-workflow" class="flex flex-col gap-2">
        <h3 class="text-sm font-semibold">
          Usage by workflow
        </h3>
        <UTable v-model:sorting="sorting" :data="perWorkflow" :columns="perWorkflowColumns" />
      </div>
    </template>
  </div>
</template>
