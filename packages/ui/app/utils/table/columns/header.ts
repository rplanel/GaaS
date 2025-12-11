import type { Column } from '@tanstack/vue-table'
import type { Coordinator, Selection } from '@uwdata/mosaic-core'
import PlotTableHeaderCategory from '../../../components/plot/table/header/Category.vue'
import PlotTableHeaderHistogram from '../../../components/plot/table/header/Histogram.vue'

export interface GetHeaderParams<T> {
  column: Column<T>
  label: string
  variable: string
  table: string
  selection: Selection
  coordinator: Coordinator
}

export function getHistogramHeader<T>(params: GetHeaderParams<T>) {
  const { column, label, variable, table, selection, coordinator } = params
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

export function getCategoryHeader<T>(params: GetHeaderParams<T>) {
  const { column, label, variable, table, selection, coordinator } = params
  // const mosaicCoordinatorVal = coordinator as
  if (!selection || !coordinator) {
    console.warn('Missing required parameters for category header:', { table, selection, coordinator })
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
