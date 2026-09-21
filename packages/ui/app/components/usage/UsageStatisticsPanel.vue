<script setup lang="ts">
import type { AnalysisMonitoringStats } from 'nuxt-galaxy'
import { COUNT_FIELDS, formatSuccessRate } from '../../utils/usageStatistics'
import UsageGranularityFilter from './UsageGranularityFilter.vue'
import UsageRangeFilter from './UsageRangeFilter.vue'
import UsageStatTile from './UsageStatTile.vue'
import UsageTrendChart from './UsageTrendChart.vue'
import UsageWorkflowTable from './UsageWorkflowTable.vue'

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
 * The selection lives in the URL, as the range and the bucket width do, so
 * this panel and the filter controls beside it read one source and a link
 * carries the view it was copied from. Read here rather than passed in,
 * because the table this panel owns is the thing a reader picks from.
 */
const { granularity, workflowSelection, selectWorkflow } = useUsageFilters()

/**
 * True once statistics have arrived and there is nothing in them at all. Zero
 * tiles would read as a broken page, so the panel invites the user to start an
 * analysis instead.
 *
 * Neither the total nor the rows decide it alone. The total is narrowed by a
 * workflow selection and the rows never are, so a selected workflow that ran
 * nothing brings the total to zero while the account is not empty; and when
 * the range holds nothing at all, both read empty while a selection is still
 * in force and the chip that clears it lives in the other branch. Either way
 * the reader would be told "no analyses yet", which is false, and left with no
 * way back but the URL. So this is the page for someone who has selected
 * nothing and has nothing -- which is the page it has always been.
 */
const hasNothingYet = computed(() => (
  props.stats?.total === 0
  && perWorkflow.value.length === 0
  && workflowSelection.value === undefined
))

/** What the tiles are counting, whenever that is not simply everything. */
const { labelFor } = useWorkflowLabels(perWorkflow)
const selectedWorkflowLabel = computed(() => (
  workflowSelection.value === undefined ? undefined : labelFor(workflowSelection.value)
))
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <!--
        The range and the bucket width by default, both pages wanting both.
        Overridable, so a page that should offer something else still can.
      -->
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <slot name="filters">
          <UsageRangeFilter />
          <UsageGranularityFilter />
        </slot>
      </div>

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
      <!--
        Above the tiles rather than beside the filters: the filter row says what
        is being asked for, this says what the numbers below it are counting.
        Without it the tiles and the table silently disagree, which reads as a
        bug rather than as a selection.
      -->
      <div v-if="selectedWorkflowLabel" data-testid="usage-workflow-chip" class="flex flex-wrap items-center gap-2">
        <span class="text-sm text-muted">Counting</span>
        <UButton
          data-testid="usage-workflow-clear"
          :label="selectedWorkflowLabel"
          :aria-label="`Stop counting ${selectedWorkflowLabel} only`"
          trailing-icon="i-lucide-x"
          size="sm"
          variant="subtle"
          color="primary"
          @click="selectWorkflow(undefined)"
        />
      </div>

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
        <UsageTrendChart :trend="trend" :granularity="granularity" />
      </div>

      <UsageWorkflowTable v-if="perWorkflow.length > 0" :per-workflow="perWorkflow" />
    </template>
  </div>
</template>
