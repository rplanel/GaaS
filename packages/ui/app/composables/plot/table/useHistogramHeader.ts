import type { GetHeaderParams, UseHeaderParams } from '../../../types/plotHeader'
import { PlotTableHeaderHistogram } from '#components'
import { ref } from 'vue'

export function useHistogramHeader(params: UseHeaderParams) {
  const { table, coordinator, ids } = params

  const hasSelection = ref<boolean>(false)

  function getHeader<T>(params: GetHeaderParams<T>) {
    const { column, label, variable, selection } = params
    if (!selection || !coordinator) {
      console.warn('Missing required parameters for histogram header:', { table, selection, coordinator })
      return h('div', { class: 'w-full' }, 'No data available')
    }
    return h('div', { class: 'w-full' }, [
      h('div', { class: 'text-sm font-semibold' }, label),
      // h('div', { class: 'text-sm font-semibold' }, label),
      // switch to filter data for getting nullish values
      // h(USwitch, {
      // }),
      h(PlotTableHeaderHistogram, {
        itemIds: ids,
        // 'onUpdate:itemIds': (newIds: string[]) => { console.log('Updated item IDs:', newIds) },
        table,
        selection,
        variable,
        coordinator,
        width: column.getSize() - 32,
      }),
    ])
  }
  // watch(ids, (newIds) => {
  //   console.log('IDs updated in histogram header:', newIds)
  // })
  return {
    hasSelection,
    getHeader,
  }
}
