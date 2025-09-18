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

import type { Coordinator } from '@uwdata/mosaic-core'
import type { GetHeaderParams, UseHeaderParams } from '../types/plotHeader'
import { coordinator as defaultCoordinator, DuckDBWASMConnector } from '@uwdata/mosaic-core'
import { h, onBeforeMount, ref, watch } from 'vue'
import PlotTableHeaderCategory from '../components/plot/table/header/Category.vue'

export function useCategoryHeader(params: UseHeaderParams) {
  const { table, selection, coordinator } = params

  const mosaicCoordinator = ref<Coordinator | undefined>(coordinator)
  onBeforeMount(() => {
    if (mosaicCoordinator.value === undefined) {
      const wasm = new DuckDBWASMConnector()
      const c = defaultCoordinator()
      c.databaseConnector(wasm)
      mosaicCoordinator.value = c
    }
  })

  // Wrap _getHeader in a function to capture the latest mosaicCoordinator value
  function _getHeader<T>(params: GetHeaderParams<T>): VNode {
    const { column, label, variable } = params
    const mosaicCoordinatorVal = mosaicCoordinator.value as Coordinator | undefined
    if (!selection || !mosaicCoordinatorVal) {
      console.warn('Missing required parameters for category header:', { table, selection, coordinator })
      return h('div', { class: 'w-full' }, 'No data available')
    }
    return h('div', { class: 'w-full' }, [
      h('div', { class: 'text-sm font-semibold' }, label),
      h(PlotTableHeaderCategory, {
        table,
        selection,
        variableId: variable,
        coordinator: mosaicCoordinatorVal,
        width: column.getSize() - 32,
      }),
    ])
  }

  const getHeader = ref<typeof _getHeader>(_getHeader)

  watch(mosaicCoordinator, () => {
    const getHeaderFn = () => _getHeader

    getHeader.value = getHeaderFn()
  })

  return {
    getHeader,
  }
}
