import type { GetHeaderParams, UseHeaderParams } from '../../../types/plotHeader'
import { PlotTableHeaderHistogram } from '#components'
import { ref } from 'vue'

export function useHistogramHeader(params: UseHeaderParams) {
  const { table, selection, coordinator } = params

  const hasSelection = ref<boolean>(false)

  // function getHeaderFn() {
  //   function _getHeader<T>(params: GetHeaderParams<T>): VNode {
  //     const { column, label, variable } = params
  //     // const mosaicCoordinatorVal = mosaicCoordinator.value as Coordinator | undefined
  //     if (!selection || !coordinator) {
  //       console.warn('Missing required parameters for histogram header:', { table, selection, coordinator })
  //       return h('div', { class: 'w-full' }, 'No data available')
  //     }
  //     return h('div', { class: 'w-full' }, [
  //       h('div', { class: 'text-sm font-semibold' }, label),
  //       // switch to filter data for getting nullish values
  //       // h(USwitch, {
  //       // }),
  //       h(PlotTableHeaderHistogram, {
  //         table,
  //         selection,
  //         variable,
  //         coordinator,
  //         width: column.getSize() - 32,
  //       }),
  //     ])
  //   }
  //   return _getHeader
  // }

  // const getHeader = ref<ReturnType<typeof getHeaderFn>>(getHeaderFn())
  // watch(coordinator, () => {
  //   getHeader.value = getHeaderFn()
  // })

  function getHeader<T>(params: GetHeaderParams<T>) {
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
    hasSelection,
    getHeader,
  }
}
