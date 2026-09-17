import type { GetHeaderParams } from '../../../types/plotHeader'
import { log } from 'evlog/client'
import PlotTableHeaderCategory from '../../../components/plot/table/header/Category.vue'

import PlotTableHeaderHistogram from '../../../components/plot/table/header/Histogram.vue'

export function getHistogramHeader<T>(params: GetHeaderParams<T>) {
  const { column, label, variable, table, selection, coordinator } = params
  if (!selection || !coordinator) {
    log.warn({
      action: 'table_header:missing_params',
      tag: 'getHistogramHeader',
      hasSelection: !!selection,
      hasCoordinator: !!coordinator,
    })
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

export function getCategoryHeader<T>(params: GetHeaderParams<T>) {
  const { column, label, variable, table, selection, coordinator } = params
  // const mosaicCoordinatorVal = coordinator as
  if (!selection || !coordinator) {
    log.warn({
      action: 'table_header:missing_params',
      tag: 'getCategoryHeader',
      hasSelection: !!selection,
      hasCoordinator: !!coordinator,
    })
    return h('div', { class: 'w-full' }, 'No data available')
  }
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
