import type { GetHeaderParams, UseHeaderParams } from '../types/plotHeader'
import { h } from 'vue'
import PlotTableHeaderHistogram from '../components/plot/table/header/Histogram.vue'

export function useHistogramHeader(params: UseHeaderParams) {
  const { table, selection, coordinator } = params
  function getHeader<T>(params: GetHeaderParams<T>): VNode {
    const { column, label, variable } = params
    if (!selection || !coordinator) {
      console.warn('Missing required parameters for histogram header:', { table, selection, coordinator })
      return h('div', { class: 'w-full' }, 'No data available')
    }
    return h('div', { class: 'w-full' }, [
      h('div', { class: 'text-sm font-semibold' }, label),
      // switch to filter data for getting nullish values
      // h(USwitch, {
      // }),
      h(PlotTableHeaderHistogram, {
        table,
        selection,
        variable,
        coordinator,
        width: column.getSize() - 32,
      }),
    ])
  }
  return {
    getHeader,
  }
}
