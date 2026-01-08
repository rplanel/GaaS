<script setup lang="ts" generic="T">
import { upperFirst } from 'scule'

export interface ColumnVisibilityProps<T> {
  tableElem: { tableApi: import('@tanstack/vue-table').Table<T> }
}
const props = defineProps<ColumnVisibilityProps<T>>()
const tableElem = toRef(() => props.tableElem)
const {
  filteredColumns,
  columnFilterQuery,
  visibleColumnsCount,
  totalColumnsCount,
  filteredColumnsCount,
  selectAllColumns,
  unselectAllColumns,
  resetColumnVisibility,
  toggleColumnVisibility,
} = useTableColumnManagement<T>(tableElem)
</script>

<template>
  <UPopover :popper="{ placement: 'bottom-end' }">
    <UButton label="Columns" color="neutral" variant="outline" trailing-icon="i-lucide-chevron-down" />

    <template #content>
      <div class="p-4 w-64">
        <div class="mb-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium">Columns</span>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              {{ visibleColumnsCount }} of {{ totalColumnsCount }} visible
            </span>
          </div>
          <UInput v-model="columnFilterQuery" placeholder="Filter columns..." icon="i-lucide-search" class="mb-3">
            <template v-if="columnFilterQuery?.length" #trailing>
              <UButton
                color="neutral" variant="link" size="sm" icon="i-lucide-circle-x" aria-label="Clear input"
                @click="columnFilterQuery = undefined"
              />
            </template>
          </UInput>
          <div v-if="columnFilterQuery" class="text-xs text-blue-600 dark:text-blue-400 text-right mb-2">
            {{ filteredColumnsCount }} of {{ totalColumnsCount }} shown
          </div>
        </div>

        <div class="max-h-60 overflow-y-auto space-y-1">
          <div
            v-for="column in filteredColumns" :key="column.id"
            class="flex items-center justify-between py-2 px-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded"
            :class="column.getIsVisible() ? 'font-medium' : 'text-gray-500 dark:text-gray-400'"
            @click="toggleColumnVisibility(column)"
          >
            <span class="text-sm truncate">{{ upperFirst(column.id || 'N/A') }}</span>
            <UIcon v-if="column.getIsVisible()" name="i-lucide-check" />
          </div>

          <div
            v-if="totalColumnsCount > 0 && filteredColumns.length === 0 && columnFilterQuery"
            class="text-sm text-gray-500 dark:text-gray-400 text-center py-4"
          >
            No columns found matching "{{ columnFilterQuery }}"
          </div>
        </div>

        <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-between">
          <div class="flex gap-2">
            <UButton size="xs" variant="ghost" @click="selectAllColumns">
              Select All
            </UButton>
            <UButton size="xs" variant="ghost" @click="unselectAllColumns">
              Unselect All
            </UButton>
          </div>
          <UButton size="xs" variant="ghost" @click="resetColumnVisibility">
            Reset
          </UButton>
        </div>
      </div>
    </template>
  </UPopover>
</template>
