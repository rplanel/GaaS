<script setup lang="ts">
import type { TableColumn, TableRow } from '@nuxt/ui'
import type { AnalysisMonitoringCounts, AnalysisMonitoringStats, AnalysisMonitoringWorkflowUsage, WorkflowSelection } from 'nuxt-galaxy'
import { formatSuccessRate, OUTCOME_FIELDS, UNKNOWN_WORKFLOW, UNKNOWN_WORKFLOW_LABEL, workflowUsageLabel } from '../../utils/usageStatistics'
import ColumnTableSort from '../ColumnTableSort.vue'
import UsageGranularityFilter from './UsageGranularityFilter.vue'
import UsageOutcomeBar from './UsageOutcomeBar.vue'
import UsageRangeFilter from './UsageRangeFilter.vue'
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

/** Most-used workflow first, which is what a reader looks for. */
const sorting = ref([{ id: 'total', desc: true }])

/**
 * How a row names itself, in the same tokens the URL carries. The Unknown
 * workflow arrives with a null id, having none of its own.
 */
function workflowKey(usage: AnalysisMonitoringWorkflowUsage): string {
  return usage.workflowId === null ? UNKNOWN_WORKFLOW : String(usage.workflowId)
}

/**
 * Keying rows by those tokens is what lets the URL drive the highlight: the
 * table renders `data-selected` from this, and nothing else has to be kept in
 * step with it.
 */
const rowSelection = computed(() => (
  workflowSelection.value === undefined ? {} : { [String(workflowSelection.value)]: true }
))

/** Picks a workflow, or clears it when it was already the one selected. */
function toggleSelection(clicked: WorkflowSelection) {
  selectWorkflow(clicked === workflowSelection.value ? undefined : clicked)
}

// clicking the selected row again clears it, which is the other half of the
// clear control the chip provides
function toggleWorkflow(_event: Event, row: TableRow<AnalysisMonitoringWorkflowUsage>) {
  toggleSelection(row.original.workflowId ?? UNKNOWN_WORKFLOW)
}

/**
 * Enter and Space on a focused row, which the table does not handle itself.
 *
 * It gives every row `role="button"` and `tabindex="0"` but binds only a
 * click, so without this a keyboard reader tabs onto something announced as a
 * button and finds it dead -- worse than a row that was never focusable.
 * Delegated from the wrapper because the table offers no per-row event hook;
 * the row is located from the event and named by the key its first cell
 * carries, so sorting cannot put the wrong workflow under a keystroke.
 */
function selectFromKeyboard(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return
  }
  const target = event.target as HTMLElement | null
  // the table bails out of a click that landed on a button or a link, and a
  // keystroke reaching one should not both press it and move the selection
  if (target?.closest?.('button, a')) {
    return
  }
  const row = target?.closest?.('tr[role="button"]')
  const key = row?.querySelector<HTMLElement>('[data-workflow-key]')?.dataset.workflowKey
  if (key === undefined) {
    return
  }
  // Space would otherwise scroll the page out from under the reader
  event.preventDefault()
  const selection = workflowSelectionFromToken(key)
  if (selection !== undefined) {
    toggleSelection(selection)
  }
}

/**
 * Every workflow name this panel has been told about, kept across responses.
 *
 * A selection outlives a range that holds nothing of it, and the names come
 * from the response, so without this the chip would have nothing to call the
 * very workflow whose absence it is reporting. The URL carries the identifier
 * alone: a name there would go stale on a rename, which is the mistake the
 * preset tokens already avoid.
 */
const knownWorkflowLabels = ref<Record<string, string>>({})

watch(perWorkflow, (entries) => {
  const next = { ...knownWorkflowLabels.value }
  for (const entry of entries) {
    const name = workflowUsageLabel(entry)
    next[workflowKey(entry)] = entry.version ? `${name} ${entry.version}` : name
  }
  knownWorkflowLabels.value = next
}, { immediate: true })

/**
 * The busiest workflow on screen, which sets the scale every bar is drawn
 * against. Taken from the rows rather than from the totals, because the totals
 * are narrowed by a selection and these rows are not.
 */
const maxWorkflowTotal = computed(() => Math.max(0, ...perWorkflow.value.map(entry => entry.total)))

/** What the tiles are counting, whenever that is not simply everything. */
const selectedWorkflowLabel = computed(() => {
  const selection = workflowSelection.value
  if (selection === undefined) {
    return undefined
  }
  // a cold load of a link into a range holding nothing of it has no name to
  // show, and the identifier is a truer answer than a guess
  const fallback = selection === UNKNOWN_WORKFLOW ? UNKNOWN_WORKFLOW_LABEL : `Workflow ${selection}`
  return knownWorkflowLabels.value[String(selection)] ?? fallback
})

function countColumn(key: keyof AnalysisMonitoringCounts, label: string): TableColumn<AnalysisMonitoringWorkflowUsage> {
  return {
    accessorKey: key,
    header: ({ column }) => h(ColumnTableSort, { column, label }),
    cell: ({ row }) => h('span', { class: 'tabular-nums' }, String(row.original[key])),
  }
}

/**
 * Computed rather than fixed. A plain array works too -- the cell closure reads
 * the selection while the table renders, so the table's own effect tracks it --
 * but that leaves the marking depending on where someone else chooses to invoke
 * our renderer. This keeps the dependency one we hold.
 */
const perWorkflowColumns = computed<TableColumn<AnalysisMonitoringWorkflowUsage>[]>(() => [
  {
    accessorKey: 'name',
    header: ({ column }) => h(ColumnTableSort, { column, label: 'Workflow' }),
    cell: ({ row }) => {
      const selected = (row.original.workflowId ?? UNKNOWN_WORKFLOW) === workflowSelection.value
      return h('div', {
        'class': 'flex items-center gap-2',
        // how the delegated key handler below finds which row was activated.
        // On the cell's root rather than on anything decorative inside it,
        // which could be restyled away without anyone noticing the keyboard
        // had stopped working.
        'data-workflow-key': workflowKey(row.original),
      }, [
        // a bar down the left edge, so the tint is not the only thing saying
        // which row is selected. Always rendered, transparent when it is not,
        // which keeps every name on the same left edge.
        h('span', {
          'class': ['w-0.5 shrink-0 self-stretch rounded-full', selected ? 'bg-primary' : 'bg-transparent'],
          'aria-hidden': 'true',
          'data-testid': selected ? 'usage-workflow-selected-bar' : undefined,
        }),
        h('span', { class: 'truncate' }, workflowUsageLabel(row.original)),
        row.original.version
          ? h(UBadge, { label: row.original.version, size: 'sm', variant: 'subtle', color: 'neutral' })
          : null,
        // the table offers no per-row aria hook, and a colour says nothing to
        // a reader who cannot see it, so the state is spelt out in the cell
        selected ? h('span', { class: 'sr-only' }, 'Selected') : null,
      ])
    },
  },
  {
    id: 'outcomes',
    // not sortable: the shape is the point, and Total already orders by size
    header: () => h('span', { class: 'text-sm' }, 'Outcomes'),
    cell: ({ row }) => h(UsageOutcomeBar, { usage: row.original, maxTotal: maxWorkflowTotal.value }),
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
])
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

      <div
        v-if="perWorkflow.length > 0"
        data-testid="usage-per-workflow"
        class="flex flex-col gap-2"
        @keydown="selectFromKeyboard"
      >
        <h3 class="text-sm font-semibold">
          Usage by workflow
        </h3>
        <!--
          A hover tint reaches nobody on a touch screen, and neither it nor a
          cursor says what a click would do. This does both, and says which
          part of the page answers to it.
        -->
        <p data-testid="usage-per-workflow-hint" class="text-xs text-muted">
          Select a workflow to narrow the tiles and the trend above.
        </p>
        <UTable
          v-model:sorting="sorting"
          :data="perWorkflow"
          :columns="perWorkflowColumns"
          :row-selection="rowSelection"
          :get-row-id="workflowKey"
          :ui="{ tr: 'data-[selectable=true]:cursor-pointer data-[selected=true]:bg-elevated' }"
          @select="toggleWorkflow"
        />
      </div>
    </template>
  </div>
</template>
