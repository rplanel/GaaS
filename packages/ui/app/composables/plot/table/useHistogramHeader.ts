import type { GetHeaderParams, UseHeaderParams } from '../../../types/plotHeader'
import { PlotTableHeaderHistogram } from '#components'
import { log } from 'evlog/client'
import { ref } from 'vue'

export function useHistogramHeader(params: UseHeaderParams) {
  const { table, coordinator, ids } = params

  const hasSelection = ref<boolean>(false)

  function getHeader<T>(params: GetHeaderParams<T>) {
    const { column, label, variable, selection } = params
    if (!selection || !coordinator) {
      log.warn({
        action: 'histogram_header:missing_params',
        tag: 'useHistogramHeader',
        hasSelection: !!selection,
        hasCoordinator: !!coordinator,
      })
      return h('div', { class: 'w-full' }, 'No data available')
    }
    return h('div', { class: 'w-full' }, [
      h('div', { class: 'text-sm font-semibold' }, label),
      h(PlotTableHeaderHistogram, {
        itemIds: ids,
        table,
        selection,
        variable,
        coordinator,
        width: column.getSize() - 32,
      }),
    ])
  }
  return {
    hasSelection,
    getHeader,
  }
}
