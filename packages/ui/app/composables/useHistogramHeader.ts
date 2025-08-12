import type { GetHeaderParams, UseHeaderParams } from '../types/plotHeader'
import { h } from 'vue'
import PlotTableHeaderHistogram from '../components/plot/table/header/Histogram.vue'

export function useHistogramHeader(params: UseHeaderParams) {
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
