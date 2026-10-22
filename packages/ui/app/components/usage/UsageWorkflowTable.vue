<script setup lang="ts">
import type { TableColumn, TableRow } from '@nuxt/ui'
import type { AnalysisMonitoringCounts, AnalysisMonitoringWorkflowUsage, WorkflowSelection } from 'nuxt-galaxy'
import { COUNT_FIELDS, formatSuccessRate, workflowKey, workflowUsageLabel } from '../../utils/usageStatistics'
import ColumnTableSort from '../ColumnTableSort.vue'
import UsageOutcomeBar from './UsageOutcomeBar.vue'

interface Props {
  /**
   * Every workflow in range, never narrowed by the selection made from it:
   * a list that hid the options a reader did not pick could not be the thing
   * they pick from.
   */
  perWorkflow: AnalysisMonitoringWorkflowUsage[]
}

const props = defineProps<Props>()

const UBadge = resolveComponent('UBadge')
const UTooltip = resolveComponent('UTooltip')

/**
 * The selection lives in the URL, as the range and the bucket width do, so
 * this table and the panel around it read one source and cannot disagree
 * about which row is in force.
 */
const { workflowSelection, selectWorkflow } = useUsageFilters()

/** Most-used workflow first, which is what a reader looks for. */
const sorting = ref([{ id: 'total', desc: true }])

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
  toggleSelection(row.original.workflowId ?? UNKNOWN_WORKFLOW_SELECTION)
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
 * The busiest workflow on screen, which sets the scale every bar is drawn
 * against. Taken from the rows rather than from the totals, because the totals
 * are narrowed by a selection and these rows are not.
 */
const maxWorkflowTotal = computed(() => Math.max(0, ...props.perWorkflow.map(entry => entry.total)))

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
const columns = computed<TableColumn<AnalysisMonitoringWorkflowUsage>[]>(() => [
  {
    accessorKey: 'name',
    header: ({ column }) => h(ColumnTableSort, { column, label: 'Workflow' }),
    cell: ({ row }) => {
      const selected = (row.original.workflowId ?? UNKNOWN_WORKFLOW_SELECTION) === workflowSelection.value
      return h('div', {
        'class': 'flex items-center gap-2',
        // how the delegated key handler above finds which row was activated.
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
  <div data-testid="usage-per-workflow" class="flex flex-col gap-2" @keydown="selectFromKeyboard">
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
      :columns="columns"
      :row-selection="rowSelection"
      :get-row-id="workflowKey"
      :ui="{ tr: 'data-[selectable=true]:cursor-pointer data-[selected=true]:bg-elevated' }"
      @select="toggleWorkflow"
    />
  </div>
</template>
