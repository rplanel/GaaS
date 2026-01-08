<script lang="ts" setup generic="T">
import type { AccessorKeyColumnDef, Table } from '@tanstack/vue-table'
import type { Coordinator, Selection } from '@uwdata/mosaic-core'
import type { ExprValue } from '@uwdata/mosaic-sql'
import { getPaginationRowModel } from '@tanstack/vue-table'
import { useMosaicData } from '../../composables/useMosaicData'

interface Props {
  table: string
  selection: Selection
  columns: AccessorKeyColumnDef<T>[] | undefined
  coordinator: Coordinator
}

const props = defineProps<Props>()
const columnVisibility = defineModel('columnVisibility', {
  type: Object as () => Record<string, boolean>,
  default: () => ({}),
})
const { coordinator, selection } = props

const table = toRef(() => props.table)
// const selection = toRef(() => props.selection)
const columns = props.columns
const pagination = ref({
  pageIndex: 0,
  pageSize: 15,
})
const tableElem = useTemplateRef<{ tableApi: Table<T> }>('tableElem')

const columnVisibilityMap = computed(() => {
  // Convert columnVisibility object to Map for easier access
  // if no entry in columnVisibility, the column is visible
  const columnVisibilityVal = toValue(columnVisibility)
  const currentColumnVisibilityMap = new Map()
  if (!columnVisibilityVal) {
    return currentColumnVisibilityMap
  }
  Object.entries(columnVisibilityVal).forEach(([key, value]) => {
    currentColumnVisibilityMap.set(key, value)
  })
  return currentColumnVisibilityMap
})

const selectClause = computed(() => {
  // Generate the select clause based on the columns

  // if no entry in columnVisibility, the column is visible
  const columnVisibilityMapVal = toValue(columnVisibilityMap)
  return columns?.reduce((acc, col) => {
    const { accessorKey } = col
    if (accessorKey && (!columnVisibilityMapVal.has(accessorKey) || columnVisibilityMapVal.get(accessorKey) === true)) {
      const accessorKeyString = accessorKey.toString()
      acc[accessorKeyString] = accessorKeyString
    }
    return acc
  }, {} as Record<string, ExprValue>)
})

const {
  tableData,
} = useMosaicData<T>({
  table,
  selection,
  selectClause,
  coordinator,
})
</script>

<template>
  <div v-if="tableData" class="flex flex-col">
    <div class="grid grid-cols-4 justify-between items-center px-4 py-3.5">
      <div class="col-start-1 col-end-3">
        <PlotCount :table :selection :coordinator />
      </div>
      <div class="col-start-3 col-span-2 justify-self-end">
        <TableColumnVisibility :table-elem="tableElem" />
      </div>
    </div>
    <div v-if="columns">
      <pre>{{ selectClause }}</pre>
      <div class="px-4">
        <div class="overflow-x-auto scrollbar-hide">
          <UTable
            ref="tableElem" v-model:pagination="pagination" v-model:column-visibility="columnVisibility" :columns
            :data="tableData" sticky :pagination-options="{
              getPaginationRowModel: getPaginationRowModel(),
            }" :ui="{
              root: 'min-w-full',
              base: 'min-w-max table-fixed',
              td: 'min-w-[150px]',
              th: 'min-w-[150px]',
            }"
          />
        </div>
      </div>
      <div class="flex justify-left px-3 border-t border-default pt-4">
        <UPagination
          :default-page="(tableElem?.tableApi?.getState().pagination.pageIndex || 0) + 1"
          :items-per-page="tableElem?.tableApi?.getState().pagination.pageSize"
          :total="tableElem?.tableApi?.getFilteredRowModel().rows.length"
          @update:page="(p: number) => tableElem?.tableApi?.setPageIndex(p - 1)"
        />
      </div>
    </div>
  </div>
</template>
