/**
 * A composable function that creates category headers with embedded histogram visualizations for table columns.
 *
 * @param params - Configuration object for the category header
 * @param params.table - The name of the data table to query
 * @param params.selection - The Mosaic selection object for interactive data filtering
 *
 * @returns An object containing the getHeader function
 *
 * @example
 * ```typescript
 * const { getHeader } = useCategoryHeader({
 *   table: 'myDataTable',
 *   selection: mySelection
 * });
 *
 * const headerVNode = getHeader({
 *   column: tableColumn,
 *   label: 'Category Name',
 *   variable: 'categoryVariable'
 * });
 * ```
 */
import type { Column } from '@tanstack/vue-table'
import type { Selection } from '@uwdata/mosaic-core'
import { coordinator as defaultCoordinator } from '@uwdata/mosaic-core'
import { h } from 'vue'
import PlotTableHeaderCategory from '../components/plot/table/header/Category.vue'

interface GetHeaderParams<T> {
  column: Column<T>
  label: string
  variable: string
}

interface UseHistogramHeaderParams {
  table: string
  selection: Selection
}

const coordinator = defaultCoordinator()

export function useCategoryHeader(params: UseHistogramHeaderParams) {
  const { table, selection } = params
  function getHeader<T>(params: GetHeaderParams<T>): VNode {
    const { column, label, variable } = params
    return h('div', { class: 'w-full' }, [
      h('div', { class: 'text-sm font-semibold' }, label),
      h(PlotTableHeaderCategory, {
        table,
        selection,
        variableId: variable,
        coordinator,
        width: column.getSize() - 32,
      }),
    ])
  }
  return {
    getHeader,
  }
}
