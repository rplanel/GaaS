<script lang="ts" setup generic="T">
import type { TableColumn } from '@nuxt/ui'
import type { Coordinator, Selection } from '@uwdata/mosaic-core'
import type { FilterExpr, SelectExpr } from '@uwdata/mosaic-sql'
import { getPaginationRowModel } from '@tanstack/vue-table'
import { coordinator as defaultCoordinator, makeClient } from '@uwdata/mosaic-core'
import { Query } from '@uwdata/mosaic-sql'
import { upperFirst } from 'scule'

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
const tableData = ref<T[] | undefined>(undefined)
const isError = ref(false)
const isPending = ref(false)
const pagination = ref({
  pageIndex: 0,
  pageSize: 15,
})
const columnVisibility = ref({
  id: false,
})
const tableElem = useTemplateRef('tableElem')

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

const pending = computed(() => {
  // Check if the mosaic is pending
  return isPending.value
})

watchEffect((onCleanup) => {
  const selectClauseVal = toValue(selectClause)
  const tableName = toValue(table)
  const selectionVal = toValue(selection)
  const coordinatorVal = toValue(coordinator)

  if (!coordinatorVal || !selectionVal) {
    console.warn('Coordinator or selection is not defined.')
    return
  }
  if (!tableName) {
    console.warn('Table name is not defined.')
    return
  }
  if (!selectClauseVal) {
    console.warn('Select clause is not defined.')
    return
  }
  const client = makeClient({
    coordinator: coordinatorVal,
    selection: selectionVal,
    prepare: async () => {
      // Preparation work before the client starts.
      // Here we get the total number of rows in the table.

      const result = await coordinatorVal.query(
        Query.from(tableName).select(selectClauseVal),
      )
      // as QueryResult<T>
      tableData.value = result.toArray()
    },
    query: (predicate: FilterExpr) => {
    // Returns a query to retrieve the data.
    // The `predicate` is the selection's predicate for this client.
    // Here we use it to get the filtered count.
      return Query.from(tableName)
        .select(selectClauseVal)
        .where(predicate)
    },
    queryResult: (data) => {
    // The query result is available.
      tableData.value = data.toArray()
      isError.value = false
      isPending.value = false
    },
    queryPending: () => {
    // The query is pending.
      isPending.value = true
      isError.value = false
    },
    queryError: (err) => {
      // There is an error running the query.
      isPending.value = false
      isError.value = true
      throw createError(`Error running query: ${err.message}`)
    },
  })

  onCleanup(() => {
  // Cleanup when the component is unmounted or the coordinator changes.
    client.destroy()
  })
})
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
            <UDropdownMenu
              :ui="{ content: 'overflow-y-auto max-h-60' }"
              :items="
                tableElem?.tableApi
                  ?.getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => ({
                    label: upperFirst(column.id),
                    type: 'checkbox' as const,
                    checked: column.getIsVisible(),
                    onUpdateChecked(checked: boolean) {
                      tableElem?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked)
                    },
                    onSelect(e?: Event) {
                      e?.preventDefault()
                    },
                  }))
              "
              :content="{ align: 'end' }"
            >
              <UButton
                label="Columns"
                color="neutral"
                variant="outline"
                trailing-icon="i-lucide-chevron-down"
              />
            </UDropdownMenu>
          </div>
        </div>
      </div>
      <div v-if="columns">
        <UTable

          ref="tableElem"
          v-model:pagination="pagination"
          v-model:column-visibility="columnVisibility"
          :columns="columns"
          :data="tableData"
          :loading="pending"
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
            @update:page="(p) => tableElem?.tableApi?.setPageIndex(p - 1)"
          />
        </div>
      </div>
    </div>
  </ClientOnly>
</template>
