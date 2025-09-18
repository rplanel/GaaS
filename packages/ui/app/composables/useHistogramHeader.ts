import type { Coordinator } from '@uwdata/mosaic-core'
import type { GetHeaderParams, UseHeaderParams } from '../types/plotHeader'
import { coordinator as defaultCoordinator, DuckDBWASMConnector } from '@uwdata/mosaic-core'
import { h, onBeforeMount, ref, watch } from 'vue'
import PlotTableHeaderHistogram from '../components/plot/table/header/Histogram.vue'

export function useHistogramHeader(params: UseHeaderParams) {
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
  function getHeaderFn() {
    function _getHeader<T>(params: GetHeaderParams<T>): VNode {
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
    return _getHeader
  }

  const getHeader = ref<ReturnType<typeof getHeaderFn>>(getHeaderFn())
  watch(mosaicCoordinator, () => {
    getHeader.value = getHeaderFn()
  })
  return {
    getHeader,
  }
}
