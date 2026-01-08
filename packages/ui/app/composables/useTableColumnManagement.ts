import type { Column, Table } from '@tanstack/vue-table'
import type { Ref } from 'vue'

/**
 * Composable for managing table column visibility and filtering
 * @param tableElem - A Ref to the table element containing the Table API
 * @returns An object containing state and actions for column management
 * @template T - The type of data in the table rows
 *
 */

export function useTableColumnManagement<T>(tableElem: Ref<{ tableApi: Table<T> } | null>) {
  /**
   * Columns filtered based on the current column filter query.
   * This is a reactive reference that updates whenever the filter query changes.
   * @type {Ref<Column<T, unknown>[]>}
   */
  const filteredColumns = ref<Column<T, unknown>[]>([])

  /**
   * Query string for filtering columns by their ID.
   * When set, `filteredColumns` will only include columns whose IDs
   * contain this substring (case-insensitive).
   * @type {Ref<string | undefined>}
   */
  const columnFilterQuery = ref<string | undefined>(undefined)
  const visibleColumns = ref<Column<T, unknown>[]>([])
  const visibleColumnsCount = ref<number>(0)
  const totalColumnsCount = ref<number>(0)
  const filteredColumnsCount = computed(() => filteredColumns.value.length)

  const getTableApi = () => toValue(tableElem)?.tableApi

  /**
   * Updates column counts for display
   */
  function updateColumnCounts() {
    const tableApi = getTableApi()
    if (!tableApi)
      return

    const allColumns = tableApi
      .getAllColumns()
      .filter(col => col.getCanHide())

    const visibleCols = allColumns
      .filter(col => col.getIsVisible())
    visibleColumns.value = visibleCols as Column<T, unknown>[]
    visibleColumnsCount.value = visibleCols.length
  }

  /**
   * Makes all hideable columns visible in the table.
   */
  async function selectAllColumns() {
    const tableApi = getTableApi()
    if (!tableApi)
      return

    tableApi.toggleAllColumnsVisible(true)
    await nextTick()
    updateColumnCounts()
  }

  /**
   * Hides all hideable columns in the table.
   */
  async function unselectAllColumns() {
    const tableApi = getTableApi()
    if (!tableApi)
      return

    tableApi.toggleAllColumnsVisible(false)
    await nextTick()
    updateColumnCounts()
  }

  /**
   * Resets column visibility to default state
   */
  async function resetColumnVisibility() {
    const tableApi = getTableApi()
    if (!tableApi)
      return

    tableApi.resetColumnVisibility()
    await nextTick()
    updateColumnCounts()
  }

  /**
   * Toggles individual column visibility
   */
  async function toggleColumnVisibility(column: Column<T, unknown>) {
    column.toggleVisibility()
    await nextTick()
    updateColumnCounts()
  }

  // Watch for table element changes
  watch(tableElem, () => {
    const tableApi = getTableApi()
    if (tableApi) {
      const allColumns = tableApi
        .getAllColumns()
        .filter(col => col.getCanHide())
      filteredColumns.value = allColumns
      totalColumnsCount.value = allColumns.length
      visibleColumnsCount.value = allColumns
        .filter(col => col.getIsVisible())
        .length
    }
  })

  // Watch for column filter changes
  watch(columnFilterQuery, (newQuery) => {
    const tableApi = getTableApi()
    if (!tableApi)
      return

    const availableColumns = tableApi.getAllColumns()

    if (!newQuery) {
      filteredColumns.value = availableColumns
      columnFilterQuery.value = undefined
      return
    }

    const lowerQuery = newQuery.toLowerCase()
    filteredColumns.value = availableColumns.filter((col) => {
      return col.id?.toLowerCase().includes(lowerQuery)
    })
  })

  return {
    // State
    filteredColumns: readonly(filteredColumns),
    columnFilterQuery,
    visibleColumns: readonly(visibleColumns),
    visibleColumnsCount: readonly(visibleColumnsCount),
    totalColumnsCount: readonly(totalColumnsCount),
    filteredColumnsCount,

    // Actions
    selectAllColumns,
    unselectAllColumns,
    resetColumnVisibility,
    toggleColumnVisibility,
    updateColumnCounts,
  }
}
