<script lang="ts" setup generic="T">
import type { TableColumn } from '@nuxt/ui'
import type { Table } from '@tanstack/vue-table'
import type { Coordinator, Selection } from '@uwdata/mosaic-core'
import type { SelectExpr } from '@uwdata/mosaic-sql'
import { getPaginationRowModel } from '@tanstack/vue-table'
import { coordinator as defaultCoordinator } from '@uwdata/mosaic-core'
import { upperFirst } from 'scule'
import { useMosaicData } from '../../composables/useMosaicData'
import { useTableColumnManagement } from '../../composables/useTableColumnManagement'

interface Props {
  table: string
  selection: Selection
  columns: TableColumn<T>[] | undefined
  coordinator?: Coordinator
}

const props = defineProps<Props>()
const propsCoordinator = toRef(() => props.coordinator)
const coordinator = computed(() => {
  const coordinatorVal = toValue(propsCoordinator)
  if (coordinatorVal) {
    return coordinatorVal
  }
  return defaultCoordinator()
})
const table = toRef(() => props.table)
const selection = toRef(() => props.selection)
const columns = toRef(() => props.columns)
const pagination = ref({
  pageIndex: 0,
  pageSize: 15,
})
const columnVisibility = ref({})
const tableElem = useTemplateRef<{ tableApi: Table<T> }>('tableElem')
const selectClause = computed(() => {
  // Generate the select clause based on the columns
  if (!columns.value) {
    return undefined
  }
  return columns.value.reduce((acc, col) => {
    const { accessorKey } = col
    if (accessorKey) {
      acc[accessorKey] = accessorKey
    }
    return acc
  }, {} as SelectExpr)
})

// Use composables
const {
  tableData,
  isPending,
} = useMosaicData<T>(table, selection, selectClause, coordinator)

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
  <ClientOnly>
    <div
      v-if="tableData"
      class="flex flex-col flex-1 w-full"
    >
      <div>
        <div class="grid grid-cols-4 justify-between items-center px-4 py-3.5">
          <div class="col-start-1 col-end-3">
            <PlotCount
              :table
              :selection
              :coordinator
            />
          </div>
          <div class="col-start-3 col-span-2 justify-self-end">
            <UPopover :popper="{ placement: 'bottom-end' }">
              <UButton
                label="Columns"
                color="neutral"
                variant="outline"
                trailing-icon="i-lucide-chevron-down"
              />

              <template #content>
                <div class="p-4 w-64">
                  <div class="mb-3">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-sm font-medium">Columns</span>
                      <span class="text-xs text-gray-500 dark:text-gray-400">
                        {{ visibleColumnsCount }} of {{ totalColumnsCount }} visible
                      </span>
                    </div>
                    <UInput
                      v-model="columnFilterQuery"
                      placeholder="Filter columns..."
                      icon="i-lucide-search"
                      class="mb-3"
                    >
                      <template v-if="columnFilterQuery?.length" #trailing>
                        <UButton
                          color="neutral"
                          variant="link"
                          size="sm"
                          icon="i-lucide-circle-x"
                          aria-label="Clear input"
                          @click="columnFilterQuery = undefined"
                        />
                      </template>
                    </UInput>
                    <div v-if="columnFilterQuery && filteredColumnsCount < allColumnsCount" class="text-xs text-blue-600 dark:text-blue-400 text-right mb-2">
                      {{ filteredColumnsCount }} of {{ totalColumnsCount }} shown
                    </div>
                  </div>

                  <div class="max-h-60 overflow-y-auto space-y-1">
                    <div
                      v-for="column in filteredColumns"
                      :key="column.id"
                      class="flex items-center justify-between py-2 px-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded"
                      :class="column.getIsVisible() ? 'font-medium' : 'text-gray-500 dark:text-gray-400'"
                      @click="toggleColumnVisibility(column)"
                    >
                      <span class="text-sm truncate">{{ upperFirst(column.id || "N/A") }}</span>
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
                      <UButton
                        size="xs"
                        variant="ghost"
                        @click="selectAllColumns"
                      >
                        Select All
                      </UButton>
                      <UButton
                        size="xs"
                        variant="ghost"
                        @click="unselectAllColumns"
                      >
                        Unselect All
                      </UButton>
                    </div>
                    <UButton
                      size="xs"
                      variant="ghost"
                      @click="resetColumnVisibility"
                    >
                      Reset
                    </UButton>
                  </div>
                </div>
              </template>
            </UPopover>
          </div>
        </div>
      </div>
      <div v-if="columns">
        <UTable

          ref="tableElem"
          v-model:pagination="pagination"
          v-model:column-visibility="columnVisibility"
          :columns
          :data="tableData"
          :loading="isPending"
          :pagination-options="{
            getPaginationRowModel: getPaginationRowModel(),
          }"
          class="flex-1 w-full"
          :ui="{
            base: 'table-fixed w-full',
            tbody: 'divide-x',
            tr: 'divide-x divide-default',
            td: 'truncate',
            th: 'truncate content-start',
          }"
        />
        <div class="flex justify-center border-t border-default pt-4">
          <UPagination
            :default-page="(tableElem?.tableApi?.getState().pagination.pageIndex || 0) + 1"
            :items-per-page="tableElem?.tableApi?.getState().pagination.pageSize"
            :total="tableElem?.tableApi?.getFilteredRowModel().rows.length"
            @update:page="(p: number) => tableElem?.tableApi?.setPageIndex(p - 1)"
          />
        </div>
      </div>
    </div>
  </ClientOnly>
</template>
