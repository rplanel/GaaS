import type { Column } from '@tanstack/vue-table'
import type { Selection } from '@uwdata/mosaic-core'
import { PlotTableHeaderHistogram } from '#components'

interface GetHeaderParams<T> {
  column: Column<T>
  label: string
  variable: string
}

interface UseHistogramHeaderParams {
  table: string
  selection: Selection
}

export function useHistogramHeader(params: UseHistogramHeaderParams) {
  const { table, selection } = params
  function getHeader<T>(params: GetHeaderParams<T>): VNode {
    const { column, label, variable } = params
    return h('div', { class: 'w-full' }, [
      h('div', { class: 'text-sm font-semibold' }, label),
      // switch to filter data for getting nullish values
      // h(USwitch, {
      // }),
      h(PlotTableHeaderHistogram, {
        table,
        selection,
        variable,
        width: column.getSize() - 32,
      }),
    ])
  }
  return {
    getHeader,
  }
}
